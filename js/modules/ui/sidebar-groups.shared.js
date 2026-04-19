(function () {
    'use strict';

    var rt = window.EveSidebarGroupsRuntime = window.EveSidebarGroupsRuntime || {};
    if (rt.sharedReady) return;

    var DEFAULT_GROUP_COLORS = [
        '#00d4ff',
        '#ffb84d',
        '#7fe08a',
        '#ff7a7a',
        '#b38cff',
        '#72d8c4'
    ];
    var ORDER_MODE_AUTO = 'auto';
    var ORDER_MODE_MANUAL = 'manual';

    function getConfigRef() {
        if (typeof config !== 'undefined' && config) return config;
        return window.config || null;
    }

    function getHelpers() {
        return window.EveWorkspaceHelpers || null;
    }

    function getEnsuredConfig(configRef) {
        if (typeof rt.ensureConfigDefaults === 'function') {
            return rt.ensureConfigDefaults(configRef);
        }
        return configRef || getConfigRef();
    }

    function normalizeGroupId(value) {
        return String(value || '').trim();
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim();
    }

    function normalizeColor(value, index) {
        var color = String(value || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(color)) return color;
        return DEFAULT_GROUP_COLORS[index % DEFAULT_GROUP_COLORS.length];
    }

    function sanitizeGroup(group, index) {
        if (!group || typeof group !== 'object') return null;
        var id = normalizeGroupId(group.id) || ('sg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
        var name = String(group.name || '').trim() || ('Group ' + (index + 1));
        return {
            id: id,
            name: name,
            color: normalizeColor(group.color, index),
            collapsed: !!group.collapsed,
            hidden: !!group.hidden,
            parentWorkspaceId: normalizeWorkspaceId(group.parentWorkspaceId)
        };
    }

    function normalizeOrderMode(value) {
        return String(value || '').trim().toLowerCase() === ORDER_MODE_MANUAL
            ? ORDER_MODE_MANUAL
            : ORDER_MODE_AUTO;
    }

    function makeOrderToken(type, id) {
        var normalizedId = String(id || '').trim();
        var normalizedType = String(type || '').trim().toLowerCase();
        if (!normalizedId) return '';
        if (normalizedType !== 'group' && normalizedType !== 'workspace') return '';
        return normalizedType + ':' + normalizedId;
    }

    function parseOrderToken(token) {
        var raw = String(token || '').trim();
        var dividerIndex = raw.indexOf(':');
        if (dividerIndex === -1) return null;
        var type = raw.slice(0, dividerIndex).trim().toLowerCase();
        var id = raw.slice(dividerIndex + 1).trim();
        if (!id || (type !== 'group' && type !== 'workspace')) return null;
        return { type: type, id: id };
    }

    function normalizeManualOrderShape(value) {
        if (Array.isArray(value)) {
            return {
                root: value.slice(),
                parents: {}
            };
        }

        var next = value && typeof value === 'object' ? value : {};
        var root = Array.isArray(next.root) ? next.root.slice() : [];
        var parents = {};
        var sourceParents = next.parents && typeof next.parents === 'object' ? next.parents : {};

        Object.keys(sourceParents).forEach(function (parentId) {
            if (!Array.isArray(sourceParents[parentId])) return;
            parents[String(parentId).trim()] = sourceParents[parentId].slice();
        });

        return {
            root: root,
            parents: parents
        };
    }

    function getManualOrderState(configRef) {
        var cfg = configRef || getConfigRef();
        if (!cfg) return normalizeManualOrderShape(null);
        cfg.sidebarManualOrder = normalizeManualOrderShape(cfg.sidebarManualOrder);
        return cfg.sidebarManualOrder;
    }

    function getManualOrderKey(parentWorkspaceId) {
        var parentId = normalizeWorkspaceId(parentWorkspaceId);
        return parentId || 'root';
    }

    function getRootWorkspaces(configRef) {
        var cfg = configRef || getConfigRef();
        return Array.isArray(cfg && cfg.workspaces) ? cfg.workspaces.filter(Boolean) : [];
    }

    function getWorkspaceById(workspaceId, configRef) {
        var targetId = normalizeWorkspaceId(workspaceId);
        if (!targetId) return null;
        var cfg = configRef || getConfigRef();
        var helpers = getHelpers();
        if (helpers && typeof helpers.findById === 'function') {
            return helpers.findById((cfg && cfg.workspaces) || [], targetId);
        }
        var roots = getRootWorkspaces(cfg);
        for (var i = 0; i < roots.length; i += 1) {
            if (String(roots[i].id) === targetId) return roots[i];
        }
        return null;
    }

    function getWorkspaceParentId(workspaceId, configRef) {
        var targetId = normalizeWorkspaceId(workspaceId);
        if (!targetId) return '';
        var cfg = configRef || getConfigRef();
        var helpers = getHelpers();
        if (!helpers || typeof helpers.findParent !== 'function') return '';
        var parent = helpers.findParent((cfg && cfg.workspaces) || [], targetId);
        return parent && parent.id ? String(parent.id) : '';
    }

    function getWorkspaceRoot(workspaceOrId, configRef) {
        var cfg = configRef || getConfigRef();
        if (!cfg) return null;

        var targetId = workspaceOrId && typeof workspaceOrId === 'object'
            ? normalizeWorkspaceId(workspaceOrId.id)
            : normalizeWorkspaceId(workspaceOrId);
        if (!targetId) return null;

        var helpers = getHelpers();
        if (helpers && typeof helpers.getPath === 'function') {
            var path = helpers.getPath(cfg.workspaces || [], targetId);
            return path.length ? path[0] : null;
        }

        return getRootWorkspaceById(targetId, cfg);
    }

    function getRootWorkspaceById(workspaceId, configRef) {
        var targetId = normalizeWorkspaceId(workspaceId);
        if (!targetId) return null;
        var roots = getRootWorkspaces(configRef);
        for (var i = 0; i < roots.length; i += 1) {
            if (String(roots[i].id) === targetId) return roots[i];
        }
        return null;
    }

    function getWorkspaceGroupIdFromConfig(workspaceOrId, cfg) {
        if (!cfg) return '';
        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : getRootWorkspaceById(workspaceOrId, cfg);
        if (!workspace || !workspace.id) return '';

        if (getWorkspaceParentId(workspace.id, cfg)) return '';

        var groupId = normalizeGroupId(workspace.groupId);
        var groups = Array.isArray(cfg.sidebarGroups) ? cfg.sidebarGroups : [];
        for (var i = 0; i < groups.length; i += 1) {
            if (String(groups[i].id) === groupId) return groupId;
        }
        return '';
    }

    function getWorkspaceGroupId(workspaceOrId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        return getWorkspaceGroupIdFromConfig(workspaceOrId, cfg);
    }

    function getGroupsRaw(cfg) {
        return Array.isArray(cfg && cfg.sidebarGroups) ? cfg.sidebarGroups : [];
    }

    function findGroupByIdInConfig(groupId, cfg) {
        var targetId = normalizeGroupId(groupId);
        if (!targetId || !cfg) return null;
        var groups = getGroupsRaw(cfg);
        for (var i = 0; i < groups.length; i += 1) {
            if (String(groups[i].id) === targetId) return groups[i];
        }
        return null;
    }

    function getGroupRootsInConfig(groupId, cfg) {
        var targetId = normalizeGroupId(groupId);
        return getRootWorkspaces(cfg).filter(function (workspace) {
            return getWorkspaceGroupIdFromConfig(workspace, cfg) === targetId;
        });
    }

    function getGroupRoots(groupId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        return getGroupRootsInConfig(groupId, cfg);
    }

    function isRootWorkspace(workspaceId, configRef) {
        var targetId = normalizeWorkspaceId(workspaceId);
        if (!targetId) return false;
        return !getWorkspaceParentId(targetId, configRef) && !!getWorkspaceById(targetId, configRef);
    }

    function getGroups(configRef) {
        var cfg = getEnsuredConfig(configRef);
        return cfg ? cfg.sidebarGroups : [];
    }

    function findGroupById(groupId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        return findGroupByIdInConfig(groupId, cfg);
    }

    function getGroupMap(configRef) {
        var map = new Map();
        getGroups(configRef).forEach(function (group) {
            map.set(String(group.id), group);
        });
        return map;
    }

    function getGroupParentWorkspaceId(groupId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        var group = findGroupByIdInConfig(groupId, cfg);
        return group ? normalizeWorkspaceId(group.parentWorkspaceId) : '';
    }

    function canPlaceGroupUnderWorkspaceInConfig(groupId, parentWorkspaceId, cfg) {
        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        if (!targetParentId) return true;

        var group = findGroupByIdInConfig(groupId, cfg);
        if (!group) return false;

        var parentWorkspace = getWorkspaceById(targetParentId, cfg);
        if (!parentWorkspace) return false;

        var parentRoot = getWorkspaceRoot(targetParentId, cfg);
        if (parentRoot && getWorkspaceGroupIdFromConfig(parentRoot, cfg) === normalizeGroupId(group.id)) {
            return false;
        }

        return true;
    }

    function canPlaceGroupUnderWorkspace(groupId, parentWorkspaceId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        if (!cfg) return false;
        return canPlaceGroupUnderWorkspaceInConfig(groupId, parentWorkspaceId, cfg);
    }

    function normalizeGroupParentWorkspaceId(parentWorkspaceId, groupId, configRef) {
        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        if (!targetParentId) return '';
        return canPlaceGroupUnderWorkspaceInConfig(groupId, targetParentId, configRef || getConfigRef()) ? targetParentId : '';
    }

    function getGroupsForParentInConfig(parentWorkspaceId, cfg) {
        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        return getGroupsRaw(cfg).filter(function (group) {
            return normalizeWorkspaceId(group.parentWorkspaceId) === targetParentId;
        });
    }

    function getGroupsForParent(parentWorkspaceId, configRef) {
        var cfg = getEnsuredConfig(configRef);
        return getGroupsForParentInConfig(parentWorkspaceId, cfg);
    }

    function getWorkspaceChildren(parentWorkspaceId, configRef) {
        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        if (!targetParentId) {
            return getRootWorkspaces(configRef).filter(function (workspace) {
                return !getWorkspaceGroupIdFromConfig(workspace, configRef);
            });
        }
        var parentWorkspace = getWorkspaceById(targetParentId, configRef);
        return parentWorkspace && Array.isArray(parentWorkspace.subTabs)
            ? parentWorkspace.subTabs.filter(Boolean)
            : [];
    }

    Object.assign(rt, {
        DEFAULT_GROUP_COLORS: DEFAULT_GROUP_COLORS,
        ORDER_MODE_AUTO: ORDER_MODE_AUTO,
        ORDER_MODE_MANUAL: ORDER_MODE_MANUAL,
        getConfigRef: getConfigRef,
        getHelpers: getHelpers,
        normalizeGroupId: normalizeGroupId,
        normalizeWorkspaceId: normalizeWorkspaceId,
        normalizeColor: normalizeColor,
        sanitizeGroup: sanitizeGroup,
        normalizeOrderMode: normalizeOrderMode,
        makeOrderToken: makeOrderToken,
        parseOrderToken: parseOrderToken,
        normalizeManualOrderShape: normalizeManualOrderShape,
        getManualOrderState: getManualOrderState,
        getManualOrderKey: getManualOrderKey,
        getRootWorkspaces: getRootWorkspaces,
        getWorkspaceById: getWorkspaceById,
        getWorkspaceParentId: getWorkspaceParentId,
        getWorkspaceRoot: getWorkspaceRoot,
        getRootWorkspaceById: getRootWorkspaceById,
        getWorkspaceGroupIdFromConfig: getWorkspaceGroupIdFromConfig,
        getWorkspaceGroupId: getWorkspaceGroupId,
        getGroupsRaw: getGroupsRaw,
        findGroupByIdInConfig: findGroupByIdInConfig,
        getGroupRootsInConfig: getGroupRootsInConfig,
        getGroupRoots: getGroupRoots,
        isRootWorkspace: isRootWorkspace,
        getGroups: getGroups,
        findGroupById: findGroupById,
        getGroupMap: getGroupMap,
        getGroupParentWorkspaceId: getGroupParentWorkspaceId,
        canPlaceGroupUnderWorkspaceInConfig: canPlaceGroupUnderWorkspaceInConfig,
        canPlaceGroupUnderWorkspace: canPlaceGroupUnderWorkspace,
        normalizeGroupParentWorkspaceId: normalizeGroupParentWorkspaceId,
        getGroupsForParentInConfig: getGroupsForParentInConfig,
        getGroupsForParent: getGroupsForParent,
        getWorkspaceChildren: getWorkspaceChildren
    });

    rt.sharedReady = true;
})();
