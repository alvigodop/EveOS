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
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            window.config = config = {
                activeWorkspace: 'parent',
                viewMode: 'grid',
                workspaces: [
                    {
                        id: 'parent',
                        name: 'Testing2',
                        icon: 'folder',
                        subTabs: [
                            { id: 'shortcut', name: '2-tester (Link)', icon: 'link', linkedTo: 'source', subTabs: [] }
                        ]
                    },
                    { id: 'source', name: '2-tester', icon: 'folder', subTabs: [] }
                ],
                categoryOrderByWorkspace: {
                    parent: [],
                    shortcut: ['Shortcut Local'],
                    source: ['NewTest']
                },
                categoryOrder: [],
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            };
            window.links = links = [
                {
                    id: 'source-link',
                    title: 'Source Bookmark',
                    url: 'https://example.com/source',
                    workspace: 'source',
                    category: 'NewTest'
                },
                {
                    id: 'shortcut-local-link',
                    title: 'Shortcut Local Bookmark',
                    url: 'https://example.com/shortcut',
                    workspace: 'shortcut',
                    category: 'Shortcut Local'
                }
            ];
            window.__nexusShortcutTabViewStateLinks = links;
            window.getLiveLinks = function () {
                return window.__nexusShortcutTabViewStateLinks || [];
            };
            window.setLiveLinks = function (nextLinks) {
                window.__nexusShortcutTabViewStateLinks = Array.isArray(nextLinks) ? nextLinks : [];
                window.links = links = window.__nexusShortcutTabViewStateLinks;
                if (window.eveState) window.eveState.links = window.__nexusShortcutTabViewStateLinks;
                return window.__nexusShortcutTabViewStateLinks;
            };
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
            window.setLiveLinks(links);
            window.renderDashboard();
        });

        await page.evaluate(async () => {
            await window.EveOS.SearchAdvanced.Index.rebuild({
                force: true,
                reason: 'nexus-shortcut-tab-view-state-smoke'
            });
        });

        const parentState = await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.buildGatewayState({ workspaceId: 'parent' }));
        assert(parentState.scope.workspaceId === 'parent', `Parent scope should stay on parent tab: ${JSON.stringify(parentState.scope)}`);
        assert(parentState.cards.some((card) => card.categoryName === 'Shortcut Local'), `Parent branch scope should keep real local shortcut cards: ${JSON.stringify(parentState.cards)}`);
        assert(!parentState.cards.some((card) => card.categoryName === 'NewTest'), `Parent should not inline shortcut source cards: ${JSON.stringify(parentState.cards)}`);
        assert(parentState.childTabRefs.length === 1, `Parent should expose shortcut child ref: ${JSON.stringify(parentState.childTabRefs)}`);
        assert(parentState.childTabRefs[0].isShortcut === true, `Child ref should be marked as shortcut: ${JSON.stringify(parentState.childTabRefs[0])}`);
        assert(parentState.childTabRefs[0].linkedTo === 'source', `Child ref should point to source tab: ${JSON.stringify(parentState.childTabRefs[0])}`);
        assert(parentState.childTabRefs[0].sourceCards === 1 && parentState.childTabRefs[0].sourceBookmarks === 1, `Shortcut ref should show source counts: ${JSON.stringify(parentState.childTabRefs[0])}`);
        assert(parentState.childTabRefs[0].cards === 1 && parentState.childTabRefs[0].bookmarks === 1, `Shortcut ref should keep local shortcut counts: ${JSON.stringify(parentState.childTabRefs[0])}`);

        await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.openGateway({ scope: { workspaceId: 'shortcut' } }));
        await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });

        const shortcutDom = await page.evaluate(() => ({
            cards: Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name')),
            linkedSourceButtons: Array.from(document.querySelectorAll('.nx-dv-ref--linked-source')).map((node) => ({
                workspaceId: node.getAttribute('data-workspace-id'),
                text: node.textContent || ''
            })),
            json: JSON.parse(document.querySelector('.nx-dv-json pre')?.textContent || '{}')
        }));
        assert(shortcutDom.cards.join('|') === 'Shortcut Local', `Shortcut gateway should show only local shortcut cards: ${JSON.stringify(shortcutDom)}`);
        assert(shortcutDom.linkedSourceButtons.length === 1, `Shortcut gateway should render one linked source ref: ${JSON.stringify(shortcutDom)}`);
        assert(shortcutDom.linkedSourceButtons[0].workspaceId === 'source', `Linked source ref should open source tab: ${JSON.stringify(shortcutDom)}`);
        assert(shortcutDom.linkedSourceButtons[0].text.includes('2-tester'), `Linked source ref should label actual source tab: ${JSON.stringify(shortcutDom)}`);
        assert(shortcutDom.json.linkedSourceRefs.length === 1, `Gateway JSON should include linked source refs: ${JSON.stringify(shortcutDom.json)}`);
        assert(shortcutDom.json.linkedSourceRefs[0].cards === 1 && shortcutDom.json.linkedSourceRefs[0].bookmarks === 1, `Linked source JSON should carry source counts: ${JSON.stringify(shortcutDom.json.linkedSourceRefs[0])}`);

        await page.locator('.nx-dv-ref--linked-source').click();
        await page.waitForFunction(() => {
            const state = window.EveOS?.SearchAdvanced?.DatapackView?.buildGatewayState?.({ workspaceId: 'source' });
            return state && state.cards && state.cards.some((card) => card.categoryName === 'NewTest');
        }, undefined, { timeout: 10000 });

        const sourceCards = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-dv-card')).map((node) => node.getAttribute('data-category-name')));
        assert(sourceCards.join('|') === 'NewTest', `Opening linked source should show actual source cards: ${JSON.stringify(sourceCards)}`);

        if (pageErrors.length) {
            throw new Error(`Page errors during shortcut View State smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_SHORTCUT_TAB_VIEW_STATE_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
