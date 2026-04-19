(function () {
    'use strict';

    var rt = window.EveSidebarGroupsRuntime = window.EveSidebarGroupsRuntime || {};
    if (rt.mutationsReady || !rt.sharedReady || !rt.orderReady) return;

    function createGroup(options, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return null;

        var opts = options && typeof options === 'object' ? options : {};
        var groups = rt.getGroups(cfg);
        var nextGroup = rt.sanitizeGroup({
            id: opts.id,
            name: opts.name,
            color: opts.color,
            collapsed: opts.collapsed,
            hidden: opts.hidden,
            parentWorkspaceId: opts.parentWorkspaceId
        }, groups.length);
        nextGroup.parentWorkspaceId = rt.normalizeGroupParentWorkspaceId(nextGroup.parentWorkspaceId, nextGroup.id, cfg);

        groups.push(nextGroup);
        cfg.sidebarGroups = groups;

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL) {
            rt.placeManualOrderEntry('group', nextGroup.id, '', '', cfg, nextGroup.parentWorkspaceId);
        }

        return nextGroup;
    }

    function updateGroup(groupId, updates, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return null;

        var targetId = rt.normalizeGroupId(groupId);
        var groups = cfg.sidebarGroups;
        var index = groups.findIndex(function (entry) {
            return String(entry.id) === targetId;
        });
        if (index === -1) return null;

        var group = groups[index];
        var next = updates && typeof updates === 'object' ? updates : {};
        var previousParentId = rt.normalizeWorkspaceId(group.parentWorkspaceId);

        group.name = String(next.name != null ? next.name : group.name).trim() || group.name;
        group.color = rt.normalizeColor(next.color != null ? next.color : group.color, Math.max(index, 0));
        if (Object.prototype.hasOwnProperty.call(next, 'collapsed')) group.collapsed = !!next.collapsed;
        if (Object.prototype.hasOwnProperty.call(next, 'hidden')) group.hidden = !!next.hidden;
        if (Object.prototype.hasOwnProperty.call(next, 'parentWorkspaceId')) {
            group.parentWorkspaceId = rt.normalizeGroupParentWorkspaceId(next.parentWorkspaceId, group.id, cfg);
        }

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL && previousParentId !== rt.normalizeWorkspaceId(group.parentWorkspaceId)) {
            rt.placeManualOrderEntry('group', group.id, '', '', cfg, group.parentWorkspaceId);
        }

        return group;
    }

    function deleteGroup(groupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        var targetId = rt.normalizeGroupId(groupId);
        if (!cfg || !targetId) return false;

        var group = rt.findGroupById(targetId, cfg);
        if (!group) return false;

        var rootTokenIndex = rt.getManualOrderTokensForParent('', cfg).indexOf(rt.makeOrderToken('group', targetId));
        var groupRoots = rt.getGroupRoots(targetId, cfg).map(function (workspace) {
            return String(workspace.id);
        });
        var wasRootGroup = !rt.normalizeWorkspaceId(group.parentWorkspaceId);
        var beforeCount = rt.getGroups(cfg).length;

        cfg.sidebarGroups = rt.getGroups(cfg).filter(function (entry) {
            return String(entry.id) !== targetId;
        });
        if (cfg.sidebarGroups.length === beforeCount) return false;

        if (cfg.sidebarFocusedGroupId === targetId) cfg.sidebarFocusedGroupId = '';

        rt.getRootWorkspaces(cfg).forEach(function (workspace) {
            if (rt.normalizeGroupId(workspace.groupId) === targetId) delete workspace.groupId;
        });

        rt.removeManualOrderEntry('group', targetId, cfg);

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL && wasRootGroup && groupRoots.length) {
            var rootTokens = rt.getManualOrderTokensForParent('', cfg).slice();
            var insertIndex = rootTokenIndex >= 0 ? Math.min(rootTokenIndex, rootTokens.length) : rootTokens.length;
            groupRoots.forEach(function (workspaceId, offset) {
                var token = rt.makeOrderToken('workspace', workspaceId);
                if (rootTokens.indexOf(token) !== -1) return;
                rootTokens.splice(insertIndex + offset, 0, token);
            });
            rt.setManualOrderTokensForParent('', rootTokens, cfg);
        }

        return true;
    }

    function setGroupCollapsed(groupId, nextValue, configRef) {
        var group = rt.findGroupById(groupId, configRef);
        if (!group) return null;
        group.collapsed = typeof nextValue === 'boolean' ? nextValue : !group.collapsed;
        return group;
    }

    function setGroupHidden(groupId, nextValue, configRef) {
        var group = rt.findGroupById(groupId, configRef);
        if (!group) return null;
        group.hidden = typeof nextValue === 'boolean' ? nextValue : !group.hidden;
        if (group.hidden) group.collapsed = true;
        return group;
    }

    function setShowHiddenGroups(nextValue, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return false;
        cfg.showHiddenSidebarGroups = typeof nextValue === 'boolean'
            ? nextValue
            : !cfg.showHiddenSidebarGroups;
        return cfg.showHiddenSidebarGroups;
    }

    function getFocusedGroupId(configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return '';
        return rt.normalizeGroupId(cfg.sidebarFocusedGroupId);
    }

    function setFocusedGroup(groupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return '';
        var targetId = rt.normalizeGroupId(groupId);
        if (targetId && !rt.findGroupById(targetId, cfg)) return getFocusedGroupId(cfg);
        cfg.sidebarFocusedGroupId = targetId;
        return cfg.sidebarFocusedGroupId;
    }

    function isWorkspaceInFocusedGroup(workspaceOrId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return true;
        var focusedGroupId = getFocusedGroupId(cfg);
        if (!focusedGroupId) return true;
        var rootWorkspace = rt.getWorkspaceRoot(workspaceOrId, cfg);
        if (!rootWorkspace) return false;
        return rt.getWorkspaceGroupId(rootWorkspace, cfg) === focusedGroupId;
    }

    function isWorkspaceEffectivelyInactive(workspaceOrId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return false;

        var focusedGroupId = getFocusedGroupId(cfg);
        if (focusedGroupId) return !isWorkspaceInFocusedGroup(workspaceOrId, cfg);

        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : rt.getWorkspaceById(workspaceOrId, cfg);
        return !!(workspace && workspace.inactive);
    }

    function isGroupEffectivelyInactive(groupId, configRef) {
        var focusedGroupId = getFocusedGroupId(configRef);
        var targetId = rt.normalizeGroupId(groupId);
        return !!focusedGroupId && !!targetId && focusedGroupId !== targetId;
    }

    function collapseTabsForGroup(groupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return [];
        if (!Array.isArray(cfg.collapsedTabs)) cfg.collapsedTabs = [];
        var helpers = rt.getHelpers();
        var collapsedIds = new Set(cfg.collapsedTabs.map(String));

        rt.getGroupRoots(groupId, cfg).forEach(function (workspace) {
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
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return [];
        if (!Array.isArray(cfg.collapsedTabs)) cfg.collapsedTabs = [];
        var helpers = rt.getHelpers();
        var removableIds = new Set();

        rt.getGroupRoots(groupId, cfg).forEach(function (workspace) {
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
        rt.getGroups(configRef).forEach(function (group) {
            group.collapsed = true;
        });
        return rt.getGroups(configRef);
    }

    function expandAllGroups(configRef) {
        rt.getGroups(configRef).forEach(function (group) {
            group.collapsed = false;
        });
        return rt.getGroups(configRef);
    }

    function canGroupWorkspaceInGroup(workspaceId, groupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg || !rt.isRootWorkspace(workspaceId, cfg)) return false;

        var group = rt.findGroupById(groupId, cfg);
        if (!group) return false;

        var groupParentId = rt.getGroupParentWorkspaceId(group.id, cfg);
        if (!groupParentId) return true;
        if (groupParentId === rt.normalizeWorkspaceId(workspaceId)) return false;

        var helpers = rt.getHelpers();
        var rootWorkspace = rt.getRootWorkspaceById(workspaceId, cfg);
        if (!helpers || !rootWorkspace || typeof helpers.getPath !== 'function') return true;
        return helpers.getPath([rootWorkspace], groupParentId).length === 0;
    }

    function moveRootWorkspaceToGroup(workspaceId, groupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        var targetId = rt.normalizeGroupId(groupId);
        if (!cfg || !rt.isRootWorkspace(workspaceId, cfg)) return false;
        if (targetId && !rt.findGroupById(targetId, cfg)) return false;
        if (targetId && !canGroupWorkspaceInGroup(workspaceId, targetId, cfg)) return false;

        var roots = rt.getRootWorkspaces(cfg).slice();
        var dragIndex = roots.findIndex(function (workspace) {
            return String(workspace.id) === String(workspaceId);
        });
        if (dragIndex === -1) return false;

        var dragged = roots.splice(dragIndex, 1)[0];
        var previousGroupId = rt.getWorkspaceGroupId(dragged, cfg);
        if (targetId) dragged.groupId = targetId;
        else delete dragged.groupId;

        var insertIndex = roots.length;
        if (targetId) {
            var lastIndex = roots.reduce(function (acc, workspace, index) {
                return rt.getWorkspaceGroupId(workspace, cfg) === targetId ? index : acc;
            }, -1);
            insertIndex = lastIndex === -1 ? roots.length : lastIndex + 1;
        }
        roots.splice(insertIndex, 0, dragged);
        cfg.workspaces = roots;

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL) {
            if (targetId) {
                rt.removeManualOrderEntry('workspace', workspaceId, cfg);
            } else if (previousGroupId) {
                rt.placeManualOrderEntryAfter('workspace', workspaceId, 'group', previousGroupId, cfg, '');
            } else {
                rt.placeManualOrderEntry('workspace', workspaceId, '', '', cfg, '');
            }
        }

        return true;
    }

    function syncWorkspaceOrderEntry(workspaceId, previousGroupId, nextGroupId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg || cfg.sidebarOrderMode !== rt.ORDER_MODE_MANUAL) return false;

        var workspace = rt.getRootWorkspaceById(workspaceId, cfg);
        if (!workspace || rt.getWorkspaceGroupId(workspace, cfg)) {
            rt.removeManualOrderEntry('workspace', workspaceId, cfg);
            return false;
        }

        var prevGroup = rt.normalizeGroupId(previousGroupId);
        var nextGroup = rt.normalizeGroupId(nextGroupId);
        if (nextGroup) {
            rt.removeManualOrderEntry('workspace', workspaceId, cfg);
            return true;
        }
        if (prevGroup) {
            return rt.placeManualOrderEntryAfter('workspace', workspaceId, 'group', prevGroup, cfg, '');
        }
        return rt.placeManualOrderEntry('workspace', workspaceId, '', '', cfg, '');
    }

    function setGroupParentWorkspaceId(groupId, parentWorkspaceId, configRef) {
        var cfg = rt.ensureConfigDefaults(configRef);
        if (!cfg) return false;

        var group = rt.findGroupById(groupId, cfg);
        if (!group) return false;

        var nextParentId = rt.normalizeGroupParentWorkspaceId(parentWorkspaceId, group.id, cfg);
        var previousParentId = rt.normalizeWorkspaceId(group.parentWorkspaceId);
        if (previousParentId === nextParentId) return true;

        group.parentWorkspaceId = nextParentId;

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL) {
            rt.placeManualOrderEntry('group', group.id, '', '', cfg, nextParentId);
        }

        return true;
    }

    Object.assign(rt, {
        createGroup: createGroup,
        updateGroup: updateGroup,
        deleteGroup: deleteGroup,
        setGroupCollapsed: setGroupCollapsed,
        setGroupHidden: setGroupHidden,
        setShowHiddenGroups: setShowHiddenGroups,
        getFocusedGroupId: getFocusedGroupId,
        setFocusedGroup: setFocusedGroup,
        isWorkspaceInFocusedGroup: isWorkspaceInFocusedGroup,
        isWorkspaceEffectivelyInactive: isWorkspaceEffectivelyInactive,
        isGroupEffectivelyInactive: isGroupEffectivelyInactive,
        collapseTabsForGroup: collapseTabsForGroup,
        expandTabsForGroup: expandTabsForGroup,
        collapseAllGroups: collapseAllGroups,
        expandAllGroups: expandAllGroups,
        canGroupWorkspaceInGroup: canGroupWorkspaceInGroup,
        moveRootWorkspaceToGroup: moveRootWorkspaceToGroup,
        syncWorkspaceOrderEntry: syncWorkspaceOrderEntry,
        setGroupParentWorkspaceId: setGroupParentWorkspaceId
    });

    rt.mutationsReady = true;
})();
