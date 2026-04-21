(function () {
    'use strict';

    var rt = window.EveSidebarGroupsRuntime = window.EveSidebarGroupsRuntime || {};
    if (rt.orderReady || !rt.sharedReady) return;

    function buildAutomaticEntriesForParent(parentWorkspaceId, cfg) {
        var entries = [];
        rt.getGroupsForParentInConfig(parentWorkspaceId, cfg).forEach(function (group) {
            entries.push({
                kind: 'group',
                id: String(group.id),
                parentWorkspaceId: rt.normalizeWorkspaceId(parentWorkspaceId),
                group: group,
                workspaces: rt.getGroupRootsInConfig(group.id, cfg)
            });
        });

        rt.getWorkspaceChildren(parentWorkspaceId, cfg).forEach(function (workspace) {
            entries.push({
                kind: 'workspace',
                id: String(workspace.id),
                parentWorkspaceId: rt.normalizeWorkspaceId(parentWorkspaceId),
                workspace: workspace
            });
        });

        return entries;
    }

    function entryToToken(entry) {
        if (!entry || !entry.kind || !entry.id) return '';
        return rt.makeOrderToken(entry.kind, entry.id);
    }

    function normalizeManualOrderTokens(tokens, cfg, parentWorkspaceId) {
        var automaticEntries = buildAutomaticEntriesForParent(parentWorkspaceId, cfg || {});
        var actualTokens = automaticEntries.map(entryToToken).filter(Boolean);
        var actualSet = new Set(actualTokens);
        var used = new Set();
        var normalized = [];

        (Array.isArray(tokens) ? tokens : []).forEach(function (token) {
            var parsed = rt.parseOrderToken(token);
            var canonical = parsed ? rt.makeOrderToken(parsed.type, parsed.id) : '';
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

        var state = rt.getManualOrderState(cfg);
        var key = rt.getManualOrderKey(parentWorkspaceId);
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

        var state = rt.getManualOrderState(cfg);
        var key = rt.getManualOrderKey(parentWorkspaceId);
        var normalized = normalizeManualOrderTokens(tokens, cfg, parentWorkspaceId);

        if (key === 'root') state.root = normalized;
        else if (normalized.length) state.parents[key] = normalized;
        else delete state.parents[key];

        return normalized.slice();
    }

    function ensureConfigDefaults(configRef) {
        var cfg = configRef || rt.getConfigRef();
        if (!cfg) return null;

        if (!Array.isArray(cfg.sidebarGroups)) cfg.sidebarGroups = [];
        if (typeof cfg.showHiddenSidebarGroups !== 'boolean') cfg.showHiddenSidebarGroups = false;
        if (typeof cfg.showInactiveTabs !== 'boolean') cfg.showInactiveTabs = false;
        if (typeof cfg.showSidebarDatapackBadges !== 'boolean') cfg.showSidebarDatapackBadges = true;
        if (typeof cfg.sidebarFocusedGroupId !== 'string') cfg.sidebarFocusedGroupId = '';
        cfg.sidebarFocusedGroupId = rt.normalizeGroupId(cfg.sidebarFocusedGroupId);
        cfg.sidebarOrderMode = rt.normalizeOrderMode(cfg.sidebarOrderMode);

        var seen = new Set();
        cfg.sidebarGroups = cfg.sidebarGroups
            .map(function (group, index) { return rt.sanitizeGroup(group, index); })
            .filter(function (group) {
                if (!group) return false;
                if (seen.has(group.id)) return false;
                seen.add(group.id);
                return true;
            });

        cfg.sidebarGroups.forEach(function (group) {
            group.parentWorkspaceId = rt.normalizeGroupParentWorkspaceId(group.parentWorkspaceId, group.id, cfg);
        });

        var manualState = rt.getManualOrderState(cfg);
        manualState.root = normalizeManualOrderTokens(manualState.root, cfg, '');

        var validParentIds = new Set();
        var helpers = rt.getHelpers();
        if (helpers && typeof helpers.flattenIds === 'function') {
            helpers.flattenIds(cfg.workspaces || []).forEach(function (workspaceId) {
                validParentIds.add(String(workspaceId));
            });
        } else {
            rt.getRootWorkspaces(cfg).forEach(function (workspace) {
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
        return cfg ? cfg.sidebarOrderMode : rt.ORDER_MODE_AUTO;
    }

    function setSidebarOrderMode(nextMode, configRef) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return rt.ORDER_MODE_AUTO;
        cfg.sidebarOrderMode = rt.normalizeOrderMode(nextMode);
        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL) {
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

        if (cfg.sidebarOrderMode === rt.ORDER_MODE_MANUAL) {
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

        var sourceToken = rt.makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var state = rt.getManualOrderState(cfg);
        var changed = false;

        function removeFromParent(parentId) {
            var key = rt.getManualOrderKey(parentId);
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

        var explicitParentId = rt.normalizeWorkspaceId(parentWorkspaceId);
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

        cfg.sidebarOrderMode = rt.ORDER_MODE_MANUAL;
        var sourceToken = rt.makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var targetParentId = rt.normalizeWorkspaceId(parentWorkspaceId);
        var actualTokens = new Set(buildAutomaticEntriesForParent(targetParentId, cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        removeManualOrderEntry(entryType, entryId, cfg);
        var nextTokens = getManualOrderTokensForParent(targetParentId, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var beforeToken = rt.makeOrderToken(beforeEntryType, beforeEntryId);
        var insertIndex = beforeToken ? nextTokens.indexOf(beforeToken) : -1;
        if (insertIndex === -1) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        setManualOrderTokensForParent(targetParentId, nextTokens, cfg);
        return true;
    }

    function placeManualOrderEntryAfter(entryType, entryId, afterEntryType, afterEntryId, configRef, parentWorkspaceId) {
        var cfg = ensureConfigDefaults(configRef);
        if (!cfg) return false;

        cfg.sidebarOrderMode = rt.ORDER_MODE_MANUAL;
        var sourceToken = rt.makeOrderToken(entryType, entryId);
        if (!sourceToken) return false;

        var targetParentId = rt.normalizeWorkspaceId(parentWorkspaceId);
        var actualTokens = new Set(buildAutomaticEntriesForParent(targetParentId, cfg).map(entryToToken).filter(Boolean));
        if (!actualTokens.has(sourceToken)) return false;

        removeManualOrderEntry(entryType, entryId, cfg);
        var nextTokens = getManualOrderTokensForParent(targetParentId, cfg).filter(function (token) {
            return token !== sourceToken;
        });
        var afterToken = rt.makeOrderToken(afterEntryType, afterEntryId);
        var insertIndex = afterToken ? nextTokens.indexOf(afterToken) + 1 : -1;
        if (insertIndex <= 0) insertIndex = nextTokens.length;
        nextTokens.splice(insertIndex, 0, sourceToken);
        setManualOrderTokensForParent(targetParentId, nextTokens, cfg);
        return true;
    }

    Object.assign(rt, {
        buildAutomaticEntriesForParent: buildAutomaticEntriesForParent,
        entryToToken: entryToToken,
        normalizeManualOrderTokens: normalizeManualOrderTokens,
        getManualOrderTokensForParent: getManualOrderTokensForParent,
        setManualOrderTokensForParent: setManualOrderTokensForParent,
        ensureConfigDefaults: ensureConfigDefaults,
        getVisibleBuckets: getVisibleBuckets,
        getSidebarOrderMode: getSidebarOrderMode,
        setSidebarOrderMode: setSidebarOrderMode,
        resetManualOrder: resetManualOrder,
        getOrderedEntries: getOrderedEntries,
        getOrderedRootEntries: getOrderedRootEntries,
        getManualOrderEntries: getManualOrderEntries,
        removeManualOrderEntry: removeManualOrderEntry,
        placeManualOrderEntry: placeManualOrderEntry,
        placeManualOrderEntryAfter: placeManualOrderEntryAfter
    });

    rt.orderReady = true;
})();
