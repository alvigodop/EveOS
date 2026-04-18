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

    function getHelpers() {
        return window.EveWorkspaceHelpers || null;
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
        var cfg = ensureConfigDefaults(configRef);
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
        var cfg = ensureConfigDefaults(configRef);
        return getGroupRootsInConfig(groupId, cfg);
    }

    function isRootWorkspace(workspaceId, configRef) {
        var targetId = normalizeWorkspaceId(workspaceId);
        if (!targetId) return false;
        return !getWorkspaceParentId(targetId, configRef) && !!getWorkspaceById(targetId, configRef);
    }

    function getGroups(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        return cfg ? cfg.sidebarGroups : [];
    }

    function findGroupById(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
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
        var cfg = ensureConfigDefaults(configRef);
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
        var cfg = ensureConfigDefaults(configRef);
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
        var cfg = ensureConfigDefaults(configRef);
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

    function buildAutomaticEntriesForParent(parentWorkspaceId, cfg) {
        var entries = [];
        getGroupsForParentInConfig(parentWorkspaceId, cfg).forEach(function (group) {
            entries.push({
                kind: 'group',
                id: String(group.id),
                parentWorkspaceId: normalizeWorkspaceId(parentWorkspaceId),
                group: group,
                workspaces: getGroupRootsInConfig(group.id, cfg)
            });
        });

        getWorkspaceChildren(parentWorkspaceId, cfg).forEach(function (workspace) {
            entries.push({
                kind: 'workspace',
                id: String(workspace.id),
                parentWorkspaceId: normalizeWorkspaceId(parentWorkspaceId),
                workspace: workspace
            });
        });

        return entries;
    }

    function entryToToken(entry) {
        if (!entry || !entry.kind || !entry.id) return '';
        return makeOrderToken(entry.kind, entry.id);
    }

    function normalizeManualOrderTokens(tokens, cfg, parentWorkspaceId) {
        var automaticEntries = buildAutomaticEntriesForParent(parentWorkspaceId, cfg || {});
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

    function getManualOrderTokensForParent(parentWorkspaceId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];

        var state = getManualOrderState(cfg);
        var key = getManualOrderKey(parentWorkspaceId);
        var sourceTokens = key === 'root' ? state.root : state.parents[key];
        var normalized = normalizeManualOrderTokens(sourceTokens, cfg, parentWorkspaceId);

        if (key === 'root') state.root = normalized;
        else if (normalized.length) state.parents[key] = normalized;
        else delete state.parents[key];

        return normalized.slice();
    }

    function setManualOrderTokensForParent(parentWorkspaceId, tokens, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];

        var state = getManualOrderState(cfg);
        var key = getManualOrderKey(parentWorkspaceId);
        var normalized = normalizeManualOrderTokens(tokens, cfg, parentWorkspaceId);

        if (key === 'root') state.root = normalized;
        else if (normalized.length) state.parents[key] = normalized;
        else delete state.parents[key];

        return normalized.slice();
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

        var seen = new Set();
        cfg.sidebarGroups = cfg.sidebarGroups
            .map(function (group, index) { return sanitizeGroup(group, index); })
            .filter(function (group) {
                if (!group) return false;
                if (seen.has(group.id)) return false;
                seen.add(group.id);
                return true;
            });

        cfg.sidebarGroups.forEach(function (group) {
            group.parentWorkspaceId = normalizeGroupParentWorkspaceId(group.parentWorkspaceId, group.id, cfg);
        });

        var manualState = getManualOrderState(cfg);
        manualState.root = normalizeManualOrderTokens(manualState.root, cfg, '');

        var validParentIds = new Set();
        var helpers = getHelpers();
        if (helpers && typeof helpers.flattenIds === 'function') {
            helpers.flattenIds(cfg.workspaces || []).forEach(function (workspaceId) {
                validParentIds.add(String(workspaceId));
            });
        } else {
            getRootWorkspaces(cfg).forEach(function (workspace) {
                if (workspace && workspace.id) validParentIds.add(String(workspace.id));
            });
        }

        Object.keys(manualState.parents).forEach(function (parentId) {
            if (!validParentIds.has(parentId)) {
                delete manualState.parents[parentId];
                return;
            }
            var normalized = normalizeManualOrderTokens(manualState.parents[parentId], cfg, parentId);
            if (normalized.length) manualState.parents[parentId] = normalized;
            else delete manualState.parents[parentId];
        });

        if (cfg.sidebarFocusedGroupId && !cfg.sidebarGroups.some(function (group) {
            return String(group.id) === cfg.sidebarFocusedGroupId;
        })) {
            cfg.sidebarFocusedGroupId = '';
        }

        return cfg;
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

        var rootEntries = buildAutomaticEntriesForParent('', cfg);
        var visibleGroups = [];
        var hiddenGroups = [];
        var ungroupedWorkspaces = [];

        rootEntries.forEach(function (entry) {
            if (entry.kind === 'group') {
                if (entry.group.hidden) hiddenGroups.push(entry.group);
                if (!entry.group.hidden || cfg.showHiddenSidebarGroups) {
                    visibleGroups.push({
                        group: entry.group,
                        workspaces: entry.workspaces
                    });
                }
                return;
            }
            if (entry.workspace) ungroupedWorkspaces.push(entry.workspace);
        });

        return {
            hasGroups: visibleGroups.length > 0 || hiddenGroups.length > 0,
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
            getManualOrderTokensForParent('', cfg);
        }
        return cfg.sidebarOrderMode;
    }

    function resetManualOrder(configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];
        cfg.sidebarManualOrder = {
            root: buildAutomaticEntriesForParent('', cfg).map(entryToToken).filter(Boolean),
            parents: {}
        };
        return cfg.sidebarManualOrder.root.slice();
    }

    function getOrderedEntries(parentWorkspaceId, configRef, options) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return [];

        var opts = options && typeof options === 'object' ? options : {};
        var includeHidden = !!opts.includeHidden;
        var automaticEntries = buildAutomaticEntriesForParent(parentWorkspaceId, cfg);
        var orderedEntries = automaticEntries;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            var entryMap = new Map();
            automaticEntries.forEach(function (entry) {
                entryMap.set(entryToToken(entry), entry);
            });
            orderedEntries = getManualOrderTokensForParent(parentWorkspaceId, cfg)
                .map(function (token) { return entryMap.get(token); })
                .filter(Boolean);
        }

        if (includeHidden) return orderedEntries;
        return orderedEntries.filter(function (entry) {
            return entry.kind !== 'group' || !entry.group.hidden || cfg.showHiddenSidebarGroups;
        });
    }

    function getOrderedRootEntries(configRef, options) {
        return getOrderedEntries('', configRef, options);
    }

    function getManualOrderEntries(configRef, parentWorkspaceId) {
        return getManualOrderTokensForParent(parentWorkspaceId || '', configRef);
    }

    function removeManualOrderEntry(entryType, entryId, configRef, parentWorkspaceId) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var state = getManualOrderState(cfg);
        var changed = false;

        function removeFromParent(parentId) {
            var key = getManualOrderKey(parentId);
            var tokens = key === 'root'
                ? state.root.slice()
                : Array.isArray(state.parents[key]) ? state.parents[key].slice() : [];
            var nextTokens = tokens.filter(function (token) { return token !== sourceToken; });
            if (nextTokens.length === tokens.length) return;
            changed = true;
            if (key === 'root') state.root = nextTokens;
            else if (nextTokens.length) state.parents[key] = nextTokens;
            else delete state.parents[key];
        }

        var explicitParentId = normalizeWorkspaceId(parentWorkspaceId);
        if (explicitParentId || parentWorkspaceId === '') {
            removeFromParent(explicitParentId);
            return changed;
        }

        removeFromParent('');
        Object.keys(state.parents).forEach(function (key) {
            removeFromParent(key);
        });
        return changed;
    }

    function placeManualOrderEntry(entryType, entryId, beforeEntryType, beforeEntryId, configRef, parentWorkspaceId) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        cfg.sidebarOrderMode = ORDER_MODE_MANUAL;
        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        var actualTokens = new Set(buildAutomaticEntriesForParent(targetParentId, cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        removeManualOrderEntry(entryType, entryId, cfg);
        var nextTokens = getManualOrderTokensForParent(targetParentId, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var beforeToken = makeOrderToken(beforeEntryType, beforeEntryId);
        var insertIndex = beforeToken ? nextTokens.indexOf(beforeToken) : -1;
        if (insertIndex === -1) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        setManualOrderTokensForParent(targetParentId, nextTokens, cfg);
        return true;
    }

    function placeManualOrderEntryAfter(entryType, entryId, afterEntryType, afterEntryId, configRef, parentWorkspaceId) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        cfg.sidebarOrderMode = ORDER_MODE_MANUAL;
        var sourceToken = makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var targetParentId = normalizeWorkspaceId(parentWorkspaceId);
        var actualTokens = new Set(buildAutomaticEntriesForParent(targetParentId, cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        removeManualOrderEntry(entryType, entryId, cfg);
        var nextTokens = getManualOrderTokensForParent(targetParentId, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var afterToken = makeOrderToken(afterEntryType, afterEntryId);
        var insertIndex = afterToken ? nextTokens.indexOf(afterToken) + 1 : -1;
        if (insertIndex <= 0) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        setManualOrderTokensForParent(targetParentId, nextTokens, cfg);
        return true;
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
            hidden: opts.hidden,
            parentWorkspaceId: opts.parentWorkspaceId
        }, groups.length);
        nextGroup.parentWorkspaceId = normalizeGroupParentWorkspaceId(nextGroup.parentWorkspaceId, nextGroup.id, cfg);

        groups.push(nextGroup);
        cfg.sidebarGroups = groups;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            placeManualOrderEntry('group', nextGroup.id, '', '', cfg, nextGroup.parentWorkspaceId);
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
        var previousParentId = normalizeWorkspaceId(group.parentWorkspaceId);

        group.name = String(next.name != null ? next.name : group.name).trim() || group.name;
        group.color = normalizeColor(next.color != null ? next.color : group.color, Math.max(index, 0));
        if (Object.prototype.hasOwnProperty.call(next, 'collapsed')) group.collapsed = !!next.collapsed;
        if (Object.prototype.hasOwnProperty.call(next, 'hidden')) group.hidden = !!next.hidden;
        if (Object.prototype.hasOwnProperty.call(next, 'parentWorkspaceId')) {
            group.parentWorkspaceId = normalizeGroupParentWorkspaceId(next.parentWorkspaceId, group.id, cfg);
        }

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL && previousParentId !== normalizeWorkspaceId(group.parentWorkspaceId)) {
            placeManualOrderEntry('group', group.id, '', '', cfg, group.parentWorkspaceId);
        }

        return group;
    }

    function deleteGroup(groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        var targetId = normalizeGroupId(groupId);
        if (!cfg || !targetId) return false;

        var group = findGroupById(targetId, cfg);
        if (!group) return false;

        var rootTokenIndex = getManualOrderTokensForParent('', cfg).indexOf(makeOrderToken('group', targetId));
        var groupRoots = getGroupRoots(targetId, cfg).map(function (workspace) {
            return String(workspace.id);
        });
        var wasRootGroup = !normalizeWorkspaceId(group.parentWorkspaceId);
        var beforeCount = getGroups(cfg).length;

        cfg.sidebarGroups = getGroups(cfg).filter(function (entry) {
            return String(entry.id) !== targetId;
        });
        if (cfg.sidebarGroups.length === beforeCount) return false;

        if (cfg.sidebarFocusedGroupId === targetId) cfg.sidebarFocusedGroupId = '';

        getRootWorkspaces(cfg).forEach(function (workspace) {
            if (normalizeGroupId(workspace.groupId) === targetId) delete workspace.groupId;
        });

        removeManualOrderEntry('group', targetId, cfg);

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL && wasRootGroup && groupRoots.length) {
            var rootTokens = getManualOrderTokensForParent('', cfg).slice();
            var insertIndex = rootTokenIndex >= 0 ? Math.min(rootTokenIndex, rootTokens.length) : rootTokens.length;
            groupRoots.forEach(function (workspaceId, offset) {
                var token = makeOrderToken('workspace', workspaceId);
                if (rootTokens.indexOf(token) !== -1) return;
                rootTokens.splice(insertIndex + offset, 0, token);
            });
            setManualOrderTokensForParent('', rootTokens, cfg);
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
        if (focusedGroupId) return !isWorkspaceInFocusedGroup(workspaceOrId, cfg);

        var workspace = workspaceOrId && typeof workspaceOrId === 'object'
            ? workspaceOrId
            : getWorkspaceById(workspaceOrId, cfg);
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
        var helpers = getHelpers();
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
        var helpers = getHelpers();
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

    function canGroupWorkspaceInGroup(workspaceId, groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg || !isRootWorkspace(workspaceId, cfg)) return false;

        var group = findGroupById(groupId, cfg);
        if (!group) return false;

        var groupParentId = getGroupParentWorkspaceId(group.id, cfg);
        if (!groupParentId) return true;
        if (groupParentId === normalizeWorkspaceId(workspaceId)) return false;

        var helpers = getHelpers();
        var rootWorkspace = getRootWorkspaceById(workspaceId, cfg);
        if (!helpers || !rootWorkspace || typeof helpers.getPath !== 'function') return true;
        return helpers.getPath([rootWorkspace], groupParentId).length === 0;
    }

    function moveRootWorkspaceToGroup(workspaceId, groupId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        var targetId = normalizeGroupId(groupId);
        if (!cfg || !isRootWorkspace(workspaceId, cfg)) return false;
        if (targetId && !findGroupById(targetId, cfg)) return false;
        if (targetId && !canGroupWorkspaceInGroup(workspaceId, targetId, cfg)) return false;

        var roots = getRootWorkspaces(cfg).slice();
        var dragIndex = roots.findIndex(function (workspace) {
            return String(workspace.id) === String(workspaceId);
        });
        if (dragIndex === -1) return false;

        var dragged = roots.splice(dragIndex, 1)[0];
        var previousGroupId = getWorkspaceGroupId(dragged, cfg);
        if (targetId) dragged.groupId = targetId;
        else delete dragged.groupId;

        var insertIndex = roots.length;
        if (targetId) {
            var lastIndex = roots.reduce(function (acc, workspace, index) {
                return getWorkspaceGroupId(workspace, cfg) === targetId ? index : acc;
            }, -1);
            insertIndex = lastIndex === -1 ? roots.length : lastIndex + 1;
        }
        roots.splice(insertIndex, 0, dragged);
        cfg.workspaces = roots;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            if (targetId) {
                removeManualOrderEntry('workspace', workspaceId, cfg);
            } else if (previousGroupId) {
                placeManualOrderEntryAfter('workspace', workspaceId, 'group', previousGroupId, cfg, '');
            } else {
                placeManualOrderEntry('workspace', workspaceId, '', '', cfg, '');
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
            return placeManualOrderEntryAfter('workspace', workspaceId, 'group', prevGroup, cfg, '');
        }
        return placeManualOrderEntry('workspace', workspaceId, '', '', cfg, '');
    }

    function setGroupParentWorkspaceId(groupId, parentWorkspaceId, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        var group = findGroupById(groupId, cfg);
        if (!group) return false;

        var nextParentId = normalizeGroupParentWorkspaceId(parentWorkspaceId, group.id, cfg);
        var previousParentId = normalizeWorkspaceId(group.parentWorkspaceId);
        if (previousParentId === nextParentId) return true;

        group.parentWorkspaceId = nextParentId;

        if (cfg.sidebarOrderMode === ORDER_MODE_MANUAL) {
            placeManualOrderEntry('group', group.id, '', '', cfg, nextParentId);
        }

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
        getGroupParentWorkspaceId: getGroupParentWorkspaceId,
        setGroupParentWorkspaceId: setGroupParentWorkspaceId,
        getGroupsForParent: getGroupsForParent,
        getVisibleBuckets: getVisibleBuckets,
        getFocusedGroupId: getFocusedGroupId,
        setFocusedGroup: setFocusedGroup,
        isWorkspaceInFocusedGroup: isWorkspaceInFocusedGroup,
        isWorkspaceEffectivelyInactive: isWorkspaceEffectivelyInactive,
        isGroupEffectivelyInactive: isGroupEffectivelyInactive,
        getSidebarOrderMode: getSidebarOrderMode,
        setSidebarOrderMode: setSidebarOrderMode,
        getOrderedEntries: getOrderedEntries,
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
        canGroupWorkspaceInGroup: canGroupWorkspaceInGroup,
        canPlaceGroupUnderWorkspace: canPlaceGroupUnderWorkspace,
        moveRootWorkspaceToGroup: moveRootWorkspaceToGroup
    };
})();
