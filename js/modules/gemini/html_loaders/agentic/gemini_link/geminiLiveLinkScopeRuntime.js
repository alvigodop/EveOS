window.GeminiLiveLinkScopeRuntime = window.GeminiLiveLinkScopeRuntime || {};

(function () {
    if (window.GeminiLiveLinkScopeRuntime.ready) return;

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return window.config || null;
    }

    function save() {
        if (typeof saveConfig === 'function') saveConfig();
    }

    function normalizeScopeMode(mode) {
        const value = String(mode || '').toLowerCase();
        if (value === 'tab') return 'tab-branch';
        // 'group' must be in this allowlist or the "Current Group" dropdown option silently
        // normalizes to 'auto' and the manual group branch below never runs.
        return ['auto', 'tab-current', 'tab-branch', 'group', 'card', 'all'].includes(value) ? value : 'auto';
    }

    function isWholeDatapackAllowed() {
        const cfg = getConfig() || {};
        const viewMode = String(cfg.viewMode || '').toLowerCase();
        const stage = String(cfg.unidexStage || '').toLowerCase();
        return viewMode === 'unidex' && (!stage || ['tabs', 'global', 'overview'].includes(stage));
    }

    function getScopeMode() {
        const stored = normalizeScopeMode(getConfig()?.geminiContextScopeMode || 'auto');
        return stored === 'all' && !isWholeDatapackAllowed() ? 'auto' : stored;
    }

    function isDataStreamEnabled() {
        return !!getConfig()?.geminiContextDataStreamEnabled;
    }

    function setScopeMode(mode) {
        let normalized = normalizeScopeMode(mode);
        if (normalized === 'all' && !isWholeDatapackAllowed()) normalized = 'auto';
        const cfg = getConfig();
        if (cfg) {
            cfg.geminiContextScopeMode = normalized;
            save();
        }
        return normalized;
    }

    function setSelectedCard(value) {
        const cfg = getConfig();
        const [workspaceId, categoryName] = String(value || '').split('::');
        if (cfg) {
            cfg.geminiContextSelectedCardWorkspaceId = workspaceId || '';
            cfg.geminiContextSelectedCardCategory = categoryName || '';
            save();
        }
    }

    function setDataStreamEnabled(enabled) {
        const cfg = getConfig();
        const value = !!enabled;
        if (cfg) {
            cfg.geminiContextDataStreamEnabled = value;
            cfg.geminiContextDataStreamSilent = true;
            save();
        }
        // Let stream-aware surfaces (Agent Space) react instantly, and stamp the lifecycle
        // into the insight log so the viewer timeline shows when streaming started/stopped.
        try {
            window.dispatchEvent(new CustomEvent('eve:datastream-toggled', { detail: { enabled: value } }));
        } catch { /* best effort */ }
        const sync = window.EveDataStore?.ModularSync || window.EveDataStore?._modularSync;
        sync?.recordDataStreamMarker?.(value ? 'Data Stream enabled' : 'Data Stream disabled');
        return value;
    }

    function findWorkspace(workspaceId, nodes) {
        const target = String(workspaceId || '').toLowerCase();
        for (const workspace of Array.isArray(nodes) ? nodes : []) {
            if (String(workspace?.id || '').toLowerCase() === target) return workspace;
            const nested = findWorkspace(workspaceId, workspace?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function collectBranchIds(workspaceId) {
        const cfg = getConfig() || {};
        const root = findWorkspace(workspaceId, cfg.workspaces);
        const ids = new Set([String(workspaceId || cfg.activeWorkspace || 'main')]);
        function visit(node) {
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach((child) => {
                // Inactive tabs are hidden state on the site — not eligible as context.
                if (!child?.id || child.hiddenInParent || child.inactive === true) return;
                ids.add(String(child.id));
                if (!child.hideSubTabs) visit(child);
            });
        }
        if (root && !root.hideSubTabs) visit(root);
        return Array.from(ids).filter(Boolean);
    }

    function workspaceLabel(workspaceId) {
        const cfg = getConfig() || {};
        const workspace = findWorkspace(workspaceId, cfg.workspaces);
        return String(workspace?.name || workspaceId || 'Main');
    }

    function getCardOptionScope() {
        const cfg = getConfig() || {};
        const activeWorkspace = String(cfg.activeWorkspace || 'main');
        return isWholeDatapackAllowed()
            ? { scope: 'all', workspaceId: '', workspaceIds: [], label: 'Unidex visible datapack', source: 'card-options-unidex' }
            : { scope: 'workspace', workspaceId: activeWorkspace, workspaceIds: collectBranchIds(activeWorkspace), label: 'Current tab branch cards', source: 'card-options-branch' };
    }

    function getWorkspaceGroupId(workspaceId, nodes) {
        const target = String(workspaceId || '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (String(node?.id || '').toLowerCase() === target) return String(node?.groupId || '');
            const nested = getWorkspaceGroupId(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return '';
    }

    function getSelectedScope() {
        const cfg = getConfig() || {};
        const mode = getScopeMode();
        const activeWorkspace = String(cfg.activeWorkspace || 'main');
        if (mode === 'all' && isWholeDatapackAllowed()) {
            // Explicit visible set: hidden groups and inactive tabs are not part of the
            // "whole datapack" the site currently shows.
            const visibleIds = window.EveDataStore?._modularSync?.getVisibleContextWorkspaceIds?.() || [];
            return { scope: 'all', workspaceId: '', workspaceIds: visibleIds, label: 'Whole datapack', source: 'manual-all-unidex' };
        }
        if (mode === 'group') {
            const groupId = String(cfg.groupOverviewId || getWorkspaceGroupId(activeWorkspace, cfg.workspaces) || '').trim();
            const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
            const ids = new Set();
            let groupName = '';
            if (groupId && typeof groupsApi?.getGroupRoots === 'function') {
                (groupsApi.getGroupRoots(groupId, cfg) || []).forEach((root) => {
                    if (!root?.id) return;
                    collectBranchIds(root.id).forEach((id) => ids.add(id));
                });
                const group = typeof groupsApi.findGroupById === 'function' ? groupsApi.findGroupById(groupId, cfg) : null;
                groupName = group?.name || '';
            }
            const workspaceIds = Array.from(ids);
            if (!workspaceIds.length) {
                // No resolvable group (active tab is ungrouped and no overview is open): fall
                // back honestly to the current tab instead of shipping a mislabeled scope.
                return {
                    scope: 'workspace',
                    workspaceId: activeWorkspace,
                    workspaceIds: collectBranchIds(activeWorkspace),
                    label: 'Current tab branch (no group here)',
                    source: 'manual-group-fallback'
                };
            }
            return {
                scope: 'group',
                workspaceId: activeWorkspace,
                workspaceIds,
                categoryName: '',
                label: groupName ? `Group: ${groupName}` : 'Current group',
                source: 'manual-group'
            };
        }
        if (mode === 'card') {
            const workspaceId = String(cfg.geminiContextSelectedCardWorkspaceId || activeWorkspace);
            const categoryName = String(cfg.geminiContextSelectedCardCategory || '');
            if (!categoryName) {
                // No card picked: both context builders treat an empty categoryName as "no card
                // filter" and ship the whole tab — so label it honestly instead of "Specific card".
                return {
                    scope: 'workspace',
                    workspaceId,
                    workspaceIds: [workspaceId],
                    label: 'Current tab only (no card selected)',
                    source: 'manual-card-fallback'
                };
            }
            return {
                scope: 'card',
                workspaceId,
                workspaceIds: [workspaceId],
                categoryName,
                label: 'Specific card',
                source: 'manual-card'
            };
        }
        if (mode === 'tab-current') {
            return {
                scope: 'workspace',
                workspaceId: activeWorkspace,
                workspaceIds: [activeWorkspace],
                label: 'Current tab only',
                source: 'manual-tab-current'
            };
        }
        if (mode === 'tab-branch') {
            return {
                scope: 'workspace',
                workspaceId: activeWorkspace,
                workspaceIds: collectBranchIds(activeWorkspace),
                label: 'Current tab + sub tabs',
                source: 'manual-tab-branch'
            };
        }
        return window.EveDataStore?.ModularSync?.getCurrentGeminiContextScope?.()
            || window.EveDataStore?._modularSync?.getCurrentGeminiContextScope?.()
            || { scope: 'workspace', workspaceId: activeWorkspace, workspaceIds: collectBranchIds(activeWorkspace), label: workspaceLabel(activeWorkspace), source: 'auto' };
    }

    Object.assign(window.GeminiLiveLinkScopeRuntime, {
        ready: true,
        getScopeMode,
        isDataStreamEnabled,
        setScopeMode,
        setSelectedCard,
        setDataStreamEnabled,
        isWholeDatapackAllowed,
        collectBranchIds,
        getCardOptionScope,
        getSelectedScope
    });
})();
