window.EveTabNavRuntime = window.EveTabNavRuntime || {};

(function () {
    const rt = window.EveTabNavRuntime;
    const {
        getConfigRef,
        getSidebarGroupsApi,
        walkWorkspaces,
        saveAndRefreshSidebar,
        escHtml
    } = rt;

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

    function toggleShowSidebarDatapackBadges() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef) return;
        if (groupsApi && typeof groupsApi.ensureConfigDefaults === 'function') {
            groupsApi.ensureConfigDefaults(configRef);
        }
        configRef.showSidebarDatapackBadges = configRef.showSidebarDatapackBadges === false;
        saveAndRefreshSidebar();
        if (typeof window.showToast === 'function') {
            window.showToast(
                configRef.showSidebarDatapackBadges ? 'Showing sidebar datapack badges' : 'Hiding sidebar datapack badges',
                'info'
            );
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

    function getSidebarHoverPreviewOptions(action) {
        var configRef = getConfigRef();
        var normalizedAction = String(action || '').trim();
        if (!configRef) return null;

        if (normalizedAction === 'toggle-inactive') {
            return { showInactiveTabs: !configRef.showInactiveTabs };
        }
        if (normalizedAction === 'toggle-hidden-groups') {
            return { showHiddenGroups: !configRef.showHiddenSidebarGroups };
        }
        return null;
    }

    function beginSidebarHoverPreview(action) {
        var options = getSidebarHoverPreviewOptions(action);
        var sidebarRuntime = window.EveSidebarRuntime || null;
        if (!options || !sidebarRuntime || typeof sidebarRuntime.activateHoverRevealPreview !== 'function') return false;
        return sidebarRuntime.activateHoverRevealPreview(options);
    }

    function endSidebarHoverPreview(delayMs) {
        var sidebarRuntime = window.EveSidebarRuntime || null;
        if (!sidebarRuntime || typeof sidebarRuntime.queueHoverRevealDeactivation !== 'function') return false;
        sidebarRuntime.queueHoverRevealDeactivation(Math.max(0, Number(delayMs || 0) || 650));
        return true;
    }

    function toggleSidebarOrderMode() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        if (!configRef || !groupsApi) return;
        groupsApi.ensureConfigDefaults(configRef);
        var nextMode = groupsApi.getSidebarOrderMode(configRef) === 'manual' ? 'auto' : 'manual';
        groupsApi.setSidebarOrderMode(nextMode, configRef);
        if (nextMode !== 'manual' && window.EveSidebarRuntime?.setSidebarSortModeActive) {
            window.EveSidebarRuntime.setSidebarSortModeActive(false);
        }
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

    function toggleSidebarSortMode() {
        var configRef = getConfigRef();
        var groupsApi = getSidebarGroupsApi();
        var sidebarRuntime = window.EveSidebarRuntime || null;
        if (!configRef || !groupsApi || !sidebarRuntime?.setSidebarSortModeActive) return;

        groupsApi.ensureConfigDefaults(configRef);
        var nextActive = !(sidebarRuntime.isSidebarSortModeActive && sidebarRuntime.isSidebarSortModeActive());
        if (nextActive) {
            groupsApi.setSidebarOrderMode('manual', configRef);
            configRef.sidebarExpanded = true;
            configRef.sidebarHidden = false;
        }

        sidebarRuntime.setSidebarSortModeActive(nextActive);
        saveAndRefreshSidebar();
        if (typeof sidebarRuntime.syncSidebarSortModeUiState === 'function') {
            sidebarRuntime.syncSidebarSortModeUiState();
        }

        if (typeof window.showToast === 'function') {
            window.showToast(
                nextActive
                    ? 'Sidebar sorting mode enabled. Clicks no longer open tabs; drag tabs or groups to reorder.'
                    : 'Sidebar sorting mode disabled',
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
            inactiveBtn.setAttribute('data-tab-nav-hover-preview', 'inactive-tabs');
            inactiveBtn.title = 'Hover previews this tab visibility state in the sidebar. Click keeps it.';
        }

        var datapackBadgesBtn = pop.querySelector('[data-tab-nav-action="toggle-datapack-badges"]');
        if (datapackBadgesBtn) {
            datapackBadgesBtn.innerHTML = configRef?.showSidebarDatapackBadges === false
                ? '&#128202; Show Tab Badges'
                : '&#128202; Hide Tab Badges';
        }

        var hiddenGroupsBtn = pop.querySelector('[data-tab-nav-action="toggle-hidden-groups"]');
        if (hiddenGroupsBtn) {
            hiddenGroupsBtn.innerHTML = configRef?.showHiddenSidebarGroups
                ? '&#128065; Hide Hidden Groups'
                : '&#128065; Show Hidden Groups';
            hiddenGroupsBtn.setAttribute('data-tab-nav-hover-preview', 'hidden-groups');
            hiddenGroupsBtn.title = 'Hover previews this group visibility state in the sidebar. Click keeps it.';
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

            var sortModeBtn = pop.querySelector('[data-tab-nav-action="toggle-sort-mode"]');
            if (sortModeBtn) {
                var sortActive = !!(window.EveSidebarRuntime?.isSidebarSortModeActive
                    && window.EveSidebarRuntime.isSidebarSortModeActive());
                sortModeBtn.innerHTML = sortActive
                    ? '&#10005; Exit Sorting Mode'
                    : '&#8645; Enter Sorting Mode';
                sortModeBtn.classList.toggle('is-active', sortActive);
                sortModeBtn.title = sortActive
                    ? 'Return sidebar tabs to normal click navigation.'
                    : 'Enable manual order, show drop slots, and make sidebar tabs drag-first.';
            }
        }
    }

    Object.assign(rt, {
        collapseAllTabs,
        expandAllTabs,
        toggleShowInactiveTabs,
        toggleShowSidebarDatapackBadges,
        createSidebarGroup,
        collapseAllGroups,
        expandAllGroups,
        toggleShowHiddenGroups,
        getSidebarHoverPreviewOptions,
        beginSidebarHoverPreview,
        endSidebarHoverPreview,
        toggleSidebarOrderMode,
        toggleSidebarSortMode,
        resetManualSidebarOrder,
        updateSidebarActionLabels
    });
})();
