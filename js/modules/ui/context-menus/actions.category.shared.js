window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.categorySharedReady) return;

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

    Object.assign(ns, {
        applyCollapseToWorkspaceList,
        collapseWorkspaceBranch,
        findFallbackWorkspaceId,
        getFirstWorkspaceId,
        getSidebarGroupRoots,
        getSidebarGroupsApi,
        saveAndRefreshSidebar,
        setWorkspaceBranchInactive
    });

    ns.categorySharedReady = true;
})();
