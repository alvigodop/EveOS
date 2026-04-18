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
    var ORDER_MODE_AUTO = 'auto';
    var ORDER_MODE_MANUAL = 'manual';

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

    function getRootWorkspaces(configRef) {
        var cfg = configRef || getConfigRef();
        return Array.isArray(cfg && cfg.workspaces) ? cfg.workspaces.filter(Boolean) : [];
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

    function getWorkspaceGroupIdFromConfig(workspaceOrId, cfg) {
        if (!cfg) return '';
        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : getRootWorkspaceById(workspaceOrId, cfg);
        if (!workspace) return '';
        var groupId = normalizeGroupId(workspace.groupId);
        var groups = Array.isArray(cfg.sidebarGroups) ? cfg.sidebarGroups : [];
        for (var i = 0; i < groups.length; i += 1) {
            if (String(groups[i].id) === groupId) return groupId;
        }
        return '';
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

    function getWorkspaceGroupId(workspaceOrId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return getWorkspaceGroupIdFromConfig(workspaceOrId, cfg);
    }

    function getGroupRoots(groupId, configRef) {
        var targetId = normalizeGroupId(groupId);
        return getRootWorkspaces(configRef).filter(function (workspace) {
            return getWorkspaceGroupId(workspace, configRef) === targetId;
        });
    }

    function buildAutomaticEntries(cfg) {
        var groups = Array.isArray(cfg && cfg.sidebarGroups) ? cfg.sidebarGroups : [];
        var groupedRoots = new Map();
        groups.forEach(function (group) {
            groupedRoots.set(String(group.id), []);
        });

        var ungroupedWorkspaces = [];
        getRootWorkspaces(cfg).forEach(function (workspace) {
            var groupId = getWorkspaceGroupIdFromConfig(workspace, cfg);
            if (groupId && groupedRoots.has(groupId)) groupedRoots.get(groupId).push(workspace);
            else ungroupedWorkspaces.push(workspace);
        });

        var entries = [];
        groups.forEach(function (group) {
            entries.push({
                kind: 'group',
                id: String(group.id),
                group: group,
                workspaces: groupedRoots.get(String(group.id)) || []
            });
        });
        ungroupedWorkspaces.forEach(function (workspace) {
            entries.push({
                kind: 'workspace',
                id: String(workspace.id),
                workspace: workspace
            });
        });
        return entries;
    }

    function entryToToken(entry) {
        if (!entry || !entry.kind || !entry.id) return '';
        return makeOrderToken(entry.kind, entry.id);
    }

    function normalizeManualOrderTokens(tokens, cfg) {
        var automaticEntries = buildAutomaticEntries(cfg || {});
        var actualTokens = automaticEntries.map(entryToToken).filter(Boolean);
        var actualSet = new Set(actualTokens);
        var used = new Set();
        var normalized = [];

        (Array.isArray(tokens) ? tokens : []).forEach(function (token) {
            var parsed = parseOrderToken(token);
            var canonical = parsed ? makeOrderToken(parsed.type, parsed.id) : '';
            if (!canonical || used.has(canonical) || !actualSet.has(canonical)) return;
            used.add(canonical);
            normalized.push(canonical);
        });

        actualTokens.forEach(function (token) {
            if (used.has(token)) return;
            used.add(token);
            normalized.push(token);
        });

        return normalized;
    }

    function ensureConfigDefaults(configRef) {
        var cfg = configRef || getConfigRef();
        if (!cfg) return null;
        if (!Array.isArray(cfg.sidebarGroups)) cfg.sidebarGroups = [];
        if (typeof cfg.showHiddenSidebarGroups !== 'boolean') cfg.showHiddenSidebarGroups = false;
        if (typeof cfg.showInactiveTabs !== 'boolean') cfg.showInactiveTabs = false;
        if (typeof cfg.sidebarFocusedGroupId !== 'string') cfg.sidebarFocusedGroupId = '';
        cfg.sidebarFocusedGroupId = normalizeGroupId(cfg.sidebarFocusedGroupId);
        cfg.sidebarOrderMode = normalizeOrderMode(cfg.sidebarOrderMode);
        if (!Array.isArray(cfg.sidebarManualOrder)) cfg.sidebarManualOrder = [];

        var seen = new Set();
        cfg.sidebarGroups = cfg.sidebarGroups
            .map(function (group, index) { return sanitizeGroup(group, index); })
            .filter(function (group) {
                if (!group) return false;
                if (seen.has(group.id)) return false;
                seen.add(group.id);
                return true;
            });

        cfg.sidebarManualOrder = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg);
        if (cfg.sidebarFocusedGroupId && !cfg.sidebarGroups.some(function (group) {
            return String(group.id) === cfg.sidebarFocusedGroupId;
        })) {
            cfg.sidebarFocusedGroupId = '';
        }
        return cfg;
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
            if (groupId && groupedRoots.has(groupId)) groupedRoots.get(groupId).push(workspace);
            else ungroupedWorkspaces.push(workspace);
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

    function getSidebarOrderMode(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return cfg ? cfg.sidebarOrderMode : ORDER_MODE_AUTO;
    }

    function setSidebarOrderMode(nextMode, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return ORDER_MODE_AUTO;
        cfg.sidebarOrderMode = normalizeOrderMode(nextMode);
        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            cfg.sidebarManualOrder = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg);
        }
        return cfg.sidebarOrderMode;
    }

    function resetManualOrder(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];
        cfg.sidebarManualOrder = buildAutomaticEntries(cfg).map(entryToToken).filter(Boolean);
        return cfg.sidebarManualOrder.slice();
    }

    function getOrderedRootEntries(configRef, options) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];

        var opts = options && typeof options === 'object' ? options : {};
        var includeHidden = !!opts.includeHidden;
        var automaticEntries = buildAutomaticEntries(cfg);
        var orderedEntries = automaticEntries;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            cfg.sidebarManualOrder = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg);
            var entryMap = new Map();
            automaticEntries.forEach(function (entry) {
                entryMap.set(entryToToken(entry), entry);
            });
            orderedEntries = cfg.sidebarManualOrder
                .map(function (token) { return entryMap.get(token); })
                .filter(Boolean);
        }

        if (includeHidden) return orderedEntries;
        return orderedEntries.filter(function (entry) {
            return entry.kind !== 'group' || !entry.group.hidden || cfg.showHiddenSidebarGroups;
        });
    }

    function getManualOrderEntries(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return cfg ? cfg.sidebarManualOrder.slice() : [];
    }

    function placeManualOrderEntry(entryType, entryId, beforeEntryType, beforeEntryId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        cfg.sidebarOrderMode = ORDER_MODE_MANUAL;
        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var actualTokens = new Set(buildAutomaticEntries(cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        var nextTokens = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var beforeToken = makeOrderToken(beforeEntryType, beforeEntryId);
        var insertIndex = beforeToken ? nextTokens.indexOf(beforeToken) : -1;
        if (insertIndex === -1) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        cfg.sidebarManualOrder = normalizeManualOrderTokens(nextTokens, cfg);
        return true;
    }

    function placeManualOrderEntryAfter(entryType, entryId, afterEntryType, afterEntryId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        cfg.sidebarOrderMode = ORDER_MODE_MANUAL;
        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var actualTokens = new Set(buildAutomaticEntries(cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        var nextTokens = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var afterToken = makeOrderToken(afterEntryType, afterEntryId);
        var insertIndex = afterToken ? nextTokens.indexOf(afterToken) + 1 : -1;
        if (insertIndex <= 0) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        cfg.sidebarManualOrder = normalizeManualOrderTokens(nextTokens, cfg);
        return true;
    }

    function removeManualOrderEntry(entryType, entryId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;
        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;
        var nextTokens = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var changed = nextTokens.length !== cfg.sidebarManualOrder.length;
        cfg.sidebarManualOrder = nextTokens;
        return changed;
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
        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            cfg.sidebarManualOrder = normalizeManualOrderTokens(
                cfg.sidebarManualOrder.concat([makeOrderToken('group', nextGroup.id)]),
                cfg
            );
        }
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

        var groupRoots = getGroupRoots(targetId, cfg).map(function (workspace) {
            return String(workspace.id);
        });
        var manualTokensBefore = normalizeManualOrderTokens(cfg.sidebarManualOrder, cfg);
        var groupToken = makeOrderToken('group', targetId);
        var groupTokenIndex = manualTokensBefore.indexOf(groupToken);
        var beforeCount = getGroups(cfg).length;

        cfg.sidebarGroups = getGroups(cfg).filter(function (group) {
            return String(group.id) !== targetId;
        });
        if (cfg.sidebarGroups.length === beforeCount) return false;
        if (cfg.sidebarFocusedGroupId === targetId) cfg.sidebarFocusedGroupId = '';

        getRootWorkspaces(cfg).forEach(function (workspace) {
            if (normalizeGroupId(workspace.groupId) === targetId) {
                delete workspace.groupId;
            }
        });

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            var nextTokens = manualTokensBefore.filter(function (token) {
                return token !== groupToken;
            });
            var insertIndex = groupTokenIndex >= 0 ? groupTokenIndex : nextTokens.length;
            groupRoots.forEach(function (workspaceId, offset) {
                nextTokens.splice(insertIndex + offset, 0, makeOrderToken('workspace', workspaceId));
            });
            cfg.sidebarManualOrder = normalizeManualOrderTokens(nextTokens, cfg);
        }

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

    function getFocusedGroupId(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return '';
        return normalizeGroupId(cfg.sidebarFocusedGroupId);
    }

    function setFocusedGroup(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return '';
        var targetId = normalizeGroupId(groupId);
        if (targetId && !findGroupById(targetId, cfg)) return getFocusedGroupId(cfg);
        cfg.sidebarFocusedGroupId = targetId;
        return cfg.sidebarFocusedGroupId;
    }

    function getWorkspaceRoot(workspaceOrId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return null;
        var targetId = workspaceOrId && typeof workspaceOrId === 'object'
            ? String(workspaceOrId.id || '').trim()
            : String(workspaceOrId || '').trim();
        if (!targetId) return null;

        var helpers = window.EveWorkspaceHelpers;
        if (helpers && typeof helpers.getPath === 'function') {
            var path = helpers.getPath(cfg.workspaces || [], targetId);
            return path.length ? path[0] : null;
        }

        return getRootWorkspaceById(targetId, cfg);
    }

    function isWorkspaceInFocusedGroup(workspaceOrId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return true;
        var focusedGroupId = getFocusedGroupId(cfg);
        if (!focusedGroupId) return true;
        var rootWorkspace = getWorkspaceRoot(workspaceOrId, cfg);
        if (!rootWorkspace) return false;
        return getWorkspaceGroupId(rootWorkspace, cfg) === focusedGroupId;
    }

    function isWorkspaceEffectivelyInactive(workspaceOrId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;
        var focusedGroupId = getFocusedGroupId(cfg);
        if (focusedGroupId) {
            return !isWorkspaceInFocusedGroup(workspaceOrId, cfg);
        }

        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : null;
        if (!workspace) {
            var helpers = window.EveWorkspaceHelpers;
            if (helpers && typeof helpers.findById === 'function') {
                workspace = helpers.findById(cfg.workspaces || [], workspaceOrId);
            }
        }
        return !!(workspace && workspace.inactive);
    }

    function isGroupEffectivelyInactive(groupId, configRef) {
        var focusedGroupId = getFocusedGroupId(configRef);
        var targetId = normalizeGroupId(groupId);
        return !!focusedGroupId && !!targetId && focusedGroupId !== targetId;
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
        var previousGroupId = getWorkspaceGroupId(dragged, cfg);
        if (targetId) dragged.groupId = targetId;
        else delete dragged.groupId;

        roots.push(dragged);
        cfg.workspaces = roots;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            if (targetId) {
                removeManualOrderEntry('workspace', workspaceId, cfg);
            } else if (previousGroupId) {
                placeManualOrderEntryAfter('workspace', workspaceId, 'group', previousGroupId, cfg);
            } else {
                placeManualOrderEntry('workspace', workspaceId, '', '', cfg);
            }
        }

        return true;
    }

    function syncWorkspaceOrderEntry(workspaceId, previousGroupId, nextGroupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg || cfg.sidebarOrderMode !== ORDER_MODE_MANUAL) return false;

        var workspace = getRootWorkspaceById(workspaceId, cfg);
        if (!workspace || getWorkspaceGroupId(workspace, cfg)) {
            removeManualOrderEntry('workspace', workspaceId, cfg);
            return false;
        }

        var prevGroup = normalizeGroupId(previousGroupId);
        var nextGroup = normalizeGroupId(nextGroupId);
        if (nextGroup) {
            removeManualOrderEntry('workspace', workspaceId, cfg);
            return true;
        }
        if (prevGroup) {
            return placeManualOrderEntryAfter('workspace', workspaceId, 'group', prevGroup, cfg);
        }
        return placeManualOrderEntry('workspace', workspaceId, '', '', cfg);
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
        getFocusedGroupId: getFocusedGroupId,
        setFocusedGroup: setFocusedGroup,
        isWorkspaceInFocusedGroup: isWorkspaceInFocusedGroup,
        isWorkspaceEffectivelyInactive: isWorkspaceEffectivelyInactive,
        isGroupEffectivelyInactive: isGroupEffectivelyInactive,
        getSidebarOrderMode: getSidebarOrderMode,
        setSidebarOrderMode: setSidebarOrderMode,
        getOrderedRootEntries: getOrderedRootEntries,
        getManualOrderEntries: getManualOrderEntries,
        resetManualOrder: resetManualOrder,
        placeManualOrderEntry: placeManualOrderEntry,
        placeManualOrderEntryAfter: placeManualOrderEntryAfter,
        removeManualOrderEntry: removeManualOrderEntry,
        syncWorkspaceOrderEntry: syncWorkspaceOrderEntry,
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
