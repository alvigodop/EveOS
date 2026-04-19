window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.categoryGroupActionsReady) return;

    window.ctxSidebarGroupCreateWorkspace = function () {
        if (typeof openWorkspaceModal === 'function') {
            openWorkspaceModal(null, { groupId: window.ctxSidebarGroupId || '' });
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxSidebarGroupEdit = function () {
        if (!window.ctxSidebarGroupId) return;
        if (typeof openSidebarGroupModal === 'function') {
            openSidebarGroupModal(window.ctxSidebarGroupId);
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxSidebarGroupToggleFocus = function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (!groupsApi || typeof groupsApi.setFocusedGroup !== 'function') return;

        const targetGroupId = String(window.ctxSidebarGroupId || '').trim();
        const currentFocusedGroupId = typeof groupsApi.getFocusedGroupId === 'function'
            ? groupsApi.getFocusedGroupId(config)
            : '';
        const nextFocusedGroupId = currentFocusedGroupId === targetGroupId ? '' : targetGroupId;

        if (nextFocusedGroupId) {
            const roots = groupsApi.getGroupRoots(nextFocusedGroupId, config);
            if (!roots.length) return showToast('Group has no tabs to focus', 'error');
        }

        groupsApi.setFocusedGroup(nextFocusedGroupId, config);

        let nextWorkspaceId = '';
        if (nextFocusedGroupId && typeof groupsApi.isWorkspaceInFocusedGroup === 'function') {
            const activeWorkspaceId = String(config.activeWorkspace || '').trim();
            if (!groupsApi.isWorkspaceInFocusedGroup(activeWorkspaceId, config)) {
                nextWorkspaceId = ns.getFirstWorkspaceId?.(groupsApi.getGroupRoots(nextFocusedGroupId, config)) || '';
                if (nextWorkspaceId) config.activeWorkspace = nextWorkspaceId;
            }
        }

        if (typeof closeAllMenus === 'function') closeAllMenus();
        if (nextWorkspaceId && typeof switchWorkspace === 'function') {
            switchWorkspace(nextWorkspaceId, { forceRender: true });
        } else {
            saveConfig();
            if (typeof renderSidebar === 'function') renderSidebar();
        }

        const targetGroup = groupsApi.findGroupById(targetGroupId, config);
        showToast(
            nextFocusedGroupId
                ? ('Focused group: ' + String(targetGroup?.name || 'Group'))
                : 'Group focus cleared',
            'info'
        );
    };

    window.ctxSidebarGroupToggleCollapsed = function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (!groupsApi) return;

        groupsApi.setGroupCollapsed(window.ctxSidebarGroupId, undefined, config);
        ns.saveAndRefreshSidebar?.(false);
    };

    window.ctxSidebarGroupCollapseTabs = function () {
        const groupId = window.ctxSidebarGroupId || '';
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (groupId && groupsApi) {
            groupsApi.collapseTabsForGroup(groupId, config);
        } else {
            ns.applyCollapseToWorkspaceList?.(ns.getSidebarGroupRoots?.('') || [], true);
        }

        ns.saveAndRefreshSidebar?.(false);
        showToast(groupId ? 'Tabs collapsed for group' : 'Root tabs collapsed', 'info');
    };

    window.ctxSidebarGroupExpandTabs = function () {
        const groupId = window.ctxSidebarGroupId || '';
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (groupId && groupsApi) {
            groupsApi.expandTabsForGroup(groupId, config);
        } else {
            ns.applyCollapseToWorkspaceList?.(ns.getSidebarGroupRoots?.('') || [], false);
        }

        ns.saveAndRefreshSidebar?.(false);
        showToast(groupId ? 'Tabs expanded for group' : 'Root tabs expanded', 'info');
    };

    window.ctxSidebarGroupToggleHidden = function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (!groupsApi) return;
        const targetGroupId = String(window.ctxSidebarGroupId || '').trim();
        const wasOverviewGroup = String(config.groupOverviewId || '').trim() === targetGroupId;
        const activeWorkspaceId = String(config.activeWorkspace || '').trim();
        const activeGroupId = typeof groupsApi.getWorkspaceGroupId === 'function'
            ? groupsApi.getWorkspaceGroupId(activeWorkspaceId, config)
            : '';

        const updatedGroup = groupsApi.setGroupHidden(targetGroupId, undefined, config);
        let nextWorkspaceId = '';
        if (updatedGroup && updatedGroup.hidden && typeof groupsApi.getFocusedGroupId === 'function'
            && groupsApi.getFocusedGroupId(config) === String(updatedGroup.id)
            && typeof groupsApi.setFocusedGroup === 'function') {
            groupsApi.setFocusedGroup('', config);
        }
        if (updatedGroup && updatedGroup.hidden && activeGroupId === targetGroupId) {
            const candidateRoots = typeof groupsApi.getRootWorkspaces === 'function'
                ? groupsApi.getRootWorkspaces(config).filter(function (workspace) {
                    return !groupsApi.isWorkspaceEffectivelyInactive(workspace, config);
                })
                : [];
            nextWorkspaceId = ns.getFirstWorkspaceId?.(candidateRoots) || '';
        }

        if (nextWorkspaceId && typeof switchWorkspace === 'function') {
            switchWorkspace(nextWorkspaceId, { forceRender: true });
        } else {
            ns.saveAndRefreshSidebar?.(wasOverviewGroup);
        }
        if (updatedGroup) {
            showToast(updatedGroup.hidden ? 'Group hidden from sidebar' : 'Group visible in sidebar', 'info');
        }
    };

    window.ctxSidebarGroupDelete = async function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (!groupsApi) return;

        if (!(await showConfirm('Delete group? Tabs will stay as normal root tabs.'))) return;

        const targetGroupId = String(window.ctxSidebarGroupId || '').trim();
        const wasFocused = typeof groupsApi.getFocusedGroupId === 'function'
            && groupsApi.getFocusedGroupId(config) === targetGroupId;
        const wasOverviewGroup = String(config.groupOverviewId || '').trim() === targetGroupId;
        const deleted = groupsApi.deleteGroup(targetGroupId, config);
        if (!deleted) return showToast('Group not found', 'error');
        if (wasFocused && typeof groupsApi.setFocusedGroup === 'function') {
            groupsApi.setFocusedGroup('', config);
        }

        ns.saveAndRefreshSidebar?.(wasOverviewGroup);
        showToast('Group deleted', 'info');
    };

    ns.categoryGroupActionsReady = true;
})();
