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

            return {
                openingFinished,
                openingChangedChars,
                postOpeningPhases,
                edgeInk,
                independentlyRestarted,
                stillWaitingBelow,
                columnCount: rainDrops.length
            };
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
