const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
    return {
        links: [
            {
                id: 'a1',
                title: 'Alpha One',
                url: 'https://example.com/a1',
                workspace: 'group-root',
                category: 'Alpha',
                identifiers: ['reading'],
                notes: 'Root note'
            },
            {
                id: 'a2',
                title: 'Alpha Foldered',
                url: 'https://example.com/a2',
                workspace: 'group-root',
                category: 'Alpha',
                folderId: 'f1',
                notes: 'Foldered note'
            },
            {
                id: 'c1',
                title: 'Child Bookmark',
                url: 'https://example.com/c1',
                workspace: 'child-a',
                category: 'Child Card'
            }
        ],
        config: {
            activeWorkspace: 'group-root',
            workspaces: [
                {
                    id: 'group-root',
                    name: 'Group Root',
                    icon: 'layers',
                    subTabs: [
                        { id: 'child-a', name: 'Child A', icon: 'leaf', subTabs: [] }
                    ]
                }
            ],
            categoryOrderByWorkspace: {
                'group-root': ['Beta', 'Alpha'],
                'child-a': ['Child Card']
            },
            categoryOrder: ['Beta', 'Alpha']
        },
        bookmarkFolders: {
            'group-root::Alpha': {
                nodes: [
                    { id: 'f1', parentId: '', name: 'Folder One', order: 0 }
                ],
                settings: { clickBehaviorMode: 'inherit' }
            }
        }
    };
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openExpandedSearchModal === 'function'
        && !!window.EveOS?.SearchAdvanced?.DatapackView
        && !!window.EveOS?.SearchAdvanced?.Index?.search
        && !!window.EveOS?.SearchAdvanced?.SearchVectors?.runMultiVectorSearch
        && !!window.EveBookmarkFolders
        && !!window.EveCategoryOrder
        && typeof window.renderDashboard === 'function'
    ), undefined, { timeout: 180000 });
}

async function seedState(page, payload) {
    await page.evaluate((seed) => {
        window.links = links = JSON.parse(JSON.stringify(seed.links));
        window.bookmarkFolders = bookmarkFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders));
        window.config = config = Object.assign({}, window.config || {}, JSON.parse(JSON.stringify(seed.config)));
        if (window.eveState) {
            window.eveState.links = links;
            window.eveState.config = config;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }
        window.__nexusDatapackViewSmoke = { saveDataCalls: 0, saveConfigCalls: 0 };
        const originalSaveData = window.saveData;
        const originalSaveConfig = window.saveConfig;
        window.__nexusDatapackViewSmoke.originalSaveData = originalSaveData;
        window.__nexusDatapackViewSmoke.originalSaveConfig = originalSaveConfig;
        window.saveData = function () {
            window.__nexusDatapackViewSmoke.saveDataCalls += 1;
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
        };
        window.saveConfig = function () {
            window.__nexusDatapackViewSmoke.saveConfigCalls += 1;
        };
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, payload);
}

