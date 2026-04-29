const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveDashboardPrefetch
        && typeof window.EveDashboardPrefetch.schedulePrefetch === 'function'
        && !!window.EveOS?.DatapackIndex?.getScopedBookmarkLinkIds
    ), undefined, { timeout: 120000 });
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            config = window.config = {
                activeWorkspace: 'alt',
                viewMode: 'grid',
                sidebarExpanded: true,
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'M', subTabs: [] },
                    { id: 'alt', name: 'Alt', icon: 'A', subTabs: [] }
                ],
                categoryOrder: ['Reading', 'Alt'],
                collapsedTabs: []
            };
            links = window.links = [
                { id: 'prefetch-main-1', title: 'Prefetch Main 1', url: 'https://example.com/1', workspace: 'main', category: 'Reading' },
                { id: 'prefetch-main-2', title: 'Prefetch Main 2', url: 'https://example.com/2', workspace: 'main', category: 'Reading' },
                { id: 'prefetch-alt-1', title: 'Prefetch Alt 1', url: 'https://example.com/alt', workspace: 'alt', category: 'Alt' }
            ];
            bookmarkFolders = window.bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = window.config;
                window.eveState.links = window.links;
                window.eveState.bookmarkFolders = window.bookmarkFolders;
            }

            const indexApi = window.EveOS.DatapackIndex;
            await Promise.resolve(indexApi.rebuild({ reason: 'dashboard-prefetch-indexed-links-smoke' }));

            let scopedCount = 0;
            if (!window.__prefetchIndexedLinksWrapped) {
                window.__prefetchIndexedLinksWrapped = true;
                const original = indexApi.getScopedBookmarkLinkIds.bind(indexApi);
                indexApi.getScopedBookmarkLinkIds = function wrappedGetScopedBookmarkLinkIds(...args) {
                    scopedCount += 1;
                    return original(...args);
                };
            }

            window.EveDashboardPrefetch.clearCache();
            window.EveDashboardPrefetch.schedulePrefetch();

            const deadline = Date.now() + 5000;
            while (Date.now() < deadline && !window.EveDashboardPrefetch.hasPrefetched('main')) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const prefetched = window.EveDashboardPrefetch.getPrefetched('main');
            return {
                scopedCount,
                source: prefetched?.source || '',
                ids: Array.isArray(prefetched?.visibleLinks)
                    ? prefetched.visibleLinks.map(link => link.id).sort()
                    : [],
                visibleWorkspaceIds: Array.isArray(Array.from(prefetched?.visibleWorkspaceIds || []))
                    ? Array.from(prefetched?.visibleWorkspaceIds || [])
                    : []
            };
        });

        if (result.scopedCount < 1) {
            throw new Error(`Expected prefetch to use indexed scoped IDs, got ${JSON.stringify(result)}`);
        }
        if (result.source !== 'datapack-index') {
            throw new Error(`Expected indexed prefetch source, got ${JSON.stringify(result)}`);
        }
        if (result.ids.join('|') !== 'prefetch-main-1|prefetch-main-2') {
            throw new Error(`Unexpected prefetched links: ${JSON.stringify(result)}`);
        }

        console.log('DASHBOARD_PREFETCH_INDEXED_LINKS_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
