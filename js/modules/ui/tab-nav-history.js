// --- TAB NAVIGATION HISTORY & SIDEBAR POPOVER ---
// Provides back/forward workspace navigation, breadcrumb path display,
// and hover actions for global sidebar controls.
(function () {
    'use strict';
    var rt = window.EveTabNavRuntime = window.EveTabNavRuntime || {};
    if (!rt.sharedReady || !rt.popoverReady || !rt.routePeekReady) {
        console.warn('EveTabNav: helper modules missing');
        return;
    }

    window.EveTabNav = {
        goBack: rt.goBack,
        goForward: rt.goForward,
        canGoBack: rt.canGoBack,
        canGoForward: rt.canGoForward,
        collapseAllTabs: rt.collapseAllTabs,
        expandAllTabs: rt.expandAllTabs,
        toggleShowInactiveTabs: rt.toggleShowInactiveTabs,
        toggleShowSidebarDatapackBadges: rt.toggleShowSidebarDatapackBadges,
        refreshPopover: rt.updatePopoverState,
        getHistory: function () {
            return { stack: rt.state.history.slice(), index: rt.state.historyIndex };
        }
    };
})();
