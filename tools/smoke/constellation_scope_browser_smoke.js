const {
    chromium,
    buildSeedPayload,
    prepareSeededPage
} = require('./constellation_scope_browser_smoke.shared');
const { runConstellationSetup } = require('./constellation_scope_browser_smoke.setup');
const { runConstellationControls } = require('./constellation_scope_browser_smoke.controls');
const { runConstellationUnidex } = require('./constellation_scope_browser_smoke.unidex');

async function main() {
    const payload = buildSeedPayload();
    const errors = [];
    const consoleErrors = [];
    let browser = null;

    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

        page.on('pageerror', (error) => {
            errors.push(error && error.stack ? error.stack : String(error));
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await prepareSeededPage(page, payload);

        const setupResult = await runConstellationSetup(page);
        const controlsResult = await runConstellationControls(page, setupResult);
        const unidexResult = await runConstellationUnidex(page, {
            anchoredStats: controlsResult.anchoredStats,
            canvasBox: setupResult.canvasBox,
            categorySeed: setupResult.categorySeed,
            folderDragSeed: controlsResult.folderDragSeed,
            zoomStats: setupResult.zoomStats
        });
        const result = {
            topbarStyles: setupResult.topbarStyles,
            workspaceStats: setupResult.workspaceStats,
            cardStats: setupResult.cardStats,
            zoomStats: setupResult.zoomStats,
            draggedNode: controlsResult.draggedNode,
            panStats: unidexResult.panStats,
            deepZoomStats: unidexResult.deepZoomStats,
            allStats: unidexResult.allStats,
            cardsStageStats: unidexResult.cardsStageStats,
            entriesStageStats: unidexResult.entriesStageStats,
            topbarHiddenInUnidex: unidexResult.topbarHiddenInUnidex
        };

        if (errors.length) {
            throw new Error(`Page errors detected:
${errors.join('\n\n')}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Tracking Prevention blocked access to storage/i.test(entry)) return false;
            if (/Failed to load resource/i.test(entry)) return false;
            if (/Access to image at/i.test(entry)) return false;
            if (/Access to fetch at/i.test(entry)) return false;
            return true;
        });
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:
${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`CONSTELLATION_SCOPE_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        if (browser) await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
