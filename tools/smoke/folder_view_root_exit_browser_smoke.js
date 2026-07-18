const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveBookmarkFolders?.buildFolderView
        && !!window.EveFolderViewV2?.enterFolder
        && !!window.EveFolderViewV2?.exitFolder
        && !!window.EveFolderViewV2?.renderRootGrid
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(1500);

        const result = await page.evaluate(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const waitFor = async (predicate, timeoutMs, label) => {
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                    if (predicate()) return;
                    await wait(50);
                }
                const cards = Array.from(document.querySelectorAll('.category-card')).map((card) => ({
                    category: card.dataset.cardCategory || '',
                    workspace: card.dataset.cardWorkspace || '',
                    text: String(card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300)
                }));
                throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({
                    activeWorkspace: window.eveState?.config?.activeWorkspace || '',
                    linkCount: Array.isArray(window.eveState?.links) ? window.eveState.links.length : -1,
                    folderKeys: Object.keys(window.eveState?.bookmarkFolders || {}),
                    cards
                })}`);
            };

            function hasText(selector, text) {
                return Array.from(document.querySelectorAll(selector))
                    .some((node) => String(node.textContent || '').includes(text));
            }

            function hasRootItem(linkId) {
                return !!document.querySelector(`.v2-folder-root-container li[data-link-id="${CSS.escape(String(linkId))}"]`);
            }

            const seededLinks = [
                {
                    id: 'root-1',
                    title: 'Root Exit Bookmark',
                    url: 'https://example.com/root-exit',
                    workspace: 'main',
                    category: 'Reading'
                },
                {
                    id: 'folder-1',
                    title: 'Folder Bookmark',
                    url: 'https://example.com/folder',
                    workspace: 'main',
                    category: 'Reading',
                    folderId: 'f-parent'
                }
            ];
            const seededConfig = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }],
                viewMode: 'grid',
                categoryOrder: ['Reading'],
                hiddenCategories: [],
                collapsedCategories: [],
                cardFolderViewModes: { 'main::Reading': true },
                activeManhwaFolders: {},
                activeManhwaFolderChains: {},
                activeManhwaScopeRoots: {}
            });
            const seededFolders = {
                'main::Reading': {
                    nodes: [
                        { id: 'f-parent', parentId: null, name: 'Folder A', order: 0 }
                    ],
                    settings: { clickBehaviorMode: 'inherit' }
                }
            };

            if (typeof window.EveDashboardPrefetch?.clearCache === 'function') {
                window.EveDashboardPrefetch.clearCache();
            }
            if (typeof window.setLiveLinks === 'function') {
                window.setLiveLinks(seededLinks);
            }
            window.links = links = seededLinks;
            window.config = config = seededConfig;
            window.bookmarkFolders = bookmarkFolders = seededFolders;
            if (window.eveState) {
                window.eveState.links = seededLinks;
                window.eveState.config = seededConfig;
                window.eveState.bookmarkFolders = seededFolders;
            }
            window.EveFolderViewV2.invalidateAllCachedViewModels?.();
            window.__eveDashboardRenderHint = { kind: 'workspace-switch', fromWorkspaceId: 'seed-reset', toWorkspaceId: 'main' };
            window.renderDashboard();

            await waitFor(() => (
                hasText('.v2-folder-root-container', 'Root Exit Bookmark')
                && hasText('.folder-tile-title', 'Folder A')
                && hasText('.folder-tile-title', '[ System Views ]')
            ), 6000, 'root bookmark and folder tile');

            window.EveFolderViewV2.enterFolder(null, 'Reading', 'f-parent', 'main');
            await waitFor(() => (
                hasText('.v2-folder-container', 'Folder Bookmark')
                && hasText('.folder-breadcrumbs', 'READING')
            ), 6000, 'folder contents');

            const card = document.querySelector('.category-card[data-card-category="Reading"][data-card-workspace="main"]');
            if (!card || !card.dataset.mode1Html) {
                throw new Error('Expected folder entry to preserve root mode HTML');
            }

            // Simulate the stale snapshot path that caused root bookmarks to disappear
            // after leaving a folder.
            card.dataset.mode1Html = ''
                + '<div class="card-folder-view-content">'
                + '<div class="v2-folder-root-container card-folder-view-content" style="padding: 0 10px 10px;">'
                + '<div class="folder-wrap-grid"></div>'
                + '</div>'
                + '</div>';

            const previousPerfMode = !!window._evePerfMode;
            window._evePerfMode = true;
            window.EveFolderViewV2.exitFolder(null, 'Reading', 'main');
            window._evePerfMode = previousPerfMode;
            await waitFor(() => (
                hasText('.v2-folder-root-container', 'Root Exit Bookmark')
                && hasText('.folder-tile-title', '[ System Views ]')
                && !document.querySelector('.v2-folder-container')
            ), 6000, 'fresh root content after exit');

            const activeKey = 'main::Reading';
            return {
                rootBookmarkVisible: hasRootItem('root-1'),
                systemViewsVisible: hasText('.folder-tile-title', '[ System Views ]'),
                folderBookmarkHiddenAtRoot: !hasRootItem('folder-1'),
                activeFolderState: window.eveState?.config?.activeManhwaFolders?.[activeKey] || '',
                cachedRootCount: window.EveFolderViewV2.getCachedViewModel('main', 'Reading')?.rootLinks?.length || 0
            };
        });

        if (!result.rootBookmarkVisible) {
            throw new Error(`Expected root bookmark after folder exit: ${JSON.stringify(result)}`);
        }
        if (!result.systemViewsVisible) {
            throw new Error(`Expected System Views after perf-mode folder exit: ${JSON.stringify(result)}`);
        }
        if (!result.folderBookmarkHiddenAtRoot) {
            throw new Error(`Folder bookmark leaked into root after folder exit: ${JSON.stringify(result)}`);
        }
        if (result.activeFolderState) {
            throw new Error(`Active folder state was not cleared after exit: ${JSON.stringify(result)}`);
        }
        if (result.cachedRootCount !== 1) {
            throw new Error(`Expected fresh cached root count of 1: ${JSON.stringify(result)}`);
        }

        console.log('FOLDER_VIEW_ROOT_EXIT_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