async function runSmoke(page) {
    const groupSearchResult = await page.evaluate(async () => {
        await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'nexus-datapack-view-smoke', force: true });
        const result = await window.EveOS.SearchAdvanced.SearchVectors.runMultiVectorSearch('Child Bookmark', {
            activeVectors: {
                bookmarks: true,
                knowledge: false,
                cachedResults: false,
                google: false
            },
            resultsMode: 'segmented'
        }, { workspaceId: 'group-root' });
        return (result.results || []).map((record) => ({
            title: record.title,
            workspaceId: record.workspaceId || record.path?.workspaceId || '',
            linkId: record.linkId || record.path?.linkId || record.provenance?.linkId || ''
        }));
    });
    if (!groupSearchResult.some((record) => record.linkId === 'c1' && record.workspaceId === 'child-a')) {
        throw new Error(`Group-scoped Nexus search missed child tab bookmark: ${JSON.stringify(groupSearchResult)}`);
    }

    await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
    await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
    await page.locator('#nxDatapackViewBtn').click();
    await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });

    const gateway = await page.evaluate(() => {
        const panel = document.getElementById('nxDatapackViewPanel');
        const jsonText = panel.querySelector('.nx-dv-json pre')?.textContent || '';
        const state = JSON.parse(jsonText);
        return {
            text: panel.textContent || '',
            jsonText,
            cardNames: state.cards.map((card) => card.categoryName),
            workspaceIds: state.scope.workspaceIds,
            childRefs: state.childTabRefs.map((tab) => tab.name),
            omittedBookmarks: state.omitted.bookmarks
        };
    });
    if (!gateway.cardNames.includes('Alpha') || !gateway.cardNames.includes('Beta') || !gateway.cardNames.includes('Child Card')) {
        throw new Error(`Gateway did not include group root and child cards: ${JSON.stringify(gateway.cardNames)}`);
    }
    if (gateway.cardNames.slice(0, 2).join('|') !== 'Beta|Alpha') {
        throw new Error(`Gateway did not preserve workspace card order: ${JSON.stringify(gateway.cardNames)}`);
    }
    if (!gateway.workspaceIds.includes('group-root') || !gateway.workspaceIds.includes('child-a')) {
        throw new Error(`Gateway scope missed descendant workspace: ${JSON.stringify(gateway.workspaceIds)}`);
    }
    if (!gateway.childRefs.includes('Child A')) {
        throw new Error(`Gateway missed child tab reference: ${JSON.stringify(gateway.childRefs)}`);
    }
    if (!gateway.omittedBookmarks.includes('Open a card internals popup')) {
        throw new Error('Gateway JSON did not explain bookmark omission');
    }
    if (gateway.jsonText.includes('https://example.com/a1')) {
        throw new Error('Gateway JSON leaked raw bookmark URL instead of using macro summaries');
    }

    await page.evaluate(() => {
        const row = document.querySelector('.nx-dv-card[data-workspace-id="group-root"][data-category-name="Alpha"]');
        if (!row) throw new Error('Missing Alpha card editor row');
        row.querySelector('[data-nx-dv-field="categoryName"]').value = 'Alpha Renamed';
        row.querySelector('[data-nx-dv-field="order"]').value = '2';
        document.querySelector('[data-nx-dv-action="preview-macro"]').click();
    });
    await page.waitForFunction(() => {
        const diff = document.querySelector('[data-nx-dv-diff="macro"]');
        return diff && !diff.hidden && diff.textContent.includes('Alpha Renamed');
    }, undefined, { timeout: 10000 });
    await page.evaluate(() => {
        document.querySelector('[data-nx-dv-action="save-macro"]').click();
    });
    await page.waitForFunction(() => window.links.some((link) => link.category === 'Alpha Renamed'), undefined, { timeout: 10000 });

    const macroResult = await page.evaluate(() => ({
        linkCategories: window.links.map((link) => ({ id: link.id, category: link.category })),
        hasRenamedFolderScope: !!window.bookmarkFolders['group-root::Alpha Renamed'],
        oldFolderScopeExists: !!window.bookmarkFolders['group-root::Alpha'],
        order: window.config.categoryOrderByWorkspace['group-root'],
        saveDataCalls: window.__nexusDatapackViewSmoke.saveDataCalls,
        saveConfigCalls: window.__nexusDatapackViewSmoke.saveConfigCalls
    }));
    if (!macroResult.hasRenamedFolderScope || macroResult.oldFolderScopeExists) {
        throw new Error(`Macro rename did not move folder scope cleanly: ${JSON.stringify(macroResult)}`);
    }
    if (!macroResult.order.includes('Alpha Renamed') || macroResult.order.includes('Alpha')) {
        throw new Error(`Macro rename did not update category order: ${JSON.stringify(macroResult.order)}`);
    }
    if (macroResult.order.slice(0, 2).join('|') !== 'Beta|Alpha Renamed') {
        throw new Error(`Macro save did not preserve unchanged order: ${JSON.stringify(macroResult.order)}`);
    }
    if (macroResult.saveDataCalls < 1 || macroResult.saveConfigCalls < 1) {
        throw new Error(`Macro save did not emit save hooks: ${JSON.stringify(macroResult)}`);
    }

    await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.openCardInternals('group-root', 'Alpha Renamed'));
    await page.waitForSelector('.nx-dv-micro-overlay', { timeout: 10000 });

    const microState = await page.evaluate(() => {
        const overlay = document.querySelector('.nx-dv-micro-overlay');
        const text = overlay.textContent || '';
        const folderRowText = Array.from(overlay.querySelectorAll('.nx-dv-folder-row')).map((node) => node.textContent || '');
        return { text, folderRowText };
    });
    if (!microState.text.includes('Folder One') || !microState.folderRowText.some((value) => value.includes('Folder One'))) {
        throw new Error(`Micro popup missed folder path/details: ${JSON.stringify(microState)}`);
    }

    await page.evaluate(() => {
        const row = document.querySelector('.nx-dv-bookmark-row[data-link-id="a1"]');
        if (!row) throw new Error('Missing bookmark row for a1');
        row.querySelector('[data-nx-dv-field="bookmarkTitle"]').value = 'Alpha One Edited';
        row.querySelector('[data-nx-dv-field="bookmarkUrl"]').value = 'https://example.com/a1-edited';
        row.querySelector('[data-nx-dv-field="bookmarkNotes"]').value = 'Edited note from Nebula JSON transaction';
        row.querySelector('[data-nx-dv-field="bookmarkIdentifiers"]').value = 'reading, favorite';
        row.querySelector('[data-nx-dv-field="bookmarkFolderId"]').value = 'f1';
        document.querySelector('[data-nx-dv-action="preview-micro"]').click();
    });
    await page.waitForFunction(() => {
        const diff = document.querySelector('[data-nx-dv-diff="micro"]');
        return diff && !diff.hidden && diff.textContent.includes('Alpha One Edited');
    }, undefined, { timeout: 10000 });
    await page.evaluate(() => {
        document.querySelector('[data-nx-dv-action="save-micro"]').click();
    });
    await page.waitForFunction(() => window.links.some((link) => link.id === 'a1' && link.title === 'Alpha One Edited'), undefined, { timeout: 10000 });

    const microResult = await page.evaluate(() => ({
        editedLink: window.links.find((link) => link.id === 'a1'),
        overlayOpen: !!document.querySelector('.nx-dv-micro-overlay'),
        saveDataCalls: window.__nexusDatapackViewSmoke.saveDataCalls
    }));
    if (
        microResult.editedLink?.title !== 'Alpha One Edited'
        || microResult.editedLink?.url !== 'https://example.com/a1-edited'
        || microResult.editedLink?.notes !== 'Edited note from Nebula JSON transaction'
        || microResult.editedLink?.folderId !== 'f1'
        || (microResult.editedLink?.identifiers || []).join('|') !== 'reading|favorite'
        || microResult.overlayOpen
    ) {
        throw new Error(`Micro save did not persist and close cleanly: ${JSON.stringify(microResult)}`);
    }
    if (microResult.saveDataCalls < 2) {
        throw new Error(`Micro save did not emit saveData after macro save: ${JSON.stringify(microResult)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page, buildSeedPayload());
        await runSmoke(page);
        console.log('NEXUS_DATAPACK_VIEW_STATE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
