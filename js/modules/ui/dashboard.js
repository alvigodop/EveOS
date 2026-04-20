// --- DASHBOARD CORE ---

var dashboardMasonryState = window.__dashboardMasonryState || {
    activeGrid: null,
    resizeObserver: null,
    rafId: 0
};
window.__dashboardMasonryState = dashboardMasonryState;
var dashboardMasonryHelpers = window.EveDashboardMasonryHelpers || {};
var cleanupDashboardMasonryObserver = dashboardMasonryHelpers.cleanupDashboardMasonryObserver;
var clearDashboardMasonryCardSpans = dashboardMasonryHelpers.clearDashboardMasonryCardSpans;
var shouldUseDashboardMasonry = dashboardMasonryHelpers.shouldUseDashboardMasonry;
var refreshDashboardMasonryLayout = dashboardMasonryHelpers.refreshDashboardMasonryLayout;
var scheduleDashboardMasonryLayout = dashboardMasonryHelpers.scheduleDashboardMasonryLayout;
var observeDashboardMasonryLayout = dashboardMasonryHelpers.observeDashboardMasonryLayout;
var applyDashboardLayoutMaintenance = dashboardMasonryHelpers.applyDashboardLayoutMaintenance;
if (!window.__dashboardMasonryResizeBound) {
    window.__dashboardMasonryResizeBound = true;
    window.addEventListener('resize', function () {
        if (dashboardMasonryState.activeGrid) {
            scheduleDashboardMasonryLayout(dashboardMasonryState.activeGrid);
        }
    });
}

var _scrollSave = -1;
var _scrollRafId = 0;
var _scrollSpacer = null;
var _dashboardScrollableSelectors = [
    '.category-scrollable',
    '.bookmark-folder-sections',
    '.v2-folder-root-container',
    '.v2-folder-container',
    '.focused-category-entries'
];

