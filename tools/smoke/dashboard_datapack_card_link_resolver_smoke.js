const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderCategories === 'function'
        && !!window.DashboardCategories?.renderCard
        && !!window.EveOS?.DatapackIndex?.rebuild
        && !!window.EveOS?.DatapackIndex?.getExactBookmarkLinkIds
    ), undefined, { timeout: 180000 });
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(800);

        const result = await page.evaluate(async () => {
            const grid = document.getElementById('dashboard-grid');
            if (!grid) throw new Error('dashboard-grid missing');

            const seededLinks = [
                {
                    id: 'resolver-visible',
                    title: 'Resolver Visible Bookmark',
                    url: 'https://example.com/visible',
                    workspace: 'main',
                    category: 'Reading'
                },
                {
                    id: 'resolver-index-only',
                    title: 'Resolver Index Only Bookmark',
                    url: 'https://example.com/index-only',
                    workspace: 'main',
                    category: 'Reading'
                }
            ];
            const seededConfig = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                categoryOrder: ['Reading'],
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                cardBookmarkProgressiveReveal: {
                    'main::Reading': false
                }
            });

            window.links = links = seededLinks;
            window.config = config = seededConfig;
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.links = seededLinks;
                window.eveState.config = seededConfig;
                window.eveState.bookmarkFolders = {};
            }

            window._eveActiveVisibleWorkspaceIds = new Set(['main']);
            await Promise.resolve(window.EveOS.DatapackIndex.rebuild({ reason: 'dashboard-card-link-resolver-smoke' }));

            grid.innerHTML = '';
            window.renderCategories(
                [seededLinks[0]],
                grid,
                '',
                '',
                Number(window._eveDashRenderGen || 1),
                null
            );

            const text = String(grid.textContent || '');
            const exactIds = window.EveOS.DatapackIndex.getExactBookmarkLinkIds({
                workspaceId: 'main',
                categoryName: 'Reading'
            });

            return {
                exactIds,
                renderedVisible: text.includes('Resolver Visible Bookmark'),
                renderedIndexOnly: text.includes('Resolver Index Only Bookmark'),
                cardText: text
            };
        });

        if (!Array.isArray(result.exactIds) || result.exactIds.length !== 2) {
            throw new Error(`Expected two exact indexed bookmark IDs: ${JSON.stringify(result)}`);
        }
        if (!result.renderedVisible || !result.renderedIndexOnly) {
            throw new Error(`Expected dashboard card renderer to resolve index-only bookmark: ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_DATAPACK_CARD_LINK_RESOLVER_SMOKE_OK ' + JSON.stringify({
            exactIds: result.exactIds,
            renderedVisible: result.renderedVisible,
            renderedIndexOnly: result.renderedIndexOnly
        }));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
