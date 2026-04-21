window.EveDashboardMasonryHelpers = window.EveDashboardMasonryHelpers || {};

(function (ns) {
    var MAX_MASONRY_CARD_COUNT = 18;

    function getDashboardMasonryState() {
        var state = window.__dashboardMasonryState || {
            activeGrid: null,
            resizeObserver: null,
            rafId: 0
        };
        window.__dashboardMasonryState = state;
        return state;
    }

    function cleanupDashboardMasonryObserver() {
        var dashboardMasonryState = getDashboardMasonryState();
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
        if (window._evePerfMode) return false;
        if (grid.querySelectorAll('.category-card').length > MAX_MASONRY_CARD_COUNT) return false;
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
            grid.style.minHeight = '';
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
        if (!cards.length) {
            grid.style.minHeight = '';
            return;
        }

        var scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        var currentHeight = grid.offsetHeight;
        if (currentHeight > 100) {
            grid.style.minHeight = currentHeight + 'px';
        }

        for (var i = 0; i < cards.length; i++) {
            cards[i].style.gridRowEnd = 'auto';
        }

        var heights = new Array(cards.length);
        for (var j = 0; j < cards.length; j++) {
            heights[j] = cards[j].getBoundingClientRect().height;
        }

        for (var k = 0; k < cards.length; k++) {
            var span = Math.max(1, Math.ceil((heights[k] + rowGap) / (rowHeight + rowGap)));
            cards[k].style.gridRowEnd = 'span ' + span;
        }

        requestAnimationFrame(function () {
            grid.style.minHeight = '';
            if (Math.abs((window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) - scrollPos) > 10) {
                window.scrollTo(0, scrollPos);
            }
        });
    }

    function scheduleDashboardMasonryLayout(grid) {
        var dashboardMasonryState = getDashboardMasonryState();
        if (!grid) return;
        dashboardMasonryState.activeGrid = grid;

        var now = Date.now();
        if (dashboardMasonryState._lastLayout && (now - dashboardMasonryState._lastLayout) < 150) {
            if (!dashboardMasonryState._throttleTimer) {
                dashboardMasonryState._throttleTimer = setTimeout(function () {
                    dashboardMasonryState._throttleTimer = 0;
                    scheduleDashboardMasonryLayout(grid);
                }, 150);
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
        var dashboardMasonryState = getDashboardMasonryState();
        cleanupDashboardMasonryObserver();

        if (!shouldUseDashboardMasonry(grid) || typeof ResizeObserver !== 'function') {
            return;
        }

        var observer = new ResizeObserver(function () {
            scheduleDashboardMasonryLayout(grid);
        });

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

    Object.assign(ns, {
        applyDashboardLayoutMaintenance,
        cleanupDashboardMasonryObserver,
        clearDashboardMasonryCardSpans,
        observeDashboardMasonryLayout,
        refreshDashboardMasonryLayout,
        scheduleDashboardMasonryLayout,
        shouldUseDashboardMasonry
    });
})(window.EveDashboardMasonryHelpers);
