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
        return ['auto', 'tab-current', 'tab-branch', 'card', 'all'].includes(value) ? value : 'auto';
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
                if (!child?.id || child.hiddenInParent) return;
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

    function getSelectedScope() {
        const cfg = getConfig() || {};
        const mode = getScopeMode();
        const activeWorkspace = String(cfg.activeWorkspace || 'main');
        if (mode === 'all' && isWholeDatapackAllowed()) {
            return { scope: 'all', workspaceId: '', workspaceIds: [], label: 'Whole datapack', source: 'manual-all-unidex' };
        }
        if (mode === 'card') {
            const workspaceId = String(cfg.geminiContextSelectedCardWorkspaceId || activeWorkspace);
            return {
                scope: 'card',
                workspaceId,
                workspaceIds: [workspaceId],
                categoryName: String(cfg.geminiContextSelectedCardCategory || ''),
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
