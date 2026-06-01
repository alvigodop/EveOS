window.EveTabNavRuntime = window.EveTabNavRuntime || {};

(function () {
    const rt = window.EveTabNavRuntime;
    if (rt.coreReady) return;

    if (rt.sharedReady) return;

    var DEFAULT_ICON = '\u{1F4C1}';
    var MAX_HISTORY = 50;
    var state = rt.state || (rt.state = {
        history: [],
        historyIndex: -1,
        suppressPush: false,
        popoverEl: null,
        hideTimeout: null,
        routePeekEl: null,
        routePeekHideTimeout: null,
        searchResultsCache: []
    });

    function updatePopover() {
        if (typeof rt.updatePopoverState === 'function') {
            rt.updatePopoverState();
        }
    }

    function pushHistory(wsId) {
        if (state.suppressPush) return;
        var id = String(wsId || '').trim();
        if (!id) return;
        if (state.historyIndex >= 0 && state.history[state.historyIndex] === id) return;
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        state.history.push(id);
        if (state.history.length > MAX_HISTORY) state.history.shift();
        state.historyIndex = state.history.length - 1;
    }

    function canGoBack() {
        return state.historyIndex > 0;
    }

    function canGoForward() {
        return state.historyIndex < state.history.length - 1;
    }

    function navigateTo(wsId) {
        state.suppressPush = true;
        if (typeof window.switchWorkspace === 'function') {
            window.switchWorkspace(wsId);
        }
        state.suppressPush = false;
    }

    function goBack() {
        if (!canGoBack()) return;
        state.historyIndex -= 1;
        navigateTo(state.history[state.historyIndex]);
        updatePopover();
    }

    function goForward() {
        if (!canGoForward()) return;
        state.historyIndex += 1;
        navigateTo(state.history[state.historyIndex]);
        updatePopover();
    }

    function hookSwitchWorkspace() {
        var originalSwitch = window.switchWorkspace;
        if (!originalSwitch || originalSwitch._tabNavHooked) return;
        window.switchWorkspace = function (id, options) {
            originalSwitch.call(this, id, options);
            pushHistory(String(id || '').trim() || String(config?.workspaces?.[0]?.id || 'main'));
            updatePopover();
        };
        window.switchWorkspace._tabNavHooked = true;
        pushHistory(String(config?.activeWorkspace || 'main').trim() || 'main');
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = String(str == null ? '' : str);
        return div.innerHTML;
    }

    function getWorkspaceHelpers() {
        return window.EveWorkspaceHelpers || null;
    }

    function getConfigRef() {
        if (typeof config !== 'undefined' && config) return config;
        return window.config || null;
    }

    function getSidebarGroupsApi() {
        return window.EveSidebarGroups || null;
    }

    function toSuperscriptNumber(value) {
        var digits = String(Math.max(0, Number(value) || 0));
        var superscriptMap = {
            '0': '\u2070',
            '1': '\u00B9',
            '2': '\u00B2',
            '3': '\u00B3',
            '4': '\u2074',
            '5': '\u2075',
            '6': '\u2076',
            '7': '\u2077',
            '8': '\u2078',
            '9': '\u2079'
        };

        return digits.split('').map(function (digit) {
            return superscriptMap[digit] || digit;
        }).join('');
    }

    function getWorkspaceDepthLabelText(depth) {
        var level = Math.max(0, Number(depth) || 0);
        if (level === 0) return 'Tab';
        if (level === 1) return 'Sub-tab';
        return 'Sub' + toSuperscriptNumber(level) + '-tab';
    }

    function buildBreadcrumbPath(wsId) {
        var helpers = getWorkspaceHelpers();
        if (!helpers) return [{ id: wsId, name: wsId, icon: DEFAULT_ICON }];
        var workspaces = config?.workspaces || [];
        var current = helpers.findById(workspaces, wsId);
        if (!current) return [{ id: wsId, name: wsId, icon: DEFAULT_ICON }];

        var path = [{ id: current.id, name: current.name, icon: current.icon || DEFAULT_ICON }];
        var parent = helpers.findParent(workspaces, current.id);
        while (parent) {
            path.unshift({ id: parent.id, name: parent.name, icon: parent.icon || DEFAULT_ICON });
            parent = helpers.findParent(workspaces, parent.id);
        }
        return path;
    }

    function walkWorkspaces(fn) {
        var helpers = getWorkspaceHelpers();
        var workspaces = config?.workspaces || [];
        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk(workspaces, fn);
            return;
        }
        (function walk(list, depth) {
            if (!Array.isArray(list)) return;
            list.forEach(function (ws) {
                if (!ws) return;
                fn(ws, depth);
                if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                    walk(ws.subTabs, depth + 1);
                }
            });
        })(workspaces, 0);
    }

    function saveAndRefreshSidebar() {
        if (typeof window.saveConfig === 'function') window.saveConfig({ immediate: true });
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
    }

    Object.assign(rt, {
        DEFAULT_ICON,
        MAX_HISTORY,
        state,
        pushHistory,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        navigateTo,
        hookSwitchWorkspace,
        escHtml,
        getWorkspaceHelpers,
        getConfigRef,
        getSidebarGroupsApi,
        toSuperscriptNumber,
        getWorkspaceDepthLabelText,
        buildBreadcrumbPath,
        walkWorkspaces,
        saveAndRefreshSidebar
    });
    rt.coreReady = true;
})();