function escapeDashboardSelectorValue(value) {
    return String(value).replace(/["\\]/g, '\\$&');
}

function captureDashboardCardScrollState() {
    var snapshot = {};
    document.querySelectorAll('.category-card[data-card-target-id]').forEach(function (card) {
        var targetId = String(card.getAttribute('data-card-target-id') || '').trim();
        if (!targetId) return;
        for (var i = 0; i < _dashboardScrollableSelectors.length; i += 1) {
            var selector = _dashboardScrollableSelectors[i];
            var node = card.querySelector(selector);
            if (!node) continue;
            var top = Number(node.scrollTop || 0);
            var left = Number(node.scrollLeft || 0);
            var isScrollable = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
            if (!isScrollable && top <= 0 && left <= 0) continue;
            snapshot[targetId] = {
                selector: selector,
                top: top,
                left: left
            };
            break;
        }
    });
    return snapshot;
}

function restoreDashboardCardScrollState(snapshot) {
    if (!snapshot) return;
    Object.keys(snapshot).forEach(function (targetId) {
        var state = snapshot[targetId];
        if (!state) return;
        var card = document.querySelector('.category-card[data-card-target-id="' + escapeDashboardSelectorValue(targetId) + '"]');
        if (!card) return;
        var node = card.querySelector(state.selector);
        if (!node) return;
        if (typeof state.top === 'number') node.scrollTop = state.top;
        if (typeof state.left === 'number') node.scrollLeft = state.left;
    });
}

// Monotonically increasing render generation â€” all deferred work checks this
var _eveDashRenderGen = 0;
window._eveDashRenderGen = 0;

function renderDashboard() {
    // Coalesce rapid-fire render calls into a single frame
    if (window._eveDashRenderPending) return;
    window._eveDashRenderPending = true;
    requestAnimationFrame(function () {
        window._eveDashRenderPending = false;
        _renderDashboardImmediate();
    });
}

function _getRobustScrollTop() {
    return Math.max(
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
        window.scrollY || 0
    );
}

function _renderDashboardImmediate() {
    var cardScrollState = captureDashboardCardScrollState();

    // Capture scroll position ONCE per synchronous batch
    if (_scrollSave < 0) {
        _scrollSave = _getRobustScrollTop();

        // Create a proper block-level spacer on the body to physically hold height
        // This is necessary because Masonry layout takes time/frames to expand the grid
        if (_scrollSave > 0) {
            _scrollSpacer = document.createElement('div');
            _scrollSpacer.style.cssText = 'height:' + Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) + 'px; width:100%; position:absolute; top:0; left:0; z-index:-1; pointer-events:none; visibility:hidden; display:block;';
            document.body.appendChild(_scrollSpacer);
        }
    }

    // Cancel any pending cleanup from a previous call in this batch
    if (_scrollRafId) {
        clearTimeout(_scrollRafId);
        _scrollRafId = 0;
    }

    // Run render synchronously â€” DOM is rebuilt immediately but Masonry takes later frames
    _renderDashboardCore();

    // Restore scroll position immediately
    window.scrollTo(0, _scrollSave);
    restoreDashboardCardScrollState(cardScrollState);

    // Remove spacer and affirm scroll position AFTER Masonry has likely finished
    // 300ms is generous enough to span typical reflows and transitions
    var target = _scrollSave;
    _scrollRafId = setTimeout(function () {
        window.scrollTo(0, target);
        restoreDashboardCardScrollState(cardScrollState);
        if (_scrollSpacer && _scrollSpacer.parentNode) {
            _scrollSpacer.parentNode.removeChild(_scrollSpacer);
        }
        _scrollSpacer = null;
        _scrollSave = -1;
        _scrollRafId = 0;
    }, 350);
}

function _renderDashboardCore() {
    const grid = document.getElementById('dashboard-grid');
    const dock = document.getElementById('dock-container');
    const searchInput = document.getElementById('search');
    const focusBanner = document.getElementById('focus-banner');
    const mainContent = document.getElementById('main-content');

    if (!grid) return;

    // Bump generation â€” all in-flight deferred work from previous renders is now stale
    _eveDashRenderGen++;
    window._eveDashRenderGen = _eveDashRenderGen;

    cleanupDashboardMasonryObserver();
    const searchStr = searchInput ? searchInput.value.toLowerCase() : '';
    const searchTerms = searchStr ? searchStr.split(/\s+/).filter(Boolean) : [];
    const isListMode = config.viewMode === 'list';
    const isUnidexMode = config.viewMode === 'unidex';

    grid.innerHTML = '';
    if (dock) dock.innerHTML = '';

    grid.classList.toggle('list-mode', isListMode);
    grid.classList.toggle('unidex-mode', isUnidexMode);
    grid.classList.toggle('focus-mode', !!focusCategory && !isUnidexMode);
    if (mainContent) mainContent.classList.toggle('unidex-view-active', isUnidexMode);

    const activeWorkspaceId = String(config.activeWorkspace || 'main').trim() || 'main';

    // Build the set of workspace IDs to include in this view
    const visibleWorkspaceIds = new Set();
    const helpers = window.EveWorkspaceHelpers;
    const groupsApi = window.EveSidebarGroups || null;
    const overviewGroupId = String(config.groupOverviewId || '').trim();
    const groupOverviewRootMap = new Map();

    function addDescendantsToRoot(rootNode, ownerRootId) {
        if (!rootNode || !helpers) return;
        if (!rootNode.hideSubTabs && Array.isArray(rootNode.subTabs) && rootNode.subTabs.length > 0) {
            helpers.getVisibleDescendantIds(rootNode).forEach(function (id) {
                visibleWorkspaceIds.add(id);
                if (ownerRootId && !groupOverviewRootMap.has(String(id))) {
                    groupOverviewRootMap.set(String(id), ownerRootId);
                }
            });
        }
    }

    if (overviewGroupId && groupsApi && typeof groupsApi.getGroupRoots === 'function' && helpers) {
        groupsApi.getGroupRoots(overviewGroupId, config).forEach(function (rootWs) {
            if (!rootWs || !rootWs.id) return;
            const rootId = String(rootWs.id);
            visibleWorkspaceIds.add(rootId);
            groupOverviewRootMap.set(rootId, rootId);

            let resolvedRoot = rootWs;
            if (rootWs.linkedTo) {
                const linkedTarget = helpers.findById(config.workspaces || [], rootWs.linkedTo);
                if (linkedTarget) {
                    visibleWorkspaceIds.add(String(linkedTarget.id));
                    // Don't overwrite â€” if the linkedTo target is itself a group root, it owns its own cards.
                    if (!groupOverviewRootMap.has(String(linkedTarget.id))) {
                        groupOverviewRootMap.set(String(linkedTarget.id), rootId);
                    }
                    resolvedRoot = linkedTarget;
                }
            }
            addDescendantsToRoot(resolvedRoot, rootId);
        });

        const resolvedLinkedIds = new Set();
        Array.from(visibleWorkspaceIds).forEach(function (wsId) {
            const ws = helpers.findById(config.workspaces || [], wsId);
            if (!ws || !ws.linkedTo || resolvedLinkedIds.has(ws.linkedTo)) return;
            resolvedLinkedIds.add(ws.linkedTo);
            const linkedTarget = helpers.findById(config.workspaces || [], ws.linkedTo);
            if (!linkedTarget) return;
            const ownerRoot = groupOverviewRootMap.get(String(wsId)) || '';
            visibleWorkspaceIds.add(linkedTarget.id);
            if (ownerRoot && !groupOverviewRootMap.has(String(linkedTarget.id))) {
                groupOverviewRootMap.set(String(linkedTarget.id), ownerRoot);
            }
            addDescendantsToRoot(linkedTarget, ownerRoot);
        });
    } else {
        visibleWorkspaceIds.add(activeWorkspaceId);
        if (helpers) {
            const activeWs = helpers.findById(config.workspaces || [], activeWorkspaceId);

            let resolvedWs = activeWs;
            if (activeWs && activeWs.linkedTo) {
                const targetWs = helpers.findById(config.workspaces || [], activeWs.linkedTo);
                if (targetWs) {
                    visibleWorkspaceIds.add(targetWs.id);
                    resolvedWs = targetWs;
                }
            }

            if (resolvedWs && !resolvedWs.hideSubTabs && Array.isArray(resolvedWs.subTabs) && resolvedWs.subTabs.length > 0) {
                helpers.getVisibleDescendantIds(resolvedWs).forEach(function (id) { visibleWorkspaceIds.add(id); });
            }

            // Second pass: resolve linkedTo for any sub-tab that is itself a linked tab.
            // This ensures nested linked tabs contribute their target's content to the parent view.
            var resolvedLinkedIds = new Set();
            visibleWorkspaceIds.forEach(function (wsId) {
                if (wsId === activeWorkspaceId) return; // already resolved above
                var ws = helpers.findById(config.workspaces || [], wsId);
                if (ws && ws.linkedTo && !resolvedLinkedIds.has(ws.linkedTo)) {
                    resolvedLinkedIds.add(ws.linkedTo);
                    var linkedTarget = helpers.findById(config.workspaces || [], ws.linkedTo);
                    if (linkedTarget) {
                        visibleWorkspaceIds.add(linkedTarget.id);
                        // Also include the linked target's visible descendants
                        if (!linkedTarget.hideSubTabs && Array.isArray(linkedTarget.subTabs) && linkedTarget.subTabs.length > 0) {
                            helpers.getVisibleDescendantIds(linkedTarget).forEach(function (descId) {
                                visibleWorkspaceIds.add(descId);
                            });
                        }
                    }
                }
            });
        }
    }
    // Expose for link badge rendering
    window._eveActiveVisibleWorkspaceIds = visibleWorkspaceIds;
    window._eveGroupOverviewRootMap = (overviewGroupId && groupOverviewRootMap.size) ? groupOverviewRootMap : null;
    const folderPathLabelBuilder = window.EveBookmarkFolders?.buildFolderPathLabel;

    const visibleLinks = links.filter(function (link) {
        if (!visibleWorkspaceIds.has(String(link?.workspace || 'main').trim())) return false;
        if (searchTerms.length === 0) return true;

        const titleStr = String(link?.title || link?.name || '').toLowerCase();
        const nameStr = String(link?.name || '').toLowerCase();
        const urlStr = String(link?.url || '').toLowerCase();
        const catStr = String(link?.category || 'Unsorted').toLowerCase();
        const folderStr = String(link?.folderId || '').toLowerCase();
        const folderLabelStr = typeof folderPathLabelBuilder === 'function'
            ? String(folderPathLabelBuilder(link?.workspace, link?.category, link?.folderId) || '').toLowerCase()
            : '';
        const notesStr = String(link?.notes || '').toLowerCase();
        const tagsStr = Array.isArray(link?.tags)
            ? link.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean).join(' ').toLowerCase()
            : '';

        return searchTerms.every(function (term) {
            return titleStr.includes(term)
                || nameStr.includes(term)
                || urlStr.includes(term)
                || catStr.includes(term)
                || folderStr.includes(term)
                || folderLabelStr.includes(term)
                || notesStr.includes(term)
                || tagsStr.includes(term);
        });
    });
    // Level 1: Standard Perf Mode (600+) - degraded animations, basic throttling
    // Level 2: Mega Perf Mode (1500+) - strip icons, strip hovers, max throttling
    window._evePerfMode = visibleLinks.length > 600;
    window._eveMegaPerfMode = visibleLinks.length > 1500;

    if (isUnidexMode) {
        if (focusBanner) focusBanner.style.display = 'none';
        if (dock) dock.classList.add('hidden');

        if (window.UnidexView && typeof window.UnidexView.render === 'function') {
            window.UnidexView.render(grid, { searchStr: searchStr });
        } else {
            grid.innerHTML = '<div class="unidex-empty-state"><h3>Unidex View Module Missing</h3><p>Reload to retry.</p></div>';
        }
        applyDashboardLayoutMaintenance(grid);
        return;
    }

    if (focusBanner) {
        focusBanner.style.display = focusCategory ? 'block' : 'none';
        if (focusCategory) focusBanner.innerHTML = `&#127919; FOCUS: ${focusCategory} (Click to Exit)`;
    }

    if (typeof window.renderDock === 'function') {
        window.renderDock(visibleLinks, dock, focusCategory);
    } else {
        console.error('renderDock not found');
    }

    if (typeof window.renderCategories === 'function') {
        window.renderCategories(visibleLinks, grid, focusCategory, searchStr, _eveDashRenderGen);
        // Defer masonry layout to after initial cards have painted
        var _masonryGen = _eveDashRenderGen;
        setTimeout(function () {
            if (_eveDashRenderGen !== _masonryGen) return;
            applyDashboardLayoutMaintenance(grid);
        }, 100);
    } else {
        console.error('renderCategories not found');
    }
}
