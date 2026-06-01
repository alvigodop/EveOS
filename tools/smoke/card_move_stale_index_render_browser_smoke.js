const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.moveCategoryCardToWorkspace === 'function'
        && typeof window.renderDashboard === 'function'
        && typeof window.switchWorkspace === 'function'
        && !!(window.EveOS?.DatapackIndex)
    ), undefined, { timeout: 180000 });
}

async function waitForStartupDataLoad(page) {
    await page.waitForFunction(() => (
        window._eveStartupBookmarkPaintActive === true
        || (window.__eveDashboardRenderHint && window.__eveDashboardRenderHint.source === 'storage-load')
    ), undefined, { timeout: 30000 });
    await page.waitForTimeout(120);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await waitForStartupDataLoad(page);

        const result = await page.evaluate(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const waitFor = async (predicate, message, timeoutMs = 6000) => {
                const start = Date.now();
                while (Date.now() - start < timeoutMs) {
                    if (predicate()) return true;
                    await wait(80);
                }
                throw new Error(message);
            };

            const seededLinks = [{
                id: 'moved-card-link-1',
                title: 'Moved Card Link One',
                url: 'https://example.test/moved-1',
                workspace: 'source-tab',
                category: 'Moved Card'
            }, {
                id: 'moved-card-link-2',
                title: 'Moved Card Link Two',
                url: 'https://example.test/moved-2',
                workspace: 'source-tab',
                category: 'Moved Card'
            }, {
                id: 'target-existing-link',
                title: 'Existing Target Link',
                url: 'https://example.test/existing-target',
                workspace: 'target-tab',
                category: 'Existing Target Card'
            }];

            window.config = config = {
                activeWorkspace: 'source-tab',
                workspaces: [
                    { id: 'source-tab', name: 'Source Tab', icon: 'S' },
                    { id: 'target-tab', name: 'Target Tab', icon: 'T' }
                ],
                categoryOrderByWorkspace: {
                    'source-tab': ['Moved Card'],
                    'target-tab': []
                },
                collapsed: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: [],
                scrollableCategories: true
            };

            if (typeof window.setLiveLinks === 'function') window.setLiveLinks(seededLinks);
            else window.links = links = seededLinks;
            window.bookmarkFolders = bookmarkFolders = {};
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = seededLinks;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
            if (window.EveDashboardCache?.clear) window.EveDashboardCache.clear();
            if (window.EveDashboardPrefetch?.clearCache) window.EveDashboardPrefetch.clearCache();

            await window.EveOS.DatapackIndex.ensureFresh({
                force: true,
                forceFull: true,
                reason: 'card-move-stale-index-smoke-prime'
            });

            window.renderDashboard();
            await waitFor(() => !!document.querySelector('.category-card[data-card-workspace="source-tab"][data-card-category="Moved Card"]'), 'source card did not render before move');
            window.switchWorkspace('target-tab');
            await waitFor(() => String(config.activeWorkspace || '') === 'target-tab', 'target tab did not become active before move');
            await wait(180);
            const targetCardBeforeMove = !!document.querySelector('.category-card[data-card-workspace="target-tab"][data-card-category="Moved Card"]');
            window.switchWorkspace('source-tab');
            await waitFor(() => String(config.activeWorkspace || '') === 'source-tab', 'source tab did not become active before move');
            await waitFor(() => !!document.querySelector('.category-card[data-card-workspace="source-tab"][data-card-category="Moved Card"]'), 'source card did not restore before move');
            const targetCacheKey = window.EveDashboardCache?.cacheKey?.('target-tab') || '';
            const targetWasCachedBeforeMove = targetCacheKey
                ? !!window.EveDashboardCache?.has?.(targetCacheKey)
                : false;

            const moveResult = window.moveCategoryCardToWorkspace('source-tab', 'Moved Card', 'target-tab', {
                requireConfirm: false,
                source: 'card-move-stale-index-render-smoke'
            });
            if (moveResult && typeof moveResult.then === 'function') await moveResult;
            const targetCacheClearedAfterMove = targetCacheKey
                ? !window.EveDashboardCache?.has?.(targetCacheKey)
                : true;

            const buildStateAfterMove = window.EveOS.DatapackIndex.getBuildState();
            const staleSummaryAfterMove = window.EveOS.DatapackIndex.getStructureSummary();
            const staleTargetCardCount = Number(staleSummaryAfterMove?.cards?.['target-tab::Moved Card']?.bookmarkCount || 0);

            window.switchWorkspace('target-tab');
            await waitFor(() => String(config.activeWorkspace || '') === 'target-tab', 'target tab did not become active');
            await waitFor(() => !!document.querySelector('.category-card[data-card-workspace="target-tab"][data-card-category="Moved Card"]'), 'target card did not render without reload');
            await wait(180);

            const targetCard = document.querySelector('.category-card[data-card-workspace="target-tab"][data-card-category="Moved Card"]');
            const sourceRouteText = targetCard?.querySelector('.card-subtab-sources')?.textContent?.replace(/\s+/g, ' ').trim() || '';
            const targetLinks = (typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : window.links)
                .filter((link) => link.workspace === 'target-tab' && link.category === 'Moved Card')
                .map((link) => link.id);

            return {
                moveDirty: !!buildStateAfterMove.dirty,
                targetCardBeforeMove,
                targetWasCachedBeforeMove,
                targetCacheClearedAfterMove,
                staleTargetCardCount,
                renderedWorkspace: targetCard?.getAttribute('data-card-workspace') || '',
                renderedCategory: targetCard?.getAttribute('data-card-category') || '',
                sourceRouteText,
                targetLinks
            };
        });

        assert(result.moveDirty, `Move should leave the index dirty for this smoke: ${JSON.stringify(result)}`);
        assert(!result.targetCardBeforeMove, `Target card should not exist before move: ${JSON.stringify(result)}`);
        assert(result.targetWasCachedBeforeMove, `Smoke did not prime the target tab cache before move: ${JSON.stringify(result)}`);
        assert(result.targetCacheClearedAfterMove, `Card move did not clear stale target tab cache: ${JSON.stringify(result)}`);
        assert(result.staleTargetCardCount === 0, `Primed stale index unexpectedly already knew target card: ${JSON.stringify(result)}`);
        assert(result.renderedWorkspace === 'target-tab', `Target card rendered in wrong workspace: ${JSON.stringify(result)}`);
        assert(result.renderedCategory === 'Moved Card', `Target card rendered with wrong category: ${JSON.stringify(result)}`);
        assert(!result.sourceRouteText.includes('Source Tab'), `Moved card kept stale source tab badge: ${JSON.stringify(result)}`);
        assert(result.targetLinks.length === 2, `Moved links did not land in target tab: ${JSON.stringify(result)}`);

        console.log('CARD_MOVE_STALE_INDEX_RENDER_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
