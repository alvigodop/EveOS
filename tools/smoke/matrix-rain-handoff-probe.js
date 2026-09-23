'use strict';

async function probeRainHandoff(page) {
    return page.evaluate(() => {
        const originalRandom = Math.random;
        const savedDrops = rainDrops.slice();
        const savedChars = rainDropsChars.slice();
        const savedOpening = rainOpeningWave;
        const savedPaused = paused;
        try {
            let seed = 0;
            Math.random = () => ((seed = (seed + 17) % 97) / 97);
            paused = false;
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
            const postOpeningPhases = new Set(
                rainDrops.map(drop => Math.floor(drop))
            ).size;

            rainOpeningWave = false;
            const belowBottom = viewHeight / fontSize + 2;
            rainDrops[0] = belowBottom;
            Math.random = () => 0;
            draw();
            const heldBelowBottom = rainDrops[0];

            rainDrops[0] = belowBottom;
            Math.random = () => 1;
            draw();
            const probabilisticReset = rainDrops[0];

            return {
                openingFinished,
                postOpeningPhases,
                edgeInk,
                belowBottom,
                heldBelowBottom,
                probabilisticReset
            };
        } finally {
            Math.random = originalRandom;
            rainDrops = savedDrops;
            rainDropsChars = savedChars;
            rainOpeningWave = savedOpening;
            paused = savedPaused;
        }
    });
}

module.exports = { probeRainHandoff };
