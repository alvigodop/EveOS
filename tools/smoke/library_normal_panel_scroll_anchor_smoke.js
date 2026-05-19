const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.toggleCategoryLibrary === 'function'
        && !!window.EveLibrary?.State?.setAllLibraries
        && window.initialized === true
    ), undefined, { timeout: 180000 });
}

function makeLinks() {
    const links = [];
    ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Test'].forEach((category) => {
        const count = category === 'Test' ? 10 : 8;
        for (let index = 0; index < count; index += 1) {
            links.push({
                id: `${category}-${index}`,
                title: `${category} Bookmark ${index + 1}`,
                url: `https://example.test/${category.toLowerCase()}/${index + 1}`,
                workspace: 'main',
                category
            });
        }
    });
    return links;
}

function makeLibraryEntries() {
    const entries = [];
    for (let index = 0; index < 18; index += 1) {
        entries.push({
            id: `entry-${index}`,
            title: `Show Entry ${index + 1}`,
            mediaTypes: ['films'],
            status: index % 3 === 0 ? 'Watching' : 'Plan to Watch',
            season: 1,
            episode: index,
            sourceUrl: `https://example.test/show/${index + 1}`
        });
    }
    return entries;
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 700, height: 520 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async ({ seedLinks, libraryEntries }) => {
            const originalSaveData = window.saveData;
            const originalSaveConfig = window.saveConfig;
            window.saveData = function () { };
            window.saveConfig = function () { };
            try {
                const categoryOrder = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Test'];
                window.links = links = seedLinks;
                window.config = config = Object.assign({}, window.eveState?.config || config || {}, {
                    activeWorkspace: 'main',
                    viewMode: 'grid',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                    categoryOrder,
                    categoryOrderByWorkspace: { main: categoryOrder },
                    groupOverviewId: ''
                });
                window.bookmarkFolders = {};
                try { bookmarkFolders = window.bookmarkFolders; } catch (_) { }
                if (window.eveState) {
                    window.eveState.links = seedLinks;
                    window.eveState.config = config;
                    window.eveState.bookmarkFolders = bookmarkFolders;
                }
                const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
                if (indexApi) {
                    indexApi.hasUsableSnapshot = function () { return false; };
                    indexApi.hasReadableLinkSnapshot = function () { return false; };
                    indexApi.hasReadableStructureSnapshot = function () { return false; };
                    indexApi.ensureFresh = null;
                    indexApi.rebuild = null;
                }
                const search = document.getElementById('search');
                if (search) search.value = '';
                window.EveLibrary.State.setAllLibraries({
                    'main::Test': {
                        dataType: 'films',
                        entries: libraryEntries
                    }
                });

                if (typeof window._renderDashboardImmediate === 'function') {
                    window._renderDashboardImmediate();
                } else {
                    window.renderDashboard();
                }
                await new Promise(resolve => setTimeout(resolve, 220));
                const scrollHost = document.getElementById('main-content') || document.scrollingElement || document.documentElement;
                scrollHost.scrollTop = scrollHost.scrollHeight;
                await new Promise(resolve => setTimeout(resolve, 80));
                const beforeOpenY = scrollHost.scrollTop || 0;
                window.toggleCategoryLibrary('Test');
                await new Promise(resolve => setTimeout(resolve, 450));
                const afterOpenY = scrollHost.scrollTop || 0;
                const panel = document.getElementById('lib-Test-panel');
                const card = panel?.closest('.category-card');
                const panelStyle = panel ? getComputedStyle(panel) : null;
                const panelMaxHeight = panelStyle?.maxHeight || '';
                const panelOverflowY = panelStyle?.overflowY || '';
                const entriesGrid = panel?.querySelector('.lib-entries-grid');
                const entriesStyle = entriesGrid ? getComputedStyle(entriesGrid) : null;
                const entriesMaxHeight = entriesStyle?.maxHeight || '';
                const entriesOverflowY = entriesStyle?.overflowY || '';

                scrollHost.scrollTop = Math.max(0, scrollHost.scrollTop - 650);
                await new Promise(resolve => setTimeout(resolve, 80));
                const afterUserScrollY = scrollHost.scrollTop || 0;
                await new Promise(resolve => setTimeout(resolve, 520));
                const afterStableY = scrollHost.scrollTop || 0;
                window.renderDashboard();
                await new Promise(resolve => setTimeout(resolve, 520));
                const afterRenderY = scrollHost.scrollTop || 0;
                const currentPanel = document.getElementById('lib-Test-panel') || panel;
                if (currentPanel) currentPanel.scrollTop = 0;
                const beforePanelWheelY = scrollHost.scrollTop || 0;
                currentPanel?.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: -420,
                    bubbles: true,
                    cancelable: true
                }));
                await new Promise(resolve => setTimeout(resolve, 80));
                const afterPanelWheelY = scrollHost.scrollTop || 0;
                const beforeEntriesWheelY = scrollHost.scrollTop || 0;
                const currentEntriesGrid = (document.getElementById('lib-Test-panel') || currentPanel)?.querySelector('.lib-entries-grid') || entriesGrid;
                const currentLibraryPanel = document.getElementById('lib-Test-panel') || currentPanel;
                if (currentLibraryPanel) currentLibraryPanel.scrollTop = 180;
                const beforeEntriesPanelScrollTop = currentLibraryPanel?.scrollTop || 0;
                currentEntriesGrid?.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: -420,
                    bubbles: true,
                    cancelable: true
                }));
                await new Promise(resolve => setTimeout(resolve, 80));
                const afterEntriesWheelY = scrollHost.scrollTop || 0;
                const afterEntriesPanelScrollTop = currentLibraryPanel?.scrollTop || 0;

                return {
                    beforeOpenY,
                    afterOpenY,
                    afterUserScrollY,
                    afterStableY,
                    afterRenderY,
                    beforePanelWheelY,
                    afterPanelWheelY,
                    beforeEntriesWheelY,
                    afterEntriesWheelY,
                    beforeEntriesPanelScrollTop,
                    afterEntriesPanelScrollTop,
                    cardClasses: card?.className || '',
                    panelDisplay: panel?.style.display || '',
                    panelMaxHeight,
                    panelOverflowY,
                    entriesMaxHeight,
                    entriesOverflowY,
                    openSurfaceKind: window.__eveOpenCardLibrarySurface?.kind || '',
                    openSurfaceCard: window.__eveOpenCardLibrarySurface?.cardTargetId || '',
                    bodyHeight: document.documentElement.scrollHeight || document.body.scrollHeight,
                    hostHeight: scrollHost.scrollHeight,
                    hostClientHeight: scrollHost.clientHeight
                };
            } finally {
                window.saveData = originalSaveData;
                window.saveConfig = originalSaveConfig;
            }
        }, { seedLinks: makeLinks(), libraryEntries: makeLibraryEntries() });

        if (!result.cardClasses.includes('has-library-expanded') || result.panelDisplay !== 'block') {
            throw new Error(`Normal card should be marked with stable expanded library state: ${JSON.stringify(result)}`);
        }
        if (result.panelOverflowY !== 'auto' || !result.panelMaxHeight || result.panelMaxHeight === 'none') {
            throw new Error(`Normal card library panel should stay visually wrapped while forwarding wheel scroll: ${JSON.stringify(result)}`);
        }
        if (result.entriesOverflowY !== 'visible' || result.entriesMaxHeight !== 'none') {
            throw new Error(`Normal card library entries should not create a nested scroll trap: ${JSON.stringify(result)}`);
        }
        if (!(result.afterUserScrollY < result.afterOpenY - 100)) {
            throw new Error(`User scroll should move page upward after library expansion: ${JSON.stringify(result)}`);
        }
        if (Math.abs(result.afterStableY - result.afterUserScrollY) > 80) {
            throw new Error(`Delayed library/masonry work should not pull page back down: ${JSON.stringify(result)}`);
        }
        if (Math.abs(result.afterRenderY - result.afterStableY) > 80) {
            throw new Error(`Dashboard render while card library is open should preserve main-content scroll: ${JSON.stringify(result)}`);
        }
        if (result.openSurfaceKind !== 'card-library' || !result.openSurfaceCard.includes('Test')) {
            throw new Error(`Open card library should register an embedded scroll surface: ${JSON.stringify(result)}`);
        }
        if (!(result.afterPanelWheelY < result.beforePanelWheelY - 100)) {
            throw new Error(`Wheel up at top of open library panel should hand off to site scroll: ${JSON.stringify(result)}`);
        }
        if (!(result.afterEntriesWheelY < result.beforeEntriesWheelY - 100)) {
            throw new Error(`Wheel up over library entries should hand off through the panel to site scroll: ${JSON.stringify(result)}`);
        }
        if (Math.abs(result.afterEntriesPanelScrollTop - result.beforeEntriesPanelScrollTop) > 5) {
            throw new Error(`Normal card library wheel should not trap movement inside the panel: ${JSON.stringify(result)}`);
        }

        console.log('LIBRARY_NORMAL_PANEL_SCROLL_ANCHOR_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
