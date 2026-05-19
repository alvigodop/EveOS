const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.setFocus === 'function'
        && typeof window.toggleCategoryLibrary === 'function'
        && !!window.EveLibrary?.State?.setAllLibraries
        && !!window.EveLibrary?.UI?.toggleStats
        && !!window.EveLibrary?.ConnectionsAPI?.setAll
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 860, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const originalSaveData = window.saveData;
            const originalSaveConfig = window.saveConfig;
            window.saveData = function () { };
            window.saveConfig = function () { };
            try {
                const seedLinks = [
                    { id: 'film-a', title: 'Film A', url: 'https://example.test/a', workspace: 'main', category: 'Test' },
                    { id: 'film-b', title: 'Film B', url: 'https://example.test/b', workspace: 'main', category: 'Test' },
                    { id: 'film-c', title: 'Film C', url: 'https://example.test/c', workspace: 'main', category: 'Test' }
                ];
                window.links = links = seedLinks;
                window.bookmarkFolders = bookmarkFolders = {
                    'main::Test': { nodes: [{ id: 'folder-a', name: 'Films Folder', parentId: '', order: 0 }] }
                };
                window.config = config = Object.assign({}, window.config || {}, {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                    categoryOrderByWorkspace: { main: ['Test'] },
                    categoryOrder: ['Test']
                });
                if (window.eveState) {
                    window.eveState.links = links;
                    window.eveState.config = config;
                    window.eveState.bookmarkFolders = bookmarkFolders;
                }
                window.EveLibrary.State.setAllLibraries({
                    'main::Test': {
                        dataType: 'films',
                        entries: [
                            {
                                id: 'entry-a',
                                title: 'Film A',
                                mediaTypes: ['films'],
                                status: 'Watching',
                                season: 1,
                                episode: 4,
                                sourceUrl: 'https://example.test/a',
                                dateAdded: new Date().toISOString(),
                                lastEdited: new Date().toISOString()
                            },
                            {
                                id: 'entry-b',
                                title: 'Film B',
                                mediaTypes: ['films'],
                                status: 'Plan to Watch',
                                season: 1,
                                episode: 0,
                                sourceUrl: 'https://example.test/b'
                            }
                        ]
                    }
                });
                window.EveLibrary.ConnectionsAPI.setAll([
                    { id: 'conn-a', linkId: 'film-a', workspace: 'main', categoryName: 'Test', libraryEntryId: 'entry-a' },
                    { id: 'conn-b', linkId: 'film-b', workspace: 'main', categoryName: 'Test', libraryEntryId: 'entry-b' }
                ]);

                window.renderDashboard();
                window.setFocus('Test');
                await new Promise(resolve => setTimeout(resolve, 80));
                window.toggleCategoryLibrary('Test');
                await new Promise(resolve => setTimeout(resolve, 160));
                window.EveLibrary.UI.toggleStats('Test');
                await new Promise(resolve => setTimeout(resolve, 120));

                const card = document.querySelector('.category-card.is-focus-mode');
                const panel = document.getElementById('lib-Test-panel');
                const entries = document.querySelector('.focused-category-entries');
                const stats = document.getElementById('lib-Test-stats-view');
                const cardRect = card?.getBoundingClientRect();
                const panelRect = panel?.getBoundingClientRect();
                return {
                    cardClasses: card?.className || '',
                    panelText: panel?.textContent || '',
                    focusedEntryCount: entries?.querySelectorAll('.focused-entry-item').length || 0,
                    entriesDisplay: entries ? getComputedStyle(entries).display : '',
                    cardClientWidth: card?.clientWidth || 0,
                    cardScrollWidth: card?.scrollWidth || 0,
                    panelClientWidth: panel?.clientWidth || 0,
                    panelScrollWidth: panel?.scrollWidth || 0,
                    statsClientWidth: stats?.clientWidth || 0,
                    statsScrollWidth: stats?.scrollWidth || 0,
                    cardWidth: cardRect?.width || 0,
                    panelWidth: panelRect?.width || 0
                };
            } finally {
                window.saveData = originalSaveData;
                window.saveConfig = originalSaveConfig;
            }
        });

        if (!result.cardClasses.includes('focus-library-expanded')) {
            throw new Error(`Focused card should use library-expanded state: ${JSON.stringify(result)}`);
        }
        if (result.cardClasses.includes('focus-library-only')) {
            throw new Error(`Focused card should not use library-only state: ${JSON.stringify(result)}`);
        }
        if (result.focusedEntryCount < 3 || result.entriesDisplay === 'none') {
            throw new Error(`Focused bookmarks should remain visible below library: ${JSON.stringify(result)}`);
        }
        if (!result.panelText.includes('Currently Watching') || result.panelText.includes('Currently Reading')) {
            throw new Error(`Film stats should use watching labels: ${JSON.stringify(result.panelText)}`);
        }
        if (!result.panelText.includes('Watching Habits') || !result.panelText.includes('Watching Progress')) {
            throw new Error(`Film stats should update progress section labels: ${JSON.stringify(result.panelText)}`);
        }
        if (result.cardScrollWidth > result.cardClientWidth + 3 || result.panelScrollWidth > result.panelClientWidth + 3 || result.statsScrollWidth > result.statsClientWidth + 3) {
            throw new Error(`Focused library layout overflows narrow viewport: ${JSON.stringify(result)}`);
        }

        console.log('LIBRARY_FOCUS_FILM_STATS_LAYOUT_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
