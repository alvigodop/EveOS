window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.categoryWorkspaceActionsReady) return;

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLiveLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    window.ctxWsDelete = async function () {
        const helpers = window.EveWorkspaceHelpers;
        const allFlat = helpers ? helpers.flatten(config.workspaces) : config.workspaces;
        if (allFlat.length <= 1) return showToast('Cannot delete last workspace', 'error');
        if (await showConfirm('Delete Workspace? Links move to Main.')) {
            const targetWs = helpers ? helpers.findById(config.workspaces, ctxWsId) : null;
            const removedIds = new Set([ctxWsId]);
            if (targetWs && helpers) {
                helpers.getDescendantIds(targetWs).forEach(function (id) { removedIds.add(id); });
            }
            if (helpers) {
                config.workspaces = helpers.removeById(config.workspaces, ctxWsId);
            } else {
                config.workspaces = config.workspaces.filter((workspace) => workspace.id !== ctxWsId);
            }
            const groupsApi = window.EveSidebarGroups || null;
            if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
                removedIds.forEach(function (workspaceId) {
                    groupsApi.removeManualOrderEntry('workspace', workspaceId, config);
                });
            }
            const targetWorkspaceId = config.workspaces[0].id;
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const liveLinks = getLiveLinks();
            liveLinks.forEach((link) => {
                if (!removedIds.has(link.workspace)) return;
                link.workspace = targetWorkspaceId;
                if (typeof syncLinked === 'function') syncLinked(link.id);
            });
            setLiveLinks(liveLinks);
            window.EveBookmarkFolders?.moveWorkspaceTrees?.(ctxWsId, targetWorkspaceId);
            config.activeWorkspace = config.workspaces[0].id;
            saveConfig({
                source: 'workspace-delete-config',
                meta: { workspaceId: ctxWsId, targetWorkspaceId: targetWorkspaceId, workspaceIds: Array.from(removedIds) }
            });
            saveData({
                source: 'workspace-delete-links-moved',
                meta: { workspaceId: ctxWsId, targetWorkspaceId: targetWorkspaceId, workspaceIds: Array.from(removedIds) }
            });
            renderSidebar();
        }
    };

    window.ctxWsAddSubTab = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        if (typeof openWorkspaceModal === 'function') {
            openWorkspaceModal(null, { parentId: ctxWsId });
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsCreateShortcut = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        if (!helpers) return;
        const ws = helpers.findById(config.workspaces, ctxWsId);
        if (!ws) return showToast('Workspace not found', 'error');

        const newId = 'ws_' + Date.now();
        const newTab = {
            id: newId,
            name: ws.name + ' (Link)',
            icon: '\uD83D\uDD17',
            linkedTo: ws.id,
            subTabs: []
        };
        config.workspaces.push(newTab);
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        showToast('Shortcut Tab Created at Root', 'success');
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsOpenState = function () {
        const workspaceId = String(ctxWsId || config?.activeWorkspace || 'main').trim() || 'main';
        const datapackView = window.EveOS?.SearchAdvanced?.DatapackView;
        if (!datapackView?.openGateway) {
            if (typeof showToast === 'function') showToast('Datapack View State is not loaded yet.', 'warning');
            return;
        }
        datapackView.openGateway({ scope: { workspaceId } });
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsEditGroup = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        if (typeof openWorkspaceModal === 'function') {
            openWorkspaceModal(ctxWsId);
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsClearGroup = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const groupsApi = ns.getSidebarGroupsApi?.();
        if (!groupsApi || !groupsApi.isRootWorkspace(ctxWsId, config)) {
            return showToast('Only root tabs can be removed from a group', 'error');
        }

        const moved = groupsApi.moveRootWorkspaceToGroup(ctxWsId, '', config);
        if (!moved) return showToast('Could not remove tab from group', 'error');

        ns.saveAndRefreshSidebar?.(false);
        showToast('Tab removed from group', 'info');
    };

    window.ctxWsToggleHideSubTabs = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');
        ws.hideSubTabs = !ws.hideSubTabs;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(ws.hideSubTabs ? 'Sub-tab content hidden from this tab' : 'Sub-tab content visible in this tab', 'info');
    };

    window.ctxWsToggleHiddenInParent = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');
        ws.hiddenInParent = !ws.hiddenInParent;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(ws.hiddenInParent ? (ws.name + ' hidden from parent view') : (ws.name + ' visible in parent view'), 'info');
    };

    window.ctxWsToggleInactive = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');

        const nextInactive = !ws.inactive;
        ns.setWorkspaceBranchInactive?.(ws, nextInactive, helpers);
        if (typeof window.EveSidebarRuntime?.syncSidebarAvailabilityState === 'function') {
            window.EveSidebarRuntime.syncSidebarAvailabilityState();
        }

        let nextWorkspaceId = '';
        if (nextInactive) {
            ns.collapseWorkspaceBranch?.(ws, helpers);

            const hiddenBranchIds = new Set([String(ws.id)]);
            if (helpers && typeof helpers.getDescendantIds === 'function') {
                helpers.getDescendantIds(ws).forEach(function (id) {
                    hiddenBranchIds.add(String(id));
                });
            }

            const activeWorkspaceId = String(config.activeWorkspace || '').trim();
            if (activeWorkspaceId && hiddenBranchIds.has(activeWorkspaceId)) {
                nextWorkspaceId = ns.findFallbackWorkspaceId?.(hiddenBranchIds) || '';
                if (nextWorkspaceId) {
                    config.activeWorkspace = nextWorkspaceId;
                }
            }
        }

        if (typeof closeAllMenus === 'function') closeAllMenus();
        if (nextWorkspaceId && typeof switchWorkspace === 'function') {
            switchWorkspace(nextWorkspaceId, { forceRender: true });
        } else {
            saveConfig({
                immediate: true,
                source: 'workspace-toggle-inactive',
                meta: { workspaceId: String(ws.id || ctxWsId || '').trim(), inactive: nextInactive }
            });
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        showToast(nextInactive ? (ws.name + ' and its sub-tabs are now inactive') : (ws.name + ' and its sub-tabs were reactivated'), 'info');
    };

    ns.categoryWorkspaceActionsReady = true;
})();
