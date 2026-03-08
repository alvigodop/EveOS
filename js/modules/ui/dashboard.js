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

    grid.querySelectorAll('.category-card').forEach(function (card) {
        card.style.gridRowEnd = 'auto';
        var cardHeight = card.getBoundingClientRect().height;
        var span = Math.max(1, Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap)));
        card.style.gridRowEnd = 'span ' + span;
    });
}

function scheduleDashboardMasonryLayout(grid) {
    if (!grid) return;
    dashboardMasonryState.activeGrid = grid;

    if (dashboardMasonryState.rafId) {
        window.cancelAnimationFrame(dashboardMasonryState.rafId);
    }

    dashboardMasonryState.rafId = window.requestAnimationFrame(function () {
        dashboardMasonryState.rafId = window.requestAnimationFrame(function () {
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

    observer.observe(grid);
    grid.querySelectorAll('.category-card').forEach(function (card) {
        observer.observe(card);
    });

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

function renderDashboard() {
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

    const visibleLinks = searchStr
        ? links.filter(function (link) {
            return link.title.toLowerCase().includes(searchStr)
                || link.url.toLowerCase().includes(searchStr)
                || link.category.toLowerCase().includes(searchStr);
        })
        : links.filter(function (link) {
            return link.workspace === config.activeWorkspace;
        });

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
        applyDashboardLayoutMaintenance(grid);
    } else {
        console.error('renderCategories not found');
    }
}
