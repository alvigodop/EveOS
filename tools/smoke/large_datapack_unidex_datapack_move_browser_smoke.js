const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.toggleBulkMode === 'function'
        && typeof window.confirmBulkTabMove === 'function'
        && !!window.UnidexView?.setEntriesDensityMode
        && !!window.EveOS?.SearchAdvanced?.Index?.rebuild
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openGateway
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openCardInternals
        && typeof window.getLiveLinks === 'function'
        && Array.isArray(window.getLiveLinks())
        && window.getLiveLinks().length > 0
    ), undefined, { timeout: 180000 });
}

async function seedLargeDatapack(page) {
    await page.evaluate(async () => {
        try {
            localStorage.clear();
        } catch (_) {
            // file:// storage can be unavailable.
        }

        const workspaces = [];
        const links = [];
        const categoryOrderByWorkspace = {};
        const bookmarkFolders = {};

        for (let workspaceIndex = 0; workspaceIndex < 6; workspaceIndex += 1) {
            const workspaceId = `ws${workspaceIndex}`;
            workspaces.push({
                id: workspaceId,
                name: `Stress Tab ${workspaceIndex}`,
                icon: 'folder',
                subTabs: []
            });
            categoryOrderByWorkspace[workspaceId] = [];

            for (let cardIndex = 0; cardIndex < 18; cardIndex += 1) {
                const categoryName = `Card ${workspaceIndex}-${cardIndex}`;
                categoryOrderByWorkspace[workspaceId].push(categoryName);
                const scopedKey = `${workspaceId}::${categoryName}`;
                bookmarkFolders[scopedKey] = {
                    nodes: [
                        { id: `folder-${workspaceIndex}-${cardIndex}`, name: `Folder ${workspaceIndex}-${cardIndex}`, parentId: '', order: 0 }
                    ],
                    settings: { clickBehaviorMode: 'inherit' }
                };

                const bookmarkCount = workspaceIndex === 0 && cardIndex === 0 ? 150 : 12;
                for (let bookmarkIndex = 0; bookmarkIndex < bookmarkCount; bookmarkIndex += 1) {
                    links.push({
                        id: `link-${workspaceIndex}-${cardIndex}-${bookmarkIndex}`,
                        title: `Stress Bookmark ${workspaceIndex}-${cardIndex}-${bookmarkIndex}`,
                        url: `https://stress.example/${workspaceIndex}/${cardIndex}/${bookmarkIndex}`,
                        workspace: workspaceId,
                        category: categoryName,
                        folderId: bookmarkIndex % 3 === 0 ? `folder-${workspaceIndex}-${cardIndex}` : '',
                        identifiers: bookmarkIndex % 2 === 0 ? ['reading'] : ['research'],
                        notes: bookmarkIndex === 0 ? 'Long note seed for datapack view state smoke.' : ''
                    });
                }
            }
        }

        window.config = config = {
            activeWorkspace: 'ws0',
            viewMode: 'unidex',
            workspaces,
            categoryOrder: categoryOrderByWorkspace.ws0.slice(),
            categoryOrderByWorkspace,
            bookmarkIdentifiers: [
                { id: 'reading', label: 'Reading', icon: '', color: '#4f8cff', description: 'Reading queue' },
                { id: 'research', label: 'Research', icon: '', color: '#f2b94b', description: 'Research queue' }
            ],
            unidexTabsUnified: true,
            unidexEntriesDensity: 'atlas',
            unidexEntriesGroupMode: 'identifiers',
            unidexEntriesLayout: 'grid',
            showInactiveTabs: true,
            showHiddenSidebarGroups: true,
            collapsedTabs: [],
            linksCollapsed: []
        };
        window.links = links;
        window.bookmarkFolders = bookmarkFolders;

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.__largeDatapackSmoke = { saveDataCalls: 0, moveEvents: [] };
        const originalSaveData = window.saveData;
        window.saveData = function smokeSaveData(payload) {
            window.__largeDatapackSmoke.saveDataCalls += 1;
            window.__largeDatapackSmoke.lastSaveData = JSON.parse(JSON.stringify(payload || {}));
            return originalSaveData.apply(this, arguments);
        };
        window.addEventListener('eve:bulk-bookmark-move', (event) => {
            window.__largeDatapackSmoke.moveEvents.push(JSON.parse(JSON.stringify(event.detail || {})));
        });

        await window.EveOS.SearchAdvanced.Index.rebuild({
            reason: 'large-datapack-unidex-move-smoke-seed',
            force: true
        });
        window.renderSidebar();
        window.renderDashboard();
    });
}

async function assertUnidexLargeView(page) {
    await page.waitForSelector('.unidex-shell .unidex-entries.is-density-atlas', { timeout: 25000 });
    await page.waitForSelector('.unidex-identifier-group', { timeout: 25000 });

    const unidexState = await page.evaluate(() => ({
        density: window.config.unidexEntriesDensity,
        groupMode: window.config.unidexEntriesGroupMode,
        renderedEntries: document.querySelectorAll('.unidex-entry-item.is-density-atlas').length,
        identifierGroups: document.querySelectorAll('.unidex-identifier-group').length,
        gridClass: document.querySelector('.unidex-entries')?.className || '',
        megaPerfMode: !!window._eveMegaPerfMode
    }));

    if (unidexState.renderedEntries < 1000 || unidexState.identifierGroups < 2) {
        throw new Error(`Expected large Unidex identifier/atlas view to render dense entries: ${JSON.stringify(unidexState)}`);
    }
    if (!unidexState.gridClass.includes('is-grid-layout') || unidexState.density !== 'atlas' || unidexState.groupMode !== 'identifiers') {
        throw new Error(`Expected Unidex density/group/layout state to hold: ${JSON.stringify(unidexState)}`);
    }
}

