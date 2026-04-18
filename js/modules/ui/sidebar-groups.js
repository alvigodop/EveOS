(function () {
    'use strict';

    if (window.EveSidebarGroups) return;

    var DEFAULT_GROUP_COLORS = [
        '#00d4ff',
        '#ffb84d',
        '#7fe08a',
        '#ff7a7a',
        '#b38cff',
        '#72d8c4'
    ];

    function getConfigRef() {
        if (typeof config !== 'undefined' && config) return config;
        return window.config || null;
    }

    function normalizeGroupId(value) {
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
            hidden: !!group.hidden
        };
    }

    function ensureConfigDefaults(configRef) {
        var cfg = configRef || getConfigRef();
        if (!cfg) return null;
        if (!Array.isArray(cfg.sidebarGroups)) cfg.sidebarGroups = [];
        if (typeof cfg.showHiddenSidebarGroups !== 'boolean') cfg.showHiddenSidebarGroups = false;
        if (typeof cfg.showInactiveTabs !== 'boolean') cfg.showInactiveTabs = false;

        var seen = new Set();
        cfg.sidebarGroups = cfg.sidebarGroups
            .map(function (group, index) { return sanitizeGroup(group, index); })
            .filter(function (group) {
                if (!group) return false;
                if (seen.has(group.id)) return false;
                seen.add(group.id);
                return true;
            });

        return cfg;
    }

    function getGroups(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return cfg ? cfg.sidebarGroups : [];
    }

    function findGroupById(groupId, configRef) {
        var targetId = normalizeGroupId(groupId);
        if (!targetId) return null;
        var groups = getGroups(configRef);
        for (var i = 0; i < groups.length; i += 1) {
            if (String(groups[i].id) === targetId) return groups[i];
        }
        return null;
    }

    function getGroupMap(configRef) {
        var map = new Map();
        getGroups(configRef).forEach(function (group) {
            map.set(String(group.id), group);
        });
        return map;
    }

    function getRootWorkspaces(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return Array.isArray(cfg && cfg.workspaces) ? cfg.workspaces.filter(Boolean) : [];
    }

    function isRootWorkspace(workspaceId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers || typeof helpers.findParent !== 'function') return false;
        var targetId = String(workspaceId || '').trim();
        if (!targetId) return false;
        return helpers.findParent(cfg.workspaces || [], targetId) == null
            && !!helpers.findById(cfg.workspaces || [], targetId);
    }

    function getRootWorkspaceById(workspaceId, configRef) {
        var targetId = String(workspaceId || '').trim();
        if (!targetId) return null;
        var roots = getRootWorkspaces(configRef);
        for (var i = 0; i < roots.length; i += 1) {
            if (String(roots[i].id) === targetId) return roots[i];
        }
        return null;
    }

    function getWorkspaceGroupId(workspaceOrId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return '';
        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : getRootWorkspaceById(workspaceOrId, cfg);
        if (!workspace) return '';
        var groupId = normalizeGroupId(workspace.groupId);
        return getGroupMap(cfg).has(groupId) ? groupId : '';
    }

    function getGroupRoots(groupId, configRef) {
        var targetId = normalizeGroupId(groupId);
        return getRootWorkspaces(configRef).filter(function (workspace) {
            return getWorkspaceGroupId(workspace, configRef) === targetId;
        });
    }

    function getVisibleBuckets(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) {
            return {
                hasGroups: false,
                visibleGroups: [],
                hiddenGroups: [],
                ungroupedWorkspaces: []
            };
        }

        var groups = getGroups(cfg);
        var groupedRoots = new Map();
        groups.forEach(function (group) {
            groupedRoots.set(String(group.id), []);
        });

        var ungroupedWorkspaces = [];
        getRootWorkspaces(cfg).forEach(function (workspace) {
            var groupId = getWorkspaceGroupId(workspace, cfg);
            if (groupId && groupedRoots.has(groupId)) {
                groupedRoots.get(groupId).push(workspace);
            } else {
                ungroupedWorkspaces.push(workspace);
            }
        });

        var visibleGroups = groups
            .filter(function (group) {
                return !group.hidden || cfg.showHiddenSidebarGroups;
            })
            .map(function (group) {
                return {
                    group: group,
                    workspaces: groupedRoots.get(String(group.id)) || []
                };
            });

        var hiddenGroups = groups.filter(function (group) { return !!group.hidden; });

        return {
            hasGroups: groups.length > 0,
            visibleGroups: visibleGroups,
            hiddenGroups: hiddenGroups,
            ungroupedWorkspaces: ungroupedWorkspaces
        };
    }

    function createGroup(options, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return null;
        var opts = options && typeof options === 'object' ? options : {};
        var groups = getGroups(cfg);
        var nextGroup = sanitizeGroup({
            id: opts.id,
            name: opts.name,
            color: opts.color,
            collapsed: opts.collapsed,
            hidden: opts.hidden
        }, groups.length);
        groups.push(nextGroup);
        cfg.sidebarGroups = groups;
        return nextGroup;
    }

    function updateGroup(groupId, updates, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return null;
        var targetId = normalizeGroupId(groupId);
        var groups = cfg.sidebarGroups;
        var index = groups.findIndex(function (entry) {
            return String(entry.id) === targetId;
        });
        if (index === -1) return null;

        var group = groups[index];
        var next = updates && typeof updates === 'object' ? updates : {};
        group.name = String(next.name != null ? next.name : group.name).trim() || group.name;
        group.color = normalizeColor(next.color != null ? next.color : group.color, Math.max(index, 0));
        if (Object.prototype.hasOwnProperty.call(next, 'collapsed')) group.collapsed = !!next.collapsed;
        if (Object.prototype.hasOwnProperty.call(next, 'hidden')) group.hidden = !!next.hidden;
        return group;
    }

    function deleteGroup(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        var targetId = normalizeGroupId(groupId);
        if (!cfg || !targetId) return false;
        var beforeCount = getGroups(cfg).length;
        cfg.sidebarGroups = getGroups(cfg).filter(function (group) {
            return String(group.id) !== targetId;
        });
        if (cfg.sidebarGroups.length === beforeCount) return false;
        getRootWorkspaces(cfg).forEach(function (workspace) {
            if (normalizeGroupId(workspace.groupId) === targetId) {
                delete workspace.groupId;
            }
        });
        return true;
    }

    function setGroupCollapsed(groupId, nextValue, configRef) {
        var group = findGroupById(groupId, configRef);
        if (!group) return null;
        group.collapsed = typeof nextValue === 'boolean' ? nextValue : !group.collapsed;
        return group;
    }

    function setGroupHidden(groupId, nextValue, configRef) {
        var group = findGroupById(groupId, configRef);
        if (!group) return null;
        group.hidden = typeof nextValue === 'boolean' ? nextValue : !group.hidden;
        if (group.hidden) group.collapsed = true;
        return group;
    }

    function setShowHiddenGroups(nextValue, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;
        cfg.showHiddenSidebarGroups = typeof nextValue === 'boolean'
            ? nextValue
            : !cfg.showHiddenSidebarGroups;
        return cfg.showHiddenSidebarGroups;
    }

    function collapseTabsForGroup(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];
        if (!Array.isArray(cfg.collapsedTabs)) cfg.collapsedTabs = [];
        var helpers = window.EveWorkspaceHelpers;
        var collapsedIds = new Set(cfg.collapsedTabs.map(String));
        getGroupRoots(groupId, cfg).forEach(function (workspace) {
            if (helpers && typeof helpers.walk === 'function') {
                helpers.walk([workspace], function (node) {
                    if (node && Array.isArray(node.subTabs) && node.subTabs.length > 0) {
                        collapsedIds.add(String(node.id));
                    }
                });
            } else if (workspace && Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                collapsedIds.add(String(workspace.id));
            }
        });
        cfg.collapsedTabs = Array.from(collapsedIds);
        return cfg.collapsedTabs;
    }

    function expandTabsForGroup(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];
        if (!Array.isArray(cfg.collapsedTabs)) cfg.collapsedTabs = [];
        var helpers = window.EveWorkspaceHelpers;
        var removableIds = new Set();
        getGroupRoots(groupId, cfg).forEach(function (workspace) {
            if (helpers && typeof helpers.walk === 'function') {
                helpers.walk([workspace], function (node) {
                    if (node && Array.isArray(node.subTabs) && node.subTabs.length > 0) {
                        removableIds.add(String(node.id));
                    }
                });
            } else if (workspace && Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                removableIds.add(String(workspace.id));
            }
        });
        cfg.collapsedTabs = cfg.collapsedTabs.filter(function (id) {
            return !removableIds.has(String(id));
        });
        return cfg.collapsedTabs;
    }

    function collapseAllGroups(configRef) {
        getGroups(configRef).forEach(function (group) {
            group.collapsed = true;
        });
        return getGroups(configRef);
    }

    function expandAllGroups(configRef) {
        getGroups(configRef).forEach(function (group) {
            group.collapsed = false;
        });
        return getGroups(configRef);
    }

    function moveRootWorkspaceToGroup(workspaceId, groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        var targetId = normalizeGroupId(groupId);
        if (!cfg || !isRootWorkspace(workspaceId, cfg)) return false;
        if (targetId && !findGroupById(targetId, cfg)) return false;

        var roots = getRootWorkspaces(cfg).slice();
        var dragIndex = roots.findIndex(function (workspace) {
            return String(workspace.id) === String(workspaceId);
        });
        if (dragIndex === -1) return false;

        var dragged = roots.splice(dragIndex, 1)[0];
        if (targetId) dragged.groupId = targetId;
        else delete dragged.groupId;

        roots.push(dragged);
        cfg.workspaces = roots;
        return true;
    }

    window.EveSidebarGroups = {
        ensureConfigDefaults: ensureConfigDefaults,
        getGroups: getGroups,
        getGroupMap: getGroupMap,
        findGroupById: findGroupById,
        getRootWorkspaces: getRootWorkspaces,
        getWorkspaceGroupId: getWorkspaceGroupId,
        getGroupRoots: getGroupRoots,
        getVisibleBuckets: getVisibleBuckets,
        isRootWorkspace: isRootWorkspace,
        createGroup: createGroup,
        updateGroup: updateGroup,
        deleteGroup: deleteGroup,
        setGroupCollapsed: setGroupCollapsed,
        setGroupHidden: setGroupHidden,
        setShowHiddenGroups: setShowHiddenGroups,
        collapseTabsForGroup: collapseTabsForGroup,
        expandTabsForGroup: expandTabsForGroup,
        collapseAllGroups: collapseAllGroups,
        expandAllGroups: expandAllGroups,
        moveRootWorkspaceToGroup: moveRootWorkspaceToGroup
    };
})();
