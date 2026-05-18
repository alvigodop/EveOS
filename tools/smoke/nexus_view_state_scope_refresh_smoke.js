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
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            window.openExpandedSearchModal({ autoSearch: false });
            const modal = document.getElementById('expandedSearchModal');
            if (modal) modal.style.display = 'none';
        });

        await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
                    { id: 'tab-b', name: 'Tab B', icon: 'folder', subTabs: [] }
                ],
                categoryOrderByWorkspace: {
                    main: ['Main Card'],
                    'tab-b': ['Second Tab Card']
                },
                categoryOrder: [],
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            };
            window.links = links = [
                { id: 'main-link', title: 'Main Only', url: 'https://example.com/main', workspace: 'main', category: 'Main Card' },
                { id: 'tab-b-link', title: 'Second Only', url: 'https://example.com/second', workspace: 'tab-b', category: 'Second Tab Card' }
            ];
            window.__nexusViewStateScopeRefreshLinks = links;
            window.getLiveLinks = function () {
                return window.__nexusViewStateScopeRefreshLinks || [];
            };
            window.setLiveLinks = function (nextLinks) {
                window.__nexusViewStateScopeRefreshLinks = Array.isArray(nextLinks) ? nextLinks : [];
                window.links = links = window.__nexusViewStateScopeRefreshLinks;
                if (window.eveState) window.eveState.links = window.__nexusViewStateScopeRefreshLinks;
                return window.__nexusViewStateScopeRefreshLinks;
            };
            window.setLiveLinks(links);
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
            if (window.EveOS?.SearchAdvanced?.Index?.invalidate) {
                window.EveOS.SearchAdvanced.Index.invalidate({ reason: 'nexus-view-state-scope-refresh-smoke-seed' });
            }
            window.renderDashboard();
        });

        await page.evaluate(async () => {
            if (window.EveOS?.SearchAdvanced?.Index?.rebuild) {
                await window.EveOS.SearchAdvanced.Index.rebuild({
                    force: true,
                    reason: 'nexus-view-state-scope-refresh-smoke-seed'
                });
            }
        });

        await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
        await page.locator('#nxDatapackViewBtn').click();
        await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });

        const before = await page.evaluate(() => ({
            scope: document.getElementById('esScopeIndicator')?.textContent || '',
            cards: Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name'))
        }));
        assert(before.cards.join('|') === 'Main Card', `Initial View State should show the active tab only: ${JSON.stringify(before)}`);

        await page.evaluate(() => {
            config.activeWorkspace = 'tab-b';
            window.config = config;
            if (window.eveState?.config) window.eveState.config.activeWorkspace = 'tab-b';
            window.renderDashboard();
            window.openExpandedSearchModal({ autoSearch: false });
        });

        await page.waitForFunction(() => {
            const cards = Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name'));
            return cards.join('|') === 'Second Tab Card';
        }, undefined, { timeout: 10000 });

        const after = await page.evaluate(() => ({
            scope: document.getElementById('esScopeIndicator')?.textContent || '',
            cards: Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name')),
            meta: document.getElementById('esMeta')?.textContent || ''
        }));
        assert(after.cards.join('|') === 'Second Tab Card', `Reopening Nexus should refresh visible View State for the new active tab: ${JSON.stringify(after)}`);
        assert(!after.cards.includes('Main Card'), `Old tab card should not remain after reopening Nexus: ${JSON.stringify(after)}`);
        if (pageErrors.length) {
            throw new Error(`Page errors during Nexus View State refresh smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_VIEW_STATE_SCOPE_REFRESH_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