async function assertDatapackViewLargeCaps(page) {
    await page.evaluate(() => {
        window.openExpandedSearchModal({ autoSearch: false });
        window.EveOS.SearchAdvanced.DatapackView.openGateway({ scope: { workspaceId: 'ws0' } });
    });
    await page.waitForSelector('#nxDatapackViewPanel', { timeout: 15000 });

    const gatewayState = await page.evaluate(() => {
        const panel = document.getElementById('nxDatapackViewPanel');
        const state = JSON.parse(panel.querySelector('.nx-dv-json pre')?.textContent || '{}');
        return {
            counts: state.counts,
            cardCount: Array.isArray(state.cards) ? state.cards.length : 0,
            jsonText: panel.querySelector('.nx-dv-json pre')?.textContent || ''
        };
    });
    if (gatewayState.counts.cards !== 18 || gatewayState.cardCount !== 18) {
        throw new Error(`Expected ws0 gateway to expose card summaries only: ${JSON.stringify(gatewayState.counts)}`);
    }
    if (gatewayState.jsonText.includes('https://stress.example/0/0/0')) {
        throw new Error('Datapack gateway leaked raw bookmark URLs for a large card.');
    }

    await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.openCardInternals('ws0', 'Card 0-0'));
    await page.waitForSelector('.nx-dv-micro-overlay', { timeout: 15000 });
    const microState = await page.evaluate(() => {
        const overlay = document.querySelector('.nx-dv-micro-overlay');
        return {
            text: overlay?.textContent || '',
            rows: overlay ? overlay.querySelectorAll('.nx-dv-bookmark-row').length : 0
        };
    });
    if (microState.rows !== 120 || !microState.text.includes('30 omitted by safety cap')) {
        throw new Error(`Expected card internals to cap huge bookmark lists safely: ${JSON.stringify(microState)}`);
    }
    await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.closeCardInternals());
}

async function assertLargeBulkMove(page) {
    const movedLinkId = 'link-0-0-1';
    await page.evaluate(() => {
        window.config.viewMode = 'grid';
        window.config.activeWorkspace = 'ws0';
        window.renderDashboard();
    });
    await page.waitForSelector('.category-card[data-card-category="Card 0-0"]', { timeout: 20000 });

    await page.evaluate((targetLinkId) => {
        if (!document.body.classList.contains('bulk-active')) window.toggleBulkMode();
        const checkbox = document.querySelector(`.bulk-check[data-bulk-id="${targetLinkId}"]`);
        if (!checkbox) throw new Error('Missing bulk checkbox for large move target.');
        checkbox.checked = true;
        window.toggleSelect(checkbox, targetLinkId, {
            stopPropagation() {},
            preventDefault() {},
            shiftKey: false
        });
        window.bulkWorkspace();
    }, movedLinkId);
    await page.waitForSelector('#bulk-tab-modal-overlay[style*="flex"]', { timeout: 10000 });
    await page.selectOption('#bulk-tab-existing-select', 'ws5');
    await page.fill('#bulk-tab-card-filter', 'Card 5-7');
    await page.waitForTimeout(100);
    await page.selectOption('#bulk-tab-card-existing-select', 'Card 5-7');
    await page.evaluate(() => window.confirmBulkTabMove());
    await page.waitForFunction(() => !document.body.classList.contains('bulk-active'), undefined, { timeout: 15000 });

    const moveState = await page.evaluate(() => {
        const moved = window.links.find((link) => link.id === 'link-0-0-1');
        return {
            moved,
            moveEvents: window.__largeDatapackSmoke.moveEvents,
            saveDataCalls: window.__largeDatapackSmoke.saveDataCalls,
            lastSaveData: window.__largeDatapackSmoke.lastSaveData
        };
    });
    if (moveState.moved?.workspace !== 'ws5' || moveState.moved?.category !== 'Card 5-7') {
        throw new Error(`Expected large bulk move to retarget the selected bookmark: ${JSON.stringify(moveState.moved)}`);
    }
    const lastEvent = moveState.moveEvents[moveState.moveEvents.length - 1];
    if (!lastEvent || lastEvent.source !== 'bulk-workspace-bookmark-move' || !Array.isArray(lastEvent.touchedScopes) || lastEvent.touchedScopes.length < 2) {
        throw new Error(`Expected large bulk move to emit precise mutation metadata: ${JSON.stringify(moveState)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedLargeDatapack(page);
        await assertUnidexLargeView(page);
        await assertDatapackViewLargeCaps(page);
        await assertLargeBulkMove(page);
        console.log('LARGE_DATAPACK_UNIDEX_DATAPACK_MOVE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
