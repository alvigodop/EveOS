// --- DASHBOARD CORE ---

var dashboardMasonryState = window.__dashboardMasonryState || {
    activeGrid: null,
    resizeObserver: null,
    rafId: 0
};
window.__dashboardMasonryState = dashboardMasonryState;

function cleanupDashboardMasonryObserver() {
    if (dashboardMasonryState.resizeObserver) {
        dashboardMasonryState.resizeObserver.disconnect();
        dashboardMasonryState.resizeObserver = null;
    }
}

function clearDashboardMasonryCardSpans(grid) {
    if (!grid) return;
    grid.querySelectorAll('.category-card').forEach(function (card) {
        card.style.gridRowEnd = '';
    });
}

function shouldUseDashboardMasonry(grid) {
    if (!grid) return false;
    return !grid.classList.contains('list-mode')
        && !grid.classList.contains('focus-mode')
        && !grid.classList.contains('unidex-mode');
}

function refreshDashboardMasonryLayout(grid) {
    if (!grid) return;

    var enableMasonry = shouldUseDashboardMasonry(grid);
    grid.classList.toggle('masonry-layout', enableMasonry);

    if (!enableMasonry) {
        clearDashboardMasonryCardSpans(grid);
        return;
    }

    var computedStyle = window.getComputedStyle(grid);
    var rowHeight = parseFloat(computedStyle.getPropertyValue('grid-auto-rows'));
    var rowGap = parseFloat(computedStyle.getPropertyValue('row-gap'));

    if (!rowHeight || Number.isNaN(rowHeight)) return;
    if (!rowGap || Number.isNaN(rowGap)) {
        rowGap = parseFloat(computedStyle.getPropertyValue('gap')) || 0;
    }

    var cards = grid.querySelectorAll('.category-card');

    // Batch write: reset all spans first
    for (var i = 0; i < cards.length; i++) {
        cards[i].style.gridRowEnd = 'auto';
    }

    // Batch read: measure all heights at once
    var heights = new Array(cards.length);
    for (var j = 0; j < cards.length; j++) {
        heights[j] = cards[j].getBoundingClientRect().height;
    }

    // Batch write: apply all spans
    for (var k = 0; k < cards.length; k++) {
        var span = Math.max(1, Math.ceil((heights[k] + rowGap) / (rowHeight + rowGap)));
        cards[k].style.gridRowEnd = 'span ' + span;
    }
}

function scheduleDashboardMasonryLayout(grid) {
    if (!grid) return;
    dashboardMasonryState.activeGrid = grid;

    // Hard throttle: max once per 200ms
    var now = Date.now();
    if (dashboardMasonryState._lastLayout && (now - dashboardMasonryState._lastLayout) < 200) {
        if (!dashboardMasonryState._throttleTimer) {
            dashboardMasonryState._throttleTimer = setTimeout(function () {
                dashboardMasonryState._throttleTimer = 0;
                scheduleDashboardMasonryLayout(grid);
            }, 200);
        }
        return;
    }

    if (dashboardMasonryState.rafId) {
        window.cancelAnimationFrame(dashboardMasonryState.rafId);
    }

    dashboardMasonryState.rafId = window.requestAnimationFrame(function () {
        dashboardMasonryState.rafId = window.requestAnimationFrame(function () {
            dashboardMasonryState._lastLayout = Date.now();
            refreshDashboardMasonryLayout(grid);
        });
    });
}

function observeDashboardMasonryLayout(grid) {
    cleanupDashboardMasonryObserver();

    if (!shouldUseDashboardMasonry(grid) || typeof ResizeObserver !== 'function') {
        return;
    }

    var observer = new ResizeObserver(function () {
        scheduleDashboardMasonryLayout(grid);
    });

    // Only observe the grid container — skip per-card observers when there are many cards
    observer.observe(grid);
    var cards = grid.querySelectorAll('.category-card');
    if (cards.length <= 15) {
        cards.forEach(function (card) {
            observer.observe(card);
        });
    }

    dashboardMasonryState.resizeObserver = observer;
}

function applyDashboardLayoutMaintenance(grid) {
    scheduleDashboardMasonryLayout(grid);
    observeDashboardMasonryLayout(grid);
}

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

function renderDashboard() {
    // Coalesce rapid-fire render calls into a single frame
    if (window._eveDashRenderPending) return;
    window._eveDashRenderPending = true;
    requestAnimationFrame(function () {
        window._eveDashRenderPending = false;
        _renderDashboardImmediate();
    });
}

function _renderDashboardImmediate() {
    var cardScrollState = captureDashboardCardScrollState();

    // Capture scroll position ONCE per synchronous batch
    if (_scrollSave < 0) {
        _scrollSave = document.documentElement.scrollTop || window.pageYOffset || 0;

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

    // Run render synchronously — DOM is rebuilt immediately but Masonry takes later frames
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
    }, 300);
}

function _renderDashboardCore() {
    const grid = document.getElementById('dashboard-grid');
    const dock = document.getElementById('dock-container');
    const searchInput = document.getElementById('search');
    const focusBanner = document.getElementById('focus-banner');
    const mainContent = document.getElementById('main-content');

    if (!grid) return;

    cleanupDashboardMasonryObserver();
    const searchStr = searchInput ? searchInput.value.toLowerCase() : '';
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
    const visibleWorkspaceIds = new Set([activeWorkspaceId]);
    const helpers = window.EveWorkspaceHelpers;
    if (helpers) {
        const activeWs = helpers.findById(config.workspaces || [], activeWorkspaceId);
        if (activeWs && !activeWs.hideSubTabs && Array.isArray(activeWs.subTabs) && activeWs.subTabs.length > 0) {
            helpers.getVisibleDescendantIds(activeWs).forEach(function (id) { visibleWorkspaceIds.add(id); });
        }
    }
    // Expose for link badge rendering
    window._eveActiveVisibleWorkspaceIds = visibleWorkspaceIds;

    const visibleLinks = links.filter(function (link) {
        if (!visibleWorkspaceIds.has(String(link?.workspace || 'main').trim())) return false;
        if (!searchStr) return true;
        return String(link?.title || '').toLowerCase().includes(searchStr)
            || String(link?.url || '').toLowerCase().includes(searchStr)
            || String(link?.category || 'Unsorted').toLowerCase().includes(searchStr);
    });

    // Performance mode: skip expensive per-link operations when workspace is large
    window._evePerfMode = visibleLinks.length > 200;

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
        window.renderCategories(visibleLinks, grid, focusCategory, searchStr);
        // Defer masonry layout to after initial cards have painted
        setTimeout(function () { applyDashboardLayoutMaintenance(grid); }, 100);
    } else {
        console.error('renderCategories not found');
    }
}
