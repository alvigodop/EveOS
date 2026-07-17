// --- Modular State Sync API: Gemini Context Scope ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.contextScopeApi) return;
    const CONTEXT_MODE_PROFILES = {
        brief: { limit: 10 },
        summary: { limit: 30 },
        deep: { limit: 60 },
        full: { limit: 90 }
    };

    function normalizeContextMode(mode) {
        const value = String(mode || '').trim().toLowerCase();
        if (value === 'json' || value === 'complete') return 'full';
        return CONTEXT_MODE_PROFILES[value] ? value : 'summary';
    }

    function modeLimit(mode, fallback) {
        const profile = CONTEXT_MODE_PROFILES[normalizeContextMode(mode)] || CONTEXT_MODE_PROFILES.summary;
        return Math.max(5, Math.min(200, Number(fallback) || profile.limit));
    }

    function getRuntimeConfigForContext() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : null)
            || null;
    }

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function getConfigForContextManifest(payload) {
        return getRuntimeConfigForContext()
            || payload?.bookmarks?.config
            || {};
    }

    function normalizeContextScope(scope) {
        const value = String(scope || '').trim().toLowerCase();
        if (value === 'group') return 'group';
        if (value === 'all' || value === 'store' || value === 'datapack') return 'all';
        if (value === 'card' || value === 'category') return 'card';
        return 'workspace';
    }

    function getContextWorkspaces() {
        const cfg = getRuntimeConfigForContext() || {};
        return Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
    }

    function findContextWorkspace(workspaceId, nodes = getContextWorkspaces()) {
        const target = text(workspaceId, '').toLowerCase();
        if (!target) return null;
        for (const workspace of Array.isArray(nodes) ? nodes : []) {
            if (text(workspace?.id, '').toLowerCase() === target) return workspace;
            const nested = findContextWorkspace(workspaceId, workspace?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function collectContextWorkspaceBranchIds(workspaceId) {
        const root = findContextWorkspace(workspaceId);
        const ids = new Set([text(workspaceId, 'main')]);
        function visit(node) {
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach((child) => {
                // Inactive tabs are hidden state on the site — they are not eligible as context.
                if (!child?.id || child.hiddenInParent || child.inactive === true) return;
                ids.add(text(child.id, ''));
                if (!child.hideSubTabs) visit(child);
            });
        }
        if (root && !root.hideSubTabs) visit(root);
        return Array.from(ids).filter(Boolean);
    }

    // Context must match what the site currently SHOWS: inactive tabs and root tabs living in
    // hidden sidebar groups are invisible on the site, so they are not eligible to be sent.
    function isWorkspaceContextEligible(rootNode, cfg) {
        if (!rootNode || rootNode.inactive === true) return false;
        const groupId = text(rootNode.groupId, '');
        if (!groupId) return true;
        const groups = Array.isArray(cfg?.sidebarGroups) ? cfg.sidebarGroups : [];
        const group = groups.find((item) => String(item?.id || '') === groupId);
        return !(group && group.hidden === true);
    }

    function getVisibleContextWorkspaceIds() {
        const cfg = getRuntimeConfigForContext() || {};
        const ids = [];
        (Array.isArray(cfg.workspaces) ? cfg.workspaces : []).forEach((root) => {
            if (!isWorkspaceContextEligible(root, cfg)) return;
            (function visit(node) {
                if (!node?.id || node.inactive === true) return;
                ids.push(String(node.id));
                (Array.isArray(node.subTabs) ? node.subTabs : []).forEach(visit);
            })(root);
        });
        return ids;
    }

    function getGroupOverviewContextScope(cfg) {
        const groupId = text(cfg?.groupOverviewId, '');
        const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
        if (!groupId || typeof groupsApi?.getGroupRoots !== 'function') return null;
        const ids = new Set();
        (groupsApi.getGroupRoots(groupId, cfg) || []).forEach((root) => {
            if (!root?.id) return;
            collectContextWorkspaceBranchIds(root.id).forEach((id) => ids.add(id));
        });
        const group = typeof groupsApi.findGroupById === 'function' ? groupsApi.findGroupById(groupId, cfg) : null;
        const groupName = text(group?.name, '');
        return ids.size ? {
            scope: 'all',
            workspaceId: Array.from(ids)[0] || '',
            workspaceIds: Array.from(ids),
            categoryName: '',
            // The label is what the model sees as "where the user is" — a bare group name here
            // reads as a normal tab, so classify the surface explicitly.
            label: groupName
                ? 'Group tab "' + groupName + '" (a group of tabs, not a single tab)'
                : 'Group tab (a group of tabs, not a single tab)',
            source: 'group-overview'
        } : null;
    }

    // Depth-aware tab classification for the Gemini agent, mirroring the sidebar's Sub^N
    // notation: depth 0 is a "root tab", depth 1 a "sub tab", deeper levels "sub^N tab" —
    // always with the full parent path so the agent knows exactly where the user is.
    // Shortcut tabs are annotated with their linked targets (real tabs).
    function describeWorkspaceTabPath(workspaceId) {
        const cfg = getRuntimeConfigForContext();
        const roots = Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
        const helpers = window.EveWorkspaceHelpers;
        const target = text(workspaceId, '');
        const node = helpers?.findById ? helpers.findById(roots, target) : null;
        if (!node) return 'tab "' + target + '"';
        const chain = [node];
        let parent = typeof helpers?.findParent === 'function' ? helpers.findParent(roots, node.id) : null;
        while (parent) {
            chain.unshift(parent);
            parent = helpers.findParent(roots, parent.id);
        }
        const depth = chain.length - 1;
        const name = text(node.name, node.id);

        let tabClass = depth === 0 ? 'root tab' : (depth === 1 ? 'sub tab' : 'sub^' + depth + ' tab');
        if (text(node.linkedTo, '')) {
            const targetId = text(node.linkedTo, '');
            const targetNode = helpers?.findById ? helpers.findById(roots, targetId) : null;
            const targetName = targetNode ? text(targetNode.name, targetNode.id) : targetId;
            tabClass = 'shortcut ' + tabClass + ' (pointing to tab "' + targetName + '")';
        }

        const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
        const rootGroupId = text(chain[0]?.groupId, '');
        const group = rootGroupId && typeof groupsApi?.findGroupById === 'function'
            ? groupsApi.findGroupById(rootGroupId, cfg)
            : null;
        const groupName = text(group?.name, '');

        if (depth === 0) {
            return tabClass + ' "' + name + '"' + (groupName ? ' (inside group "' + groupName + '")' : '');
        }

        const pathText = chain.map((entry) => {
            const entryName = text(entry?.name, entry?.id);
            if (text(entry?.linkedTo, '')) {
                const targetId = text(entry.linkedTo, '');
                const targetNode = helpers?.findById ? helpers.findById(roots, targetId) : null;
                const targetName = targetNode ? text(targetNode.name, targetNode.id) : targetId;
                return entryName + ' [shortcut to "' + targetName + '"]';
            }
            return entryName;
        }).join(' > ');

        const groupNote = groupName ? '; root tab is inside group "' + groupName + '"' : '';
        return tabClass + ' "' + name + '" (path: ' + pathText + groupNote + ')';
    }

    function getCurrentGeminiContextScope() {
        const cfg = getRuntimeConfigForContext();
        const activeWorkspace = String(cfg.activeWorkspace || 'main').trim() || 'main';
        const groupScope = getGroupOverviewContextScope(cfg);
        if (groupScope) return groupScope;
        const isUnidex = String(cfg.viewMode || '').toLowerCase() === 'unidex';
        if (isUnidex) {
            const stage = String(cfg.unidexStage || 'tabs').toLowerCase();
            const selectedWorkspace = String(cfg.unidexSelectedWorkspaceId || activeWorkspace).trim() || activeWorkspace;
            const selectedCategory = String(cfg.unidexSelectedCategory || '').trim();
            if (stage === 'entries' && selectedCategory) {
                return {
                    scope: 'card',
                    workspaceId: selectedWorkspace,
                    categoryName: selectedCategory,
                    label: 'card "' + selectedCategory + '" in ' + describeWorkspaceTabPath(selectedWorkspace),
                    source: 'unidex-card'
                };
            }
            if (stage === 'cards' && selectedWorkspace) {
                return {
                    scope: 'workspace',
                    workspaceId: selectedWorkspace,
                    workspaceIds: collectContextWorkspaceBranchIds(selectedWorkspace),
                    categoryName: '',
                    label: describeWorkspaceTabPath(selectedWorkspace),
                    source: 'unidex-workspace'
                };
            }
            return {
                scope: 'all',
                workspaceId: '',
                // Explicit visible set: hidden groups and inactive tabs stay out of the
                // whole-datapack scope, matching what Unidex actually shows.
                workspaceIds: getVisibleContextWorkspaceIds(),
                categoryName: '',
                label: 'Whole datapack',
                source: 'unidex-global'
            };
        }
        return {
            scope: 'workspace',
            workspaceId: activeWorkspace,
            workspaceIds: collectContextWorkspaceBranchIds(activeWorkspace),
            categoryName: '',
            label: describeWorkspaceTabPath(activeWorkspace),
            source: 'search-monitor'
        };
    }
    ns.contextScopeApi = Object.freeze({
        normalizeContextMode,
        modeLimit,
        getRuntimeConfigForContext,
        text,
        getConfigForContextManifest,
        normalizeContextScope,
        getCurrentGeminiContextScope,
        describeWorkspaceTabPath,
        getVisibleContextWorkspaceIds,
        isWorkspaceContextEligible
    });
})();