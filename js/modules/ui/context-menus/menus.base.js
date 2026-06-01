window.initContextMenus = function () {
    if (!document.getElementById('link-context-menu')) {
        document.body.insertAdjacentHTML('beforeend', window.ContextMenus.template);
    }
};

// Global State for Context Menus
window.ctxLinkId = null;
window.ctxCatName = null;
window.ctxWsId = null;
window.ctxSidebarGroupId = '';
window.ctxFolderId = null;
var folderContextStatsCache = new Map();
var folderContextStatsRequestToken = 0;

window.closeAllMenus = function () {
    document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
};

const ICON_LIBRARY_HTML = '&#128218;';

function getContextMenuLiveLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function placeContextMenu(menuElement, event) {
    if (!menuElement || !event) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 6;

    const baseX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const baseY = Number.isFinite(event.clientY) ? event.clientY : 0;

    menuElement.style.left = '0px';
    menuElement.style.top = '0px';
    menuElement.style.visibility = 'hidden';
    menuElement.style.display = 'block';

    const rect = menuElement.getBoundingClientRect();
    const menuWidth = rect.width || 180;
    const menuHeight = rect.height || 220;

    let x = baseX + gap;
    let y = baseY + gap;

    if (x + menuWidth > viewportWidth - 8) x = Math.max(8, viewportWidth - menuWidth - 8);
    if (y + menuHeight > viewportHeight - 8) y = Math.max(8, viewportHeight - menuHeight - 8);

    menuElement.style.left = `${x}px`;
    menuElement.style.top = `${y}px`;
    menuElement.style.visibility = 'visible';
}

function getFolderContextStatsCacheKey(workspaceId, categoryName, folderId) {
    return String(workspaceId || '').trim()
        + '::' + String(categoryName || '').trim()
        + '::' + String(folderId || '').trim();
}

function computeFolderContextStatsFromViewModel(viewModel, folderId) {
    let totalItems = 0;
    let totalFolders = 0;
    const normalizedFolderId = String(folderId || '').trim();
    if (!normalizedFolderId || !viewModel?.childrenMap || !viewModel?.folderLinks) {
        return { totalFolders: 0, totalItems: 0 };
    }

    (function recurseCount(currentFolderId) {
        const items = viewModel.folderLinks.get(currentFolderId) || [];
        totalItems += items.length;
        const children = viewModel.childrenMap.get(currentFolderId) || [];
        totalFolders += children.length;
        children.forEach(function (child) {
            recurseCount(child.id);
        });
    })(normalizedFolderId);

    return {
        totalFolders: totalFolders,
        totalItems: totalItems
    };
}

function getCachedFolderContextStats(workspaceId, categoryName, folderId) {
    const key = getFolderContextStatsCacheKey(workspaceId, categoryName, folderId);
    const cached = folderContextStatsCache.get(key);
    const storeRef = window.eveState?.bookmarkFolders || window.bookmarkFolders || null;
    const linksRef = getContextMenuLiveLinks();
    if (!cached) return null;
    if (cached.storeRef !== storeRef || cached.linksRef !== linksRef) return null;
    return cached.value || null;
}

function setCachedFolderContextStats(workspaceId, categoryName, folderId, value) {
    folderContextStatsCache.set(getFolderContextStatsCacheKey(workspaceId, categoryName, folderId), {
        storeRef: window.eveState?.bookmarkFolders || window.bookmarkFolders || null,
        linksRef: getContextMenuLiveLinks(),
        value: value || { totalFolders: 0, totalItems: 0 }
    });
}

function updateFolderContextStatsUi(statsFoldersEl, statsItemsEl, stats) {
    if (!(statsFoldersEl && statsItemsEl && stats)) return;
    statsFoldersEl.textContent = 'Overall Folders: ' + Number(stats.totalFolders || 0);
    statsItemsEl.textContent = 'Overall Items: ' + Number(stats.totalItems || 0);
}

function scheduleFolderContextStats(workspaceId, categoryName, folderId, statsFoldersEl, statsItemsEl) {
    if (!(statsFoldersEl && statsItemsEl)) return;

    const cachedStats = getCachedFolderContextStats(workspaceId, categoryName, folderId);
    if (cachedStats) {
        updateFolderContextStatsUi(statsFoldersEl, statsItemsEl, cachedStats);
        return;
    }

    const requestToken = ++folderContextStatsRequestToken;
    const runCompute = function () {
        if (requestToken !== folderContextStatsRequestToken) return;

        let stats = null;
        const cachedVM = window.EveFolderViewV2 && typeof window.EveFolderViewV2.getCachedViewModel === 'function'
            ? window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName)
            : null;

        if (cachedVM && cachedVM.childrenMap && cachedVM.folderLinks) {
            stats = computeFolderContextStatsFromViewModel(cachedVM, folderId);
        } else if (window.EveBookmarkFolders) {
            const folderLinks = typeof window.EveContextMenuActions?.getFolderCategoryLinks === 'function'
                ? window.EveContextMenuActions.getFolderCategoryLinks(workspaceId, categoryName)
                : [];
            const viewModel = window.EveBookmarkFolders.buildFolderView(workspaceId, categoryName, folderLinks, { skipGhosts: true });
            if (window.EveFolderViewV2?.setCachedViewModel) {
                window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, Object.assign(viewModel, { scopedLinks: folderLinks }));
            }
            stats = computeFolderContextStatsFromViewModel(viewModel, folderId);
        }

        if (!stats || requestToken !== folderContextStatsRequestToken) return;
        setCachedFolderContextStats(workspaceId, categoryName, folderId, stats);
        updateFolderContextStatsUi(statsFoldersEl, statsItemsEl, stats);
    };

    const hasCachedViewModel = !!(window.EveFolderViewV2 && typeof window.EveFolderViewV2.getCachedViewModel === 'function'
        && window.EveFolderViewV2.getCachedViewModel(workspaceId, categoryName));
    if (hasCachedViewModel) {
        setTimeout(runCompute, 0);
        return;
    }

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(runCompute, { timeout: 240 });
    } else {
        setTimeout(runCompute, 140);
    }
}

window.showFolderContextMenu = function (e, categoryName, folderId, workspaceId) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    window.ctxCatName = categoryName;
    window.ctxFolderId = folderId;
    window.ctxWsId = workspaceId || window.ctxWsId || ((window.config && window.config.activeWorkspace) || 'main');

    const m = document.getElementById('folder-context-menu');
    if (!m) return;

    const statsFoldersEl = document.getElementById('ctx-folder-stats-folders');
    const statsItemsEl = document.getElementById('ctx-folder-stats-items');
    if (statsFoldersEl && statsItemsEl) {
        statsFoldersEl.textContent = 'Overall Folders: ...';
        statsItemsEl.textContent = 'Overall Items: ...';
        scheduleFolderContextStats(window.ctxWsId, window.ctxCatName, folderId, statsFoldersEl, statsItemsEl);
        placeContextMenu(m, e);
        return;
    }
    
    if (statsFoldersEl && statsItemsEl) {
        // Show placeholder immediately, compute stats after menu paints
        statsFoldersEl.textContent = 'Overall Folders: …';
        statsItemsEl.textContent = 'Overall Items: …';

        // setTimeout(50) instead of rAF — ensures menu paints BEFORE stats compute
        setTimeout(function () {
            let totalItems = 0;
            let totalFolders = 0;

            // Fast path: use cached viewModel from the last dashboard render
            var cachedVM = window.EveFolderViewV2 && window.EveFolderViewV2.getCachedViewModel
                ? window.EveFolderViewV2.getCachedViewModel(window.ctxWsId, window.ctxCatName)
                : null;

            if (cachedVM && cachedVM.childrenMap && cachedVM.folderLinks) {
                // Count from cached viewModel — no link scanning needed
                (function recurseCount(fId) {
                    var items = cachedVM.folderLinks.get(fId) || [];
                    totalItems += items.length;
                    var children = cachedVM.childrenMap.get(fId) || [];
                    totalFolders += children.length;
                    children.forEach(function (child) { recurseCount(child.id); });
                })(folderId);
            } else if (window.EveBookmarkFolders) {
                // Slow fallback: build viewModel (with skipGhosts)
                var folderLinks = typeof window.EveContextMenuActions?.getFolderCategoryLinks === 'function'
                    ? window.EveContextMenuActions.getFolderCategoryLinks(window.ctxWsId, window.ctxCatName)
                    : [];
                var viewModel = window.EveBookmarkFolders.buildFolderView(window.ctxWsId, window.ctxCatName, folderLinks, { skipGhosts: true });
                (function recurseCount(fId) {
                    var items = viewModel.folderLinks.get(fId) || [];
                    totalItems += items.length;
                    var children = viewModel.childrenMap.get(fId) || [];
                    totalFolders += children.length;
                    children.forEach(function (child) { recurseCount(child.id); });
                })(folderId);
            }

            statsFoldersEl.textContent = 'Overall Folders: ' + totalFolders;
            statsItemsEl.textContent = 'Overall Items: ' + totalItems;
        }, 50);
    }

    placeContextMenu(m, e);
};

