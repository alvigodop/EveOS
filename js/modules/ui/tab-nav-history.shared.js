(function () {
    'use strict';

    var rt = window.EveTabNavRuntime = window.EveTabNavRuntime || {};
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

    function collapseAllTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        var collapsedIds = new Set(Array.isArray(configRef.collapsedTabs) ? configRef.collapsedTabs.map(String) : []);
        walkWorkspaces(function (ws) {
            if (Array.isArray(ws.subTabs) && ws.subTabs.length > 0) {
                collapsedIds.add(String(ws.id));
            }
        });
        configRef.collapsedTabs = Array.from(collapsedIds);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All tabs collapsed', 'info');
        updatePopover();
    }

    function expandAllTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        configRef.collapsedTabs = [];
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All tabs expanded', 'info');
        updatePopover();
    }

    function toggleShowInactiveTabs() {
        var configRef = getConfigRef();
        if (!configRef) return;
        configRef.showInactiveTabs = !configRef.showInactiveTabs;
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(configRef.showInactiveTabs ? 'Showing inactive tabs' : 'Hiding inactive tabs', 'info');
        }
        updatePopover();
    }

    function createSidebarGroup() {
        if (typeof window.openSidebarGroupModal === 'function') {
            window.openSidebarGroupModal();
        }
        if (typeof rt.scheduleHide === 'function') rt.scheduleHide(120);
    }

    function collapseAllGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        if (!groupsApi.getGroups(configRef).length) {
            if (typeof window.showToast === 'function') window.showToast('No groups to collapse', 'info');
            return;
        }
        groupsApi.collapseAllGroups(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All groups collapsed', 'info');
        updatePopover();
    }

    function expandAllGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        if (!groupsApi.getGroups(configRef).length) {
            if (typeof window.showToast === 'function') window.showToast('No groups to expand', 'info');
            return;
        }
        groupsApi.expandAllGroups(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') window.showToast('All groups expanded', 'info');
        updatePopover();
    }

    function toggleShowHiddenGroups() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        groupsApi.setShowHiddenGroups(undefined, configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(configRef.showHiddenSidebarGroups ? 'Showing hidden groups' : 'Hiding hidden groups', 'info');
        }
        updatePopover();
    }

    function toggleSidebarOrderMode() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        var nextMode = groupsApi.getSidebarOrderMode(configRef) === 'manual' ? 'auto' : 'manual';
        groupsApi.setSidebarOrderMode(nextMode, configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(
                nextMode === 'manual'
                    ? 'Manual sidebar order enabled. Drag groups, tabs, and sub-tabs to reposition them.'
                    : 'Sidebar order returned to automatic mode',
                'info'
            );
        }
        updatePopover();
    }

    function resetManualSidebarOrder() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        groupsApi.setSidebarOrderMode('manual', configRef);
        groupsApi.resetManualOrder(configRef);
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast('Manual sidebar layout reset to the automatic baseline', 'info');
        }
        updatePopover();
    }

    function updateSidebarActionLabels(pop) {
        if (!pop) return;
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        var inactiveBtn = pop.querySelector('[data-tab-nav-action="toggle-inactive"]');
        if (inactiveBtn) {
            inactiveBtn.innerHTML = configRef?.showInactiveTabs
                ? '&#128065; Hide Inactive Tabs'
                : '&#128065; Show Inactive Tabs';
        }

        var hiddenGroupsBtn = pop.querySelector('[data-tab-nav-action="toggle-hidden-groups"]');
        if (hiddenGroupsBtn) {
            hiddenGroupsBtn.innerHTML = configRef?.showHiddenSidebarGroups
                ? '&#128065; Hide Hidden Groups'
                : '&#128065; Show Hidden Groups';
        }

        if (groupsApi && configRef) {
            groupsApi.ensureConfigDefaults(configRef);

            var orderMode = groupsApi.getSidebarOrderMode(configRef);
            var orderModeBtn = pop.querySelector('[data-tab-nav-action="toggle-order-mode"]');
            if (orderModeBtn) {
                orderModeBtn.innerHTML = orderMode === 'manual'
                    ? '&#8645; Use Automatic Order'
                    : '&#8645; Enable Manual Order';
            }

            var resetOrderBtn = pop.querySelector('[data-tab-nav-action="reset-order"]');
            if (resetOrderBtn) {
                resetOrderBtn.style.display = orderMode === 'manual' ? '' : 'none';
                resetOrderBtn.innerHTML = '&#8635; Reset Manual Layout';
            }
        }
    }

    function getWorkspaceSearchItems() {
        var items = [];
        var configRef = getConfigRef();
        if (!configRef) return items;

        var helpers = getWorkspaceHelpers();
        var groupsApi = getSidebarGroupsApi();
        var groupMap = groupsApi && typeof groupsApi.getGroupMap === 'function'
            ? groupsApi.getGroupMap(configRef)
            : new Map();

        walkWorkspaces(function (ws) {
            if (!ws || !ws.id) return;

            var path = buildBreadcrumbPath(ws.id);
            var depthValue = Math.max(0, path.length - 1);
            var pathNames = path.map(function (segment) {
                return String(segment?.name || '').trim();
            }).filter(Boolean);
            var pathText = pathNames.join(' > ');
            var rootId = path.length ? String(path[0].id || '') : String(ws.id || '');
            var rootWorkspace = helpers && typeof helpers.findById === 'function'
                ? helpers.findById(configRef.workspaces || [], rootId)
                : null;
            var groupId = rootWorkspace ? String(rootWorkspace.groupId || '').trim() : '';
            var groupName = groupId && groupMap.has(groupId)
                ? String(groupMap.get(groupId).name || '').trim()
                : '';

            items.push({
                id: String(ws.id || ''),
                name: String(ws.name || ws.id || 'Untitled'),
                icon: ws.icon || DEFAULT_ICON,
                depth: depthValue,
                depthLabelText: getWorkspaceDepthLabelText(depthValue),
                inactive: groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function'
                    ? groupsApi.isWorkspaceEffectivelyInactive(ws, configRef)
                    : !!ws.inactive,
                pathText: pathText,
                pathLower: pathText.toLowerCase(),
                nameLower: String(ws.name || ws.id || '').toLowerCase(),
                groupName: groupName,
                groupLower: groupName.toLowerCase()
            });
        });

        return items;
    }

    function getWorkspaceSearchResults(query) {
        var normalizedQuery = String(query || '').trim().toLowerCase();
        if (!normalizedQuery) return [];

        return getWorkspaceSearchItems()
            .map(function (item) {
                var score = 0;
                if (item.nameLower === normalizedQuery) score += 120;
                else if (item.nameLower.indexOf(normalizedQuery) === 0) score += 80;
                else if (item.nameLower.indexOf(normalizedQuery) !== -1) score += 50;

                if (item.pathLower.indexOf(normalizedQuery) !== -1) score += 24;
                if (item.groupLower && item.groupLower.indexOf(normalizedQuery) !== -1) score += 12;
                if (!score) return null;

                return Object.assign({}, item, { score: score });
            })
            .filter(Boolean)
            .sort(function (a, b) {
                if (b.score !== a.score) return b.score - a.score;
                if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
                if (a.depth !== b.depth) return a.depth - b.depth;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 9);
    }

    Object.assign(rt, {
        DEFAULT_ICON: DEFAULT_ICON,
        MAX_HISTORY: MAX_HISTORY,
        state: state,
        pushHistory: pushHistory,
        canGoBack: canGoBack,
        canGoForward: canGoForward,
        goBack: goBack,
        goForward: goForward,
        navigateTo: navigateTo,
        hookSwitchWorkspace: hookSwitchWorkspace,
        escHtml: escHtml,
        getWorkspaceHelpers: getWorkspaceHelpers,
        getConfigRef: getConfigRef,
        getSidebarGroupsApi: getSidebarGroupsApi,
        toSuperscriptNumber: toSuperscriptNumber,
        getWorkspaceDepthLabelText: getWorkspaceDepthLabelText,
        buildBreadcrumbPath: buildBreadcrumbPath,
        walkWorkspaces: walkWorkspaces,
        saveAndRefreshSidebar: saveAndRefreshSidebar,
        collapseAllTabs: collapseAllTabs,
        expandAllTabs: expandAllTabs,
        toggleShowInactiveTabs: toggleShowInactiveTabs,
        createSidebarGroup: createSidebarGroup,
        collapseAllGroups: collapseAllGroups,
        expandAllGroups: expandAllGroups,
        toggleShowHiddenGroups: toggleShowHiddenGroups,
        toggleSidebarOrderMode: toggleSidebarOrderMode,
        resetManualSidebarOrder: resetManualSidebarOrder,
        updateSidebarActionLabels: updateSidebarActionLabels,
        getWorkspaceSearchItems: getWorkspaceSearchItems,
        getWorkspaceSearchResults: getWorkspaceSearchResults
    });

    rt.sharedReady = true;
})();
