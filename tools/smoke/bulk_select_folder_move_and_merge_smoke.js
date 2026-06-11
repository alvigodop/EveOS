// Bulk folder-move and merge browser smoke orchestration.
const { chromium } = require('playwright');
const { FILE_URL, waitForApp } = require('./bulk_select_folder_move_and_merge_smoke.fixture');
const {
    runCardMoveWholeFolderPhase,
    runCardMovePartialFolderPhase,
    runTabMovePartialCardPhase,
    runBulkMergeTitleModePhase,
    runBulkMergeAllModePhase
} = require('./bulk_select_folder_move_and_merge_smoke.move-phases');
const {
    runPickerRenderPhase,
    runSectionCollapsePhase,
    runTabTreePhase,
    runFolderTargetPhase
} = require('./bulk_select_folder_move_and_merge_smoke.ui-phases');

async function main() {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });

    try {
        await page.goto(FILE_URL);
        await waitForApp(page);

        console.log('Phase 1: Bulk Card-move whole folder');
        await runCardMoveWholeFolderPhase(page);
        console.log('  ✓ folder transferred, no ghost in source');

        console.log('Phase 2: Bulk Card-move partial folder selection');
        await runCardMovePartialFolderPhase(page);
        console.log('  partial selection leaves the source folder intact');

        console.log('Phase 3: Bulk Tab-move partial card with whole folder');
        await runTabMovePartialCardPhase(page);
        console.log('  ✓ source ghost folder removed, target has folder');

        console.log('Phase 4: Bulk Merge — title mode');
        await runBulkMergeTitleModePhase(page);
        console.log('  ✓ duplicates collapsed into single base');

        console.log('Phase 5: Bulk Merge — all-as-one mode (different titles)');
        await runBulkMergeAllModePhase(page);
        console.log('  ✓ different-title selection collapsed into picked base');

        console.log('Phase 6: Picker render + click + filter');
        await runPickerRenderPhase(page);
        console.log('  ✓ rows render with counts, click selects, filter narrows');

        console.log('Phase 7: Section collapse/expand');
        await runSectionCollapsePhase(page);
        console.log('  ✓ radio drives section state, chevron toggles independently');

        console.log('Phase 8: Tab picker tree (subtabs collapsible)');
        await runTabTreePhase(page);
        console.log('  ✓ subtabs hidden by default, chevron expands, filter auto-expands');

        console.log('Phase 9: Card picker exposes folders as targets');
        await runFolderTargetPhase(page);
        console.log('  ✓ nested folder picked → bookmarks land inside that folder');

        console.log('All bulk-select folder-move + merge smoke checks passed.');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
