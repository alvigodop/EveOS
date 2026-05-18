const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            typeof window.openExpandedSearchModal === 'function'
            && typeof window.renderDashboard === 'function'
            && !!window.EveOS?.SearchAdvanced?.DatapackView
            && !!window.EveOS?.SearchAdvanced?.Index
            && !!window.EveCategoryOrder
            && !!window.EveLibrary?.State
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
                    { id: 'other-tab', name: 'Other Tab', icon: 'folder', subTabs: [] }
                ],
                categoryOrderByWorkspace: {
                    main: ['Browser', 'Detached Nodes', 'NewTest', 'Start'],
                    'other-tab': ['NewTest']
                },
                categoryOrder: ['Browser', 'Detached Nodes', 'NewTest', 'Start'],
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            };
            window.links = links = [
                {
                    id: 'browser-link',
                    title: 'Browser Bookmark',
                    url: 'https://example.com/browser',
                    workspace: 'main',
                    category: 'Browser'
                },
                {
                    id: 'start-link',
                    title: 'Start Bookmark',
                    url: 'https://example.com/start',
                    workspace: 'main',
                    category: 'Start'
                },
                {
                    id: 'other-newtest-link',
                    title: 'Other Tab NewTest Bookmark',
                    url: 'https://example.com/other-newtest',
                    workspace: 'other-tab',
                    category: 'NewTest'
                }
            ];
            window.bookmarkFolders = bookmarkFolders = {
                'main::Detached Nodes': { nodes: [], settings: { staleGhost: true } },
                'main::NewTest': { nodes: [] }
            };
            window.EveLibrary.State.setAllLibraries({
                'main::NewTest': {
                    dataType: 'graphicNovels',
                    entries: [{ id: 'library-only-newtest', title: 'Library Only NewTest' }],
                    folderView: { root: 'all', chain: [], expanded: false }
                }
            });
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
            window.EveOS?.SearchAdvanced?.Index?.invalidate?.({
                source: 'nexus-macro-no-ghost-smoke',
                meta: { changedKeys: ['links', 'bookmarkFolders', 'categoryOrderByWorkspace'] }
            });
            window.renderDashboard();
        });
        await page.evaluate(async () => {
            await window.EveOS.SearchAdvanced.Index.rebuild({
                force: true,
                reason: 'nexus-macro-no-ghost-smoke'
            });
        });

        await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
        await page.locator('#nxDatapackViewBtn').click();
        await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });

        const before = await page.evaluate(() => ({
            gatewayCards: Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name')),
            dashboardCards: Array.from(document.querySelectorAll('.category-card')).map((node) => node.getAttribute('data-card-category')),
            order: window.EveCategoryOrder.getOrder('main').slice()
        }));
        assert(before.gatewayCards.join('|') === 'Browser|Start', `Gateway should omit stale order-only ghost cards before save: ${JSON.stringify(before)}`);
        assert(before.dashboardCards.includes('Browser') && before.dashboardCards.includes('Start'), `Dashboard should render material cards: ${JSON.stringify(before)}`);
        assert(!before.dashboardCards.includes('Detached Nodes') && !before.dashboardCards.includes('NewTest'), `Dashboard should not render ghost cards: ${JSON.stringify(before)}`);

        await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('.nx-dv-card'))
                .find((node) => node.getAttribute('data-category-name') === 'Start');
            if (!row) throw new Error('Missing Start row');
            row.querySelector('[data-nx-dv-field="categoryName"]').value = 'Start11';
            document.querySelector('[data-nx-dv-action="save-macro"]').click();
        });
        await page.waitForFunction(() => window.links.some((link) => link.id === 'start-link' && link.category === 'Start11'), undefined, { timeout: 10000 });

        const after = await page.evaluate(() => {
            window.renderDashboard();
            return {
                linkCategories: window.links.map((link) => ({ id: link.id, category: link.category })),
                gatewayCards: Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name')),
                dashboardCards: Array.from(document.querySelectorAll('.category-card')).map((node) => node.getAttribute('data-card-category')),
                order: window.EveCategoryOrder.getOrder('main', { persist: true }).slice(),
                storedOrder: (window.config.categoryOrderByWorkspace && window.config.categoryOrderByWorkspace.main || []).slice()
            };
        });

        assert(after.linkCategories.some((entry) => entry.id === 'start-link' && entry.category === 'Start11'), `Rename should update live bookmark category: ${JSON.stringify(after)}`);
        assert(!after.linkCategories.some((entry) => entry.category === 'Start'), `Old card category should not remain on live links: ${JSON.stringify(after)}`);
        assert(after.gatewayCards.join('|') === 'Browser|Start11', `Gateway should rerender without ghost cards after save: ${JSON.stringify(after)}`);
        assert(after.dashboardCards.includes('Browser') && after.dashboardCards.includes('Start11'), `Dashboard should show renamed material card: ${JSON.stringify(after)}`);
        assert(!after.dashboardCards.includes('Detached Nodes') && !after.dashboardCards.includes('NewTest'), `Macro save should not materialize ghost cards: ${JSON.stringify(after)}`);
        assert(after.order.join('|') === 'Browser|Start11', `Category order should be pruned to material cards: ${JSON.stringify(after)}`);
        assert(after.storedOrder.join('|') === 'Browser|Start11', `Stored order should not retain stale ghost cards: ${JSON.stringify(after)}`);
        if (pageErrors.length) {
            throw new Error(`Page errors during macro ghost card smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_MACRO_NO_GHOST_CARDS_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
