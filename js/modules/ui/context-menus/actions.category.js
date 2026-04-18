window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const shared = window.EveContextMenuActions;
    if (shared.categoryReady) return;

    window.deleteCategory = async function (name) {
        try {
            const workspaceId = String(window.config?.activeWorkspace || window.ctxWsId || 'main').trim() || 'main';
            if (window.EveDetachedDashboardCard?.isDetachedParkingCategory?.(name, workspaceId)) {
                if (typeof showToast === 'function') {
                    showToast('Detached parking is managed from the map and cannot be deleted as a normal card.', 'info');
                }
                if (typeof closeAllMenus === 'function') closeAllMenus();
                if (typeof closeModals === 'function') closeModals();
                return;
            }

            if (!(await showConfirm('Delete Category?'))) return;

            const removedIds = links.filter((entry) => entry.category === name).map((entry) => entry.id);
            links = links.filter((entry) => entry.category !== name);
            if (window.eveState) window.eveState.links = links;
            window.links = links;

            if (window.EveBookmarkFolders?.deleteCategoryEverywhere) {
                window.EveBookmarkFolders.deleteCategoryEverywhere(name);
            }
            if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
                removedIds.forEach((id) => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
            }
            if (window.EveCategoryOrder?.removeCategoryEverywhere) {
                window.EveCategoryOrder.removeCategoryEverywhere(name);
            } else if (window.config?.categoryOrder) {
                window.config.categoryOrder = window.config.categoryOrder.filter((category) => category !== name);
            }
            if (typeof saveConfig === 'function') saveConfig();
            if (typeof saveData === 'function') saveData();
            if (typeof closeAllMenus === 'function') closeAllMenus();
            if (typeof closeModals === 'function') closeModals();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderSidebar === 'function') renderSidebar();
        } catch (error) {
            console.error('Error in deleteCategory:', error);
            if (typeof showToast === 'function') {
                showToast(`Failed to delete category: ${error.message}`, 'error');
            } else {
                alert(`Failed to delete category: ${error.message}`);
            }
        }
    };

    window.ctxCatToggleTask = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');

        if (config.hideStats.includes(categoryName)) config.hideStats = config.hideStats.filter((entry) => entry !== categoryName);
        else config.hideStats.push(categoryName);

        saveConfig();
        renderDashboard();
    };

    window.ctxCatToggleSmartBadge = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        
        const wsId = String(config.activeWorkspace || 'main');
        // Scoped key combining workspace and category name
        const scopedKey = wsId + '::' + categoryName;
        
        if (!Array.isArray(config.smartCardWeights)) config.smartCardWeights = [];
        
        if (config.smartCardWeights.includes(scopedKey)) {
            config.smartCardWeights = config.smartCardWeights.filter((entry) => entry !== scopedKey);
            showToast('Smart Average Badge Disabled', 'info');
        } else {
            config.smartCardWeights.push(scopedKey);
            showToast('Smart Average Badge Enabled', 'info');
        }

        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    };

    window.ctxCatToggleCustomOrder = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveCustomOrder;
        if (!api) return showToast('Custom order module not loaded', 'error');
        const wsId = String(config.activeWorkspace || 'main');
        // Get current links for this card to initialize numbering
        var cardLinks = (typeof getModalLinks === 'function' ? getModalLinks() : (window.eveState?.links || []))
            .filter(function (l) { return String(l.workspace) === wsId && String(l.category || 'Unsorted') === categoryName; });
        api.toggle(wsId, categoryName, cardLinks);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(api.isEnabled(wsId, categoryName) ? 'Custom numbering enabled' : 'Custom numbering disabled', 'info');
    };

    window.ctxCatCycleSortOrder = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveCustomOrder;
        if (!api) return;
        const wsId = String(config.activeWorkspace || 'main');
        api.cycleSortMode(wsId, categoryName);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        var mode = api.getSortMode(wsId, categoryName);
        var labels = { none: 'Sort: None (positional)', asc: 'Sort: Ascending', desc: 'Sort: Descending' };
        showToast(labels[mode] || mode, 'info');
    };

    window.ctxCatToggleTrueValue = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveTrueValue;
        if (!api) return;
        const wsId = String(config.activeWorkspace || 'main');
        api.toggle(wsId, categoryName);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        var enabled = api.isEnabled(wsId, categoryName);
        showToast(enabled ? 'True Value Sort enabled' : 'True Value Sort disabled', 'info');
    };

    window.ctxCatFocus = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        setFocus(categoryName);
    };

    window.ctxCatRename = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        openRenameModal(categoryName);
    };

    window.ctxCatLaunch = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        launchCategory(categoryName);
    };

    window.ctxWsDelete = async function () {
        const helpers = window.EveWorkspaceHelpers;
        const allFlat = helpers ? helpers.flatten(config.workspaces) : config.workspaces;
        if (allFlat.length <= 1) return showToast('Cannot delete last workspace', 'error');
        if (await showConfirm('Delete Workspace? Links move to Main.')) {
            // Gather all IDs being removed (this workspace + all descendants)
            const targetWs = helpers ? helpers.findById(config.workspaces, ctxWsId) : null;
            const removedIds = new Set([ctxWsId]);
            if (targetWs && helpers) {
                helpers.getDescendantIds(targetWs).forEach(function (id) { removedIds.add(id); });
            }
            // Remove from tree
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
            links.forEach((link) => {
                if (!removedIds.has(link.workspace)) return;
                link.workspace = targetWorkspaceId;
                if (typeof syncLinked === 'function') syncLinked(link.id);
            });
            window.EveBookmarkFolders?.moveWorkspaceTrees?.(ctxWsId, targetWorkspaceId);
            config.activeWorkspace = config.workspaces[0].id;
            saveConfig();
            saveData();
            renderSidebar();
        }
    };

    window.ctxWsAddSubTab = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        // Open workspace modal in "create sub-tab" mode
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
            icon: '🔗',
            linkedTo: ws.id,
            subTabs: []
        };
        config.workspaces.push(newTab);
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        showToast('Shortcut Tab Created at Root', 'success');
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    function getSidebarGroupsApi() {
        return window.EveSidebarGroups || null;
    }

    function getSidebarGroupRoots(groupId) {
        const groupsApi = getSidebarGroupsApi();
        if (!groupsApi) return [];

        groupsApi.ensureConfigDefaults(config);
        const targetId = String(groupId || '').trim();
        if (targetId) return groupsApi.getGroupRoots(targetId, config);

        return groupsApi.getRootWorkspaces(config).filter(function (workspace) {
            return !groupsApi.getWorkspaceGroupId(workspace, config);
        });
    }

    function getFirstWorkspaceId(workspaces) {
        const helpers = window.EveWorkspaceHelpers;
        const list = Array.isArray(workspaces) ? workspaces : [];
        let firstId = '';

        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk(list, function (workspace) {
                if (!firstId && workspace && workspace.id) {
                    firstId = String(workspace.id);
                }
            });
            return firstId;
        }

        (function walk(nodes) {
            if (firstId || !Array.isArray(nodes)) return;
            nodes.forEach(function (workspace) {
                if (firstId || !workspace) return;
                firstId = String(workspace.id || '').trim();
                if (!firstId && Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                    walk(workspace.subTabs);
                }
            });
        })(list);

        return firstId;
    }

    function applyCollapseToWorkspaceList(workspaces, shouldCollapse) {
        const helpers = window.EveWorkspaceHelpers;
        const collapsedIds = new Set(Array.isArray(config.collapsedTabs) ? config.collapsedTabs.map(String) : []);
        const removableIds = new Set();
        const list = Array.isArray(workspaces) ? workspaces : [];

        list.forEach(function (workspace) {
            if (!workspace) return;
            if (helpers && typeof helpers.walk === 'function') {
                helpers.walk([workspace], function (node) {
                    if (node && Array.isArray(node.subTabs) && node.subTabs.length > 0) {
                        const nodeId = String(node.id);
                        if (shouldCollapse) collapsedIds.add(nodeId);
                        else removableIds.add(nodeId);
                    }
                });
            } else if (Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                const nodeId = String(workspace.id);
                if (shouldCollapse) collapsedIds.add(nodeId);
                else removableIds.add(nodeId);
            }
        });

        config.collapsedTabs = shouldCollapse
            ? Array.from(collapsedIds)
            : (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).filter(function (id) {
                return !removableIds.has(String(id));
            });
    }

    function saveAndRefreshSidebar(showDashboard) {
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        if (showDashboard && typeof renderDashboard === 'function') renderDashboard();
        if (typeof closeAllMenus === 'function') closeAllMenus();
    }

    window.ctxWsEditGroup = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        if (typeof openWorkspaceModal === 'function') {
            openWorkspaceModal(ctxWsId);
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsClearGroup = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const groupsApi = getSidebarGroupsApi();
        if (!groupsApi || !groupsApi.isRootWorkspace(ctxWsId, config)) {
            return showToast('Only root tabs can be removed from a group', 'error');
        }

        const moved = groupsApi.moveRootWorkspaceToGroup(ctxWsId, '', config);
        if (!moved) return showToast('Could not remove tab from group', 'error');

        saveAndRefreshSidebar(false);
        showToast('Tab removed from group', 'info');
    };

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
        const groupsApi = getSidebarGroupsApi();
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
                nextWorkspaceId = getFirstWorkspaceId(groupsApi.getGroupRoots(nextFocusedGroupId, config));
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
        const groupsApi = getSidebarGroupsApi();
        if (!groupsApi) return;

        groupsApi.setGroupCollapsed(window.ctxSidebarGroupId, undefined, config);
        saveAndRefreshSidebar(false);
    };

    window.ctxSidebarGroupCollapseTabs = function () {
        const groupId = window.ctxSidebarGroupId || '';
        const groupsApi = getSidebarGroupsApi();
        if (groupId && groupsApi) {
            groupsApi.collapseTabsForGroup(groupId, config);
        } else {
            applyCollapseToWorkspaceList(getSidebarGroupRoots(''), true);
        }

        saveAndRefreshSidebar(false);
        showToast(groupId ? 'Tabs collapsed for group' : 'Root tabs collapsed', 'info');
    };

    window.ctxSidebarGroupExpandTabs = function () {
        const groupId = window.ctxSidebarGroupId || '';
        const groupsApi = getSidebarGroupsApi();
        if (groupId && groupsApi) {
            groupsApi.expandTabsForGroup(groupId, config);
        } else {
            applyCollapseToWorkspaceList(getSidebarGroupRoots(''), false);
        }

        saveAndRefreshSidebar(false);
        showToast(groupId ? 'Tabs expanded for group' : 'Root tabs expanded', 'info');
    };

    window.ctxSidebarGroupToggleHidden = function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = getSidebarGroupsApi();
        if (!groupsApi) return;

        const updatedGroup = groupsApi.setGroupHidden(window.ctxSidebarGroupId, undefined, config);
        if (updatedGroup && updatedGroup.hidden && typeof groupsApi.getFocusedGroupId === 'function'
            && groupsApi.getFocusedGroupId(config) === String(updatedGroup.id)
            && typeof groupsApi.setFocusedGroup === 'function') {
            groupsApi.setFocusedGroup('', config);
        }
        saveAndRefreshSidebar(false);
        if (updatedGroup) {
            showToast(updatedGroup.hidden ? 'Group hidden from sidebar' : 'Group visible in sidebar', 'info');
        }
    };

    window.ctxSidebarGroupDelete = async function () {
        if (!window.ctxSidebarGroupId) return;
        const groupsApi = getSidebarGroupsApi();
        if (!groupsApi) return;

        if (!(await showConfirm('Delete group? Tabs will stay as normal root tabs.'))) return;

        const targetGroupId = String(window.ctxSidebarGroupId || '').trim();
        const wasFocused = typeof groupsApi.getFocusedGroupId === 'function'
            && groupsApi.getFocusedGroupId(config) === targetGroupId;
        const deleted = groupsApi.deleteGroup(targetGroupId, config);
        if (!deleted) return showToast('Group not found', 'error');
        if (wasFocused && typeof groupsApi.setFocusedGroup === 'function') {
            groupsApi.setFocusedGroup('', config);
        }

        saveAndRefreshSidebar(false);
        showToast('Group deleted', 'info');
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

    function collapseWorkspaceBranch(ws, helpers) {
        if (!ws) return;
        const collapsedIds = new Set(Array.isArray(config.collapsedTabs) ? config.collapsedTabs.map(String) : []);
        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk([ws], function (node) {
                if (node && Array.isArray(node.subTabs) && node.subTabs.length > 0) {
                    collapsedIds.add(String(node.id));
                }
            });
        } else if (ws.id) {
            collapsedIds.add(String(ws.id));
        }
        config.collapsedTabs = Array.from(collapsedIds);
    }

    function setWorkspaceBranchInactive(ws, nextInactive, helpers) {
        if (!ws) return;
        const branchInactive = !!nextInactive;
        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk([ws], function (node) {
                if (node) node.inactive = branchInactive;
            });
            return;
        }
        ws.inactive = branchInactive;
    }

    function findFallbackWorkspaceId(excludedIds) {
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
        const blocked = excludedIds instanceof Set ? excludedIds : new Set();
        let fallbackId = '';

        function isInteractiveWorkspace(candidate) {
            if (!candidate || !candidate.id) return false;
            const candidateId = String(candidate.id);
            if (blocked.has(candidateId)) return false;
            if (helpers && typeof helpers.getPath === 'function') {
                const path = helpers.getPath(workspaces, candidateId);
                if (!path.length) return false;
                return !path.some(function (segment) {
                    return !!segment?.inactive || blocked.has(String(segment?.id || ''));
                });
            }
            return !candidate.inactive;
        }

        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk(workspaces, function (candidate) {
                if (!fallbackId && isInteractiveWorkspace(candidate)) {
                    fallbackId = String(candidate.id);
                }
            });
            return fallbackId;
        }

        for (let i = 0; i < workspaces.length; i += 1) {
            if (isInteractiveWorkspace(workspaces[i])) {
                return String(workspaces[i].id);
            }
        }
        return '';
    }

    window.ctxWsToggleInactive = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');

        const nextInactive = !ws.inactive;
        setWorkspaceBranchInactive(ws, nextInactive, helpers);

        let nextWorkspaceId = '';
        if (nextInactive) {
            collapseWorkspaceBranch(ws, helpers);

            const hiddenBranchIds = new Set([String(ws.id)]);
            if (helpers && typeof helpers.getDescendantIds === 'function') {
                helpers.getDescendantIds(ws).forEach(function (id) {
                    hiddenBranchIds.add(String(id));
                });
            }

            const activeWorkspaceId = String(config.activeWorkspace || '').trim();
            if (activeWorkspaceId && hiddenBranchIds.has(activeWorkspaceId)) {
                nextWorkspaceId = findFallbackWorkspaceId(hiddenBranchIds);
                if (nextWorkspaceId) {
                    config.activeWorkspace = nextWorkspaceId;
                }
            }
        }

        if (typeof closeAllMenus === 'function') closeAllMenus();
        if (nextWorkspaceId && typeof switchWorkspace === 'function') {
            switchWorkspace(nextWorkspaceId, { forceRender: true });
        } else {
            saveConfig();
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        showToast(nextInactive ? (ws.name + ' and its sub-tabs are now inactive') : (ws.name + ' and its sub-tabs were reactivated'), 'info');
    };

    shared.categoryReady = true;
})();
