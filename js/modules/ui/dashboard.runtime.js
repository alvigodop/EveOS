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
var _dashboardScrollActivitySeq = 0;
window._dashboardScrollActivitySeq = 0;
var _dashboardIgnoreScrollActivityUntil = 0;
var _dashboardLiveLinkMapCache = {
    ref: null,
    length: -1,
    firstId: '',
    lastId: '',
    map: null
};
var _dashboardScrollableSelectors = [
    '.category-scrollable',
    '.bookmark-folder-sections',
    '.v2-folder-root-container',
    '.v2-folder-container',
    '.focused-category-entries'
];

function getDashboardPrimaryScrollHost() {
    var mainContent = document.getElementById('main-content');
    if (mainContent && mainContent.scrollHeight > mainContent.clientHeight) return mainContent;
    return document.scrollingElement || document.documentElement || document.body || null;
}
window.getDashboardPrimaryScrollHost = getDashboardPrimaryScrollHost;

function isDashboardScrollableElement(node) {
    if (!node || node === document || node === window) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    var overflowY = String(style?.overflowY || style?.overflow || '').toLowerCase();
    var canScroll = /(auto|scroll|overlay)/.test(overflowY);
    return canScroll && node.scrollHeight > node.clientHeight + 2;
}
window.isDashboardScrollableElement = isDashboardScrollableElement;

function getDashboardNearestScrollHost(fromNode, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var skipNode = opts.skipNode || null;
    var node = fromNode?.parentElement || null;
    while (node && node !== document.body && node !== document.documentElement) {
        if (node !== skipNode && isDashboardScrollableElement(node)) return node;
        node = node.parentElement;
    }
    return getDashboardPrimaryScrollHost();
}
window.getDashboardNearestScrollHost = getDashboardNearestScrollHost;

function getDashboardScrollTop() {
    var host = getDashboardPrimaryScrollHost();
    if (!host) return 0;
    if (host === document.body || host === document.documentElement) {
        return Math.max(
            window.pageYOffset || 0,
            document.documentElement.scrollTop || 0,
            document.body.scrollTop || 0,
            window.scrollY || 0
        );
    }
    return Number(host.scrollTop || 0);
}
window.getDashboardScrollTop = getDashboardScrollTop;

function setDashboardScrollTop(top) {
    var nextTop = Math.max(0, Number(top || 0));
    var host = getDashboardPrimaryScrollHost();
    if (!host) return;
    if (host === document.body || host === document.documentElement) {
        window.scrollTo(0, nextTop);
        return;
    }
    host.scrollTop = nextTop;
}
window.setDashboardScrollTop = setDashboardScrollTop;

function getDashboardLibrarySurfacePanel(surface) {
    if (!surface || surface.kind !== 'card-library') return null;
    if (surface.panel && document.body.contains(surface.panel)) return surface.panel;
    var categoryName = String(surface.categoryName || '').trim();
    if (!categoryName) return null;
    var panelId = 'lib-' + categoryName.replace(/[^a-zA-Z0-9]/g, '_') + '-panel';
    return document.getElementById(panelId);
}
window.getDashboardLibrarySurfacePanel = getDashboardLibrarySurfacePanel;

function isDashboardFocusedCardLibrarySurface(surface) {
    if (!surface || surface.kind !== 'card-library') return false;
    if (surface.isFocusedCard === true) return true;
    var panel = getDashboardLibrarySurfacePanel(surface);
    return !!panel?.closest('.category-card.is-focus-mode');
}
window.isDashboardFocusedCardLibrarySurface = isDashboardFocusedCardLibrarySurface;

function isDashboardInlineCardLibrarySurface(surface) {
    if (!surface || surface.kind !== 'card-library') return false;
    var panel = getDashboardLibrarySurfacePanel(surface);
    if (!panel) return surface.isFocusedCard === false;
    var card = panel.closest('.category-card');
    return !!card && !card.classList.contains('is-focus-mode');
}
window.isDashboardInlineCardLibrarySurface = isDashboardInlineCardLibrarySurface;

