'use strict';

async function probeRainHandoff(page) {
    return page.evaluate(() => {
        const originalRandom = Math.random;
        const savedDrops = rainDrops.slice();
        const savedChars = rainDropsChars.slice();
        const savedOpening = rainOpeningWave;
        const savedPaused = paused;
        const savedLineChangeRate = lineChangeRate;
        try {
            let seed = 0;
            Math.random = () => ((seed = (seed + 17) % 97) / 97);
            paused = false;
            lineChangeRate = 1;
            rainOpeningWave = true;
            rainDrops.fill(viewHeight / fontSize);
            rainDropsChars.fill('M');
            ctx.clearRect(0, 0, viewWidth, viewHeight);
            draw();

            const edgePixels = ctx.getImageData(
                0, Math.max(0, viewHeight - fontSize),
                Math.floor(viewWidth), Math.min(fontSize, viewHeight)
            ).data;
            let edgeInk = 0;
            for (let index = 1; index < edgePixels.length; index += 4) {
                if (edgePixels[index] > 20) edgeInk++;
            }

            const openingFinished = !rainOpeningWave;
            const openingChangedChars = rainDropsChars.filter(char => char !== 'M').length;
            const postOpeningPhases = new Set(
                rainDrops.map(drop => Math.floor(drop))
            ).size;

            // Prove the handoff releases columns independently. Disable the
            // ordinary line-change random call so the first random sample belongs
            // to the first bottom-reset decision and every later one declines.
            lineChangeRate = Number.MAX_SAFE_INTEGER;
            let resetSample = 0;
            Math.random = () => (resetSample++ === 0 ? 1 : 0);
            draw();

            const bottomRow = viewHeight / fontSize;
            const independentlyRestarted = rainDrops.filter(drop => drop < bottomRow).length;
            const stillWaitingBelow = rainDrops.filter(drop => drop >= bottomRow).length;

            // Isolate one normal-rain head and capture its terminal draw call.
            // The head must emit one faint endpoint glow at the measured safe
            // baseline, then continue logically without any further visible
            // glyph overflowing below that baseline.
            const originalFillText = ctx.fillText;
            const terminalCalls = [];
            ctx.fillText = function (text, x, y) {
                terminalCalls.push({
                    text, x, y,
                    alpha: ctx.globalAlpha,
                    shadowBlur: ctx.shadowBlur
                });
                return originalFillText.call(ctx, text, x, y);
            };
            try {
                rainOpeningWave = false;
                lineChangeRate = Number.MAX_SAFE_INTEGER;
                Math.random = () => 0;
                rainDrops.fill(bottomRow + 10);
                rainDropsChars.fill('M');

                const metrics = ctx.measureText('M');
                const glyphDescent = Number.isFinite(metrics.actualBoundingBoxDescent)
                    ? Math.max(1, metrics.actualBoundingBoxDescent)
                    : fontSize * 0.4;
                const endpointGlow = RAIN_ENDPOINT_GLOW;
                const landingY = getRainLandingY('M');
                const stepPx = adjustDensity(1, 'continuous') * fontSize;
                const crossingDrawY = landingY - stepPx / 2;
                rainDrops[0] = (crossingDrawY + fontSize / 2) / fontSize;

                terminalCalls.length = 0;
                draw();
                const crossingCalls = terminalCalls.slice();
                terminalCalls.length = 0;
                draw();
                const afterCrossingCalls = terminalCalls.slice();

                const endpointCall = crossingCalls.find(call =>
                    Math.abs(call.y - landingY) < 0.01);
                const bridgeCall = crossingCalls.find(call =>
                    Math.abs(call.y - crossingDrawY) < 0.01);
                const overflowCalls = crossingCalls.concat(afterCrossingCalls)
                    .filter(call => call.y > landingY + 0.01);

                return {
                    openingFinished,
                    openingChangedChars,
                    postOpeningPhases,
                    edgeInk,
                    independentlyRestarted,
                    stillWaitingBelow,
                    columnCount: rainDrops.length,
                    landingY,
                    endpointEdgeGap: viewHeight - (landingY + glyphDescent),
                    endpointBoundsSafe:
                        landingY + glyphDescent <= viewHeight + 0.01,
                    endpointGlowReachesEdge:
                        landingY + glyphDescent + endpointGlow > viewHeight,
                    endpointGlowSeen: Boolean(endpointCall
                        && endpointCall.alpha <= 0.21
                        && endpointCall.shadowBlur >= endpointGlow),
                    transitionBridgeSeen: Boolean(bridgeCall
                        && bridgeCall.alpha <= 0.13
                        && bridgeCall.shadowBlur === 0),
                    overflowCallCount: overflowCalls.length
                };
            } finally {
                ctx.fillText = originalFillText;
            }
        } finally {
            Math.random = originalRandom;
            rainDrops = savedDrops;
            rainDropsChars = savedChars;
            rainOpeningWave = savedOpening;
            paused = savedPaused;
            lineChangeRate = savedLineChangeRate;
        }
    });
}

module.exports = { probeRainHandoff };
