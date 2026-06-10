window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    function text(value, fallback) {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfig() {
        return window.eveState?.config || window.config || {};
    }

    function getWorkspaces() {
        const config = getConfig();
        return Array.isArray(config.workspaces) ? config.workspaces : [];
    }

    function findWorkspace(workspaceId) {
        const id = text(workspaceId, '');
        if (!id) return null;
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.findById) return helpers.findById(getWorkspaces(), id);

        function find(nodes) {
            for (const workspace of Array.isArray(nodes) ? nodes : []) {
                if (String(workspace?.id || '').toLowerCase() === id.toLowerCase()) return workspace;
                const nested = find(workspace?.subTabs);
                if (nested) return nested;
            }
            return null;
        }
        return find(getWorkspaces());
    }

    function getVisibleDescendantIds(workspace) {
        const helpers = window.EveWorkspaceHelpers;
        if (helpers?.getVisibleDescendantIds) {
            return helpers.getVisibleDescendantIds(workspace).map(String);
        }
        const ids = [];
        (Array.isArray(workspace?.subTabs) ? workspace.subTabs : []).forEach(function (child) {
            if (!child || child.hiddenInParent) return;
            ids.push(String(child.id));
            getVisibleDescendantIds(child).forEach(function (id) { ids.push(id); });
        });
        return ids;
    }

    function flattenWorkspaces(nodes, parentId, depth, output) {
        const result = output || [];
        (Array.isArray(nodes) ? nodes : []).forEach(function (workspace) {
            if (!workspace?.id) return;
            result.push({
                source: workspace,
                id: text(workspace.id, 'main'),
                name: text(workspace.name, workspace.id || 'Untitled Tab'),
                icon: text(workspace.icon, 'TAB'),
                parentId: text(parentId, ''),
                depth: Number(depth) || 0,
                linkedTo: text(workspace.linkedTo, ''),
                isShortcut: !!text(workspace.linkedTo, '')
            });
            flattenWorkspaces(workspace.subTabs, workspace.id, (Number(depth) || 0) + 1, result);
        });
        return result;
    }

    function normalizeScope(scopeOption) {
        const config = getConfig();
        const source = scopeOption && typeof scopeOption === 'object' ? scopeOption : {};
        const requestedScope = text(source.scope, 'workspace');
        const allowed = ['all', 'workspace', 'card'];
        return {
            scope: allowed.includes(requestedScope) ? requestedScope : 'workspace',
            workspaceId: text(source.workspaceId, config.activeWorkspace || 'main'),
            workspaceIds: Array.isArray(source.workspaceIds)
                ? Array.from(new Set(source.workspaceIds.map(function (id) {
                    return text(id, '');
                }).filter(Boolean)))
                : [],
            categoryName: text(source.categoryName, ''),
            scopeLabel: text(source.scopeLabel, '')
        };
    }

    function getScopeLabel(scopeOption) {
        const scope = normalizeScope(scopeOption);
        if (scope.scope === 'all') {
            return scope.scopeLabel || (
                scope.workspaceIds.length ? 'Selected Tabs' : 'Whole Datapack'
            );
        }
        const workspace = findWorkspace(scope.workspaceId);
        const workspaceName = text(workspace?.name, scope.workspaceId);
        if (scope.scope === 'card') {
            return workspaceName + ' / ' + text(scope.categoryName, 'Card');
        }
        return workspaceName + ' / Tab Scope';
    }

    function resolveDisplayWorkspaces(scopeOption) {
        const scope = normalizeScope(scopeOption);
        const flattened = flattenWorkspaces(getWorkspaces(), '', 0, []);
        if (scope.scope === 'all') {
            if (!scope.workspaceIds.length) return flattened;
            const allowedIds = new Set(scope.workspaceIds.map(function (id) {
                return id.toLowerCase();
            }));
            return flattened.filter(function (workspace) {
                return allowedIds.has(workspace.id.toLowerCase());
            });
        }

        const root = findWorkspace(scope.workspaceId);
        if (!root) {
            return [{
                source: null,
                id: scope.workspaceId,
                name: scope.workspaceId,
                icon: 'TAB',
                parentId: '',
                depth: 0,
                linkedTo: '',
                isShortcut: false
            }];
        }
        const visibleIds = new Set([String(root.id).toLowerCase()]);
        if (!root.hideSubTabs) {
            getVisibleDescendantIds(root).forEach(function (id) {
                visibleIds.add(String(id).toLowerCase());
            });
        }
        return flattened.filter(function (workspace) {
            return visibleIds.has(workspace.id.toLowerCase());
        }).map(function (workspace) {
            return Object.assign({}, workspace, {
                depth: Math.max(0, workspace.depth - (
                    flattened.find(function (item) {
                        return item.id.toLowerCase() === String(root.id).toLowerCase();
                    })?.depth || 0
                ))
            });
        });
    }

    function resolveContentWorkspaceIds(displayWorkspace) {
        const ids = new Set([text(displayWorkspace?.id, 'main')]);
        const linkedTo = text(displayWorkspace?.linkedTo, '');
        if (!linkedTo) return ids;

        const queue = [linkedTo];
        const visited = new Set();
        while (queue.length) {
            const workspaceId = text(queue.shift(), '');
            const key = workspaceId.toLowerCase();
            if (!workspaceId || visited.has(key)) continue;
            visited.add(key);
            ids.add(workspaceId);

            const workspace = findWorkspace(workspaceId);
            if (!workspace) continue;
            if (!workspace.hideSubTabs) {
                getVisibleDescendantIds(workspace).forEach(function (id) {
                    if (!visited.has(String(id).toLowerCase())) queue.push(String(id));
                });
            }
            const nextLinkedTo = text(workspace.linkedTo, '');
            if (nextLinkedTo && !visited.has(nextLinkedTo.toLowerCase())) {
                queue.push(nextLinkedTo);
            }
        }
        return ids;
    }

    function getGroupOverviewScope() {
        const config = getConfig();
        const groupId = text(config.groupOverviewId, '');
        const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
        if (!groupId || !groupsApi?.getGroupRoots) return null;
        const ids = new Set();
        groupsApi.getGroupRoots(groupId, config).forEach(function (root) {
            if (!root?.id) return;
            ids.add(String(root.id));
            getVisibleDescendantIds(root).forEach(function (id) { ids.add(id); });
        });
        const group = groupsApi.findGroupById?.(groupId, config);
        return ids.size ? {
            scope: 'all',
            workspaceIds: Array.from(ids),
            scopeLabel: text(group?.name, 'Group Overview')
        } : null;
    }

    Object.assign(ns, {
        normalizeScope,
        getScopeLabel,
        resolveDisplayWorkspaces,
        resolveContentWorkspaceIds,
        getGroupOverviewScope
    });
})(window.EveMatrixWorkshop);