function isDashboardInlineCardLibrarySurfaceActive() {
    return isDashboardInlineCardLibrarySurface(window.__eveOpenCardLibrarySurface || null);
}
window.isDashboardInlineCardLibrarySurfaceActive = isDashboardInlineCardLibrarySurfaceActive;

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

function markDashboardProgrammaticScrollWindow(durationMs) {
    var safeDurationMs = Math.max(8, Number(durationMs || 0) || 16);
    _dashboardIgnoreScrollActivityUntil = Math.max(_dashboardIgnoreScrollActivityUntil, Date.now() + safeDurationMs);
}
window.markDashboardProgrammaticScrollWindow = markDashboardProgrammaticScrollWindow;

function clearDashboardScrollPreservation() {
    if (_scrollRafId) {
        clearTimeout(_scrollRafId);
        _scrollRafId = 0;
    }
    if (_scrollSpacer && _scrollSpacer.parentNode) {
        _scrollSpacer.parentNode.removeChild(_scrollSpacer);
    }
    _scrollSpacer = null;
    _scrollSave = -1;
}

function hasDashboardScrollPreservation() {
    return !!(_scrollRafId || _scrollSpacer || _scrollSave >= 0);
}

function noteDashboardUserScrollActivity(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!opts.force && Date.now() <= _dashboardIgnoreScrollActivityUntil) return;
    _dashboardScrollActivitySeq += 1;
    window._dashboardScrollActivitySeq = _dashboardScrollActivitySeq;
    if (opts.clearPreservation !== false && hasDashboardScrollPreservation()) {
        clearDashboardScrollPreservation();
    }
}
window.noteDashboardUserScrollActivity = noteDashboardUserScrollActivity;

function cancelDashboardScrollPreservationForUserInput() {
    noteDashboardUserScrollActivity({ force: true });
}

function isDashboardScrollKey(event) {
    var key = String(event?.key || '').trim();
    return key === 'ArrowUp'
        || key === 'ArrowDown'
        || key === 'PageUp'
        || key === 'PageDown'
        || key === 'Home'
        || key === 'End'
        || key === ' '
        || key === 'Spacebar';
}

if (!window.__dashboardScrollCaptureBound) {
    window.__dashboardScrollCaptureBound = true;
    document.addEventListener('scroll', function () {
        noteDashboardUserScrollActivity();
    }, true);
    window.addEventListener('wheel', function () {
        cancelDashboardScrollPreservationForUserInput();
    }, { passive: true });
    window.addEventListener('touchmove', function () {
        cancelDashboardScrollPreservationForUserInput();
    }, { passive: true });
    document.addEventListener('keydown', function (event) {
        if (!isDashboardScrollKey(event)) return;
        var activeEl = document.activeElement;
        var tagName = String(activeEl?.tagName || '').toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || activeEl?.isContentEditable) return;
        cancelDashboardScrollPreservationForUserInput();
    }, true);
}

// Monotonically increasing render generation â€” all deferred work checks this
var _eveDashRenderGen = 0;
window._eveDashRenderGen = 0;

function invalidateDashboardDeferredWork(options) {
    var opts = options && typeof options === 'object' ? options : {};
    _eveDashRenderGen++;
    window._eveDashRenderGen = _eveDashRenderGen;
    clearDashboardScrollPreservation();

    if (dashboardMasonryState.rafId) {
        window.cancelAnimationFrame(dashboardMasonryState.rafId);
        dashboardMasonryState.rafId = 0;
    }
    if (dashboardMasonryState._throttleTimer) {
        clearTimeout(dashboardMasonryState._throttleTimer);
        dashboardMasonryState._throttleTimer = 0;
    }
    if (opts.cleanupMasonry !== false) {
        cleanupDashboardMasonryObserver();
    }

    return _eveDashRenderGen;
}

window.invalidateDashboardDeferredWork = invalidateDashboardDeferredWork;
