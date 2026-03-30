window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { cloneGhostFilterChain } = shared;

    window.EveFolderViewV2.isManhwaModeEnabled = function (workspaceId, categoryName) {
        if (!window.eveState?.config) return true;
        if (typeof window.eveState.config.cardFolderViewModes !== 'object') return true;
        const key = `${workspaceId}::${categoryName}`;
        if (window.eveState.config.cardFolderViewModes.hasOwnProperty(key)) {
            return !!window.eveState.config.cardFolderViewModes[key];
        }
        return true;
    };

    window.EveFolderViewV2.isGhostFolderEnabled = function (workspaceId, categoryName, ghostType) {
        if (!window.eveState?.config) return true;
        if (typeof window.eveState.config.cardGhostFolders !== 'object') return true;
        const key = `${workspaceId}::${categoryName}::${ghostType}`;
        if (window.eveState.config.cardGhostFolders.hasOwnProperty(key)) {
            return !!window.eveState.config.cardGhostFolders[key];
        }
        return true;
    };

    window.EveFolderViewV2.toggleGhostFolder = function (workspaceId, categoryName, ghostType) {
        if (!window.eveState) return;
        if (!window.eveState.config.cardGhostFolders || typeof window.eveState.config.cardGhostFolders !== 'object') {
            window.eveState.config.cardGhostFolders = {};
        }
        const key = `${workspaceId}::${categoryName}::${ghostType}`;
        const current = window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, ghostType);
        window.eveState.config.cardGhostFolders[key] = !current;

        if (typeof window.saveConfig === 'function') window.saveConfig();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    window.EveFolderViewV2.toggleManhwaMode = function (workspaceId, categoryName) {
        if (!window.eveState) return;
        if (!window.eveState.config.cardFolderViewModes || typeof window.eveState.config.cardFolderViewModes !== 'object') {
            window.eveState.config.cardFolderViewModes = {};
        }
        const key = `${workspaceId}::${categoryName}`;
        const current = window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName);
        window.eveState.config.cardFolderViewModes[key] = !current;

        if (window.eveState.config.activeManhwaFolders) delete window.eveState.config.activeManhwaFolders[key];
        if (window.eveState.config.activeManhwaFolderChains) delete window.eveState.config.activeManhwaFolderChains[key];
        if (window.eveState.config.activeManhwaScopeRoots) delete window.eveState.config.activeManhwaScopeRoots[key];

        if (typeof window.saveConfig === 'function') window.saveConfig();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    window.EveFolderViewV2.saveActiveFolderState = function (workspaceId, categoryName, folderId, ghostChain, scopeRootId) {
        if (!window.eveState?.config) return;
        if (!window.eveState.config.activeManhwaFolders) window.eveState.config.activeManhwaFolders = {};
        if (!window.eveState.config.activeManhwaFolderChains || typeof window.eveState.config.activeManhwaFolderChains !== 'object') {
            window.eveState.config.activeManhwaFolderChains = {};
        }
        if (!window.eveState.config.activeManhwaScopeRoots || typeof window.eveState.config.activeManhwaScopeRoots !== 'object') {
            window.eveState.config.activeManhwaScopeRoots = {};
        }
        const key = `${workspaceId}::${categoryName}`;
        if (folderId) window.eveState.config.activeManhwaFolders[key] = folderId;
        else delete window.eveState.config.activeManhwaFolders[key];

        const normalizedChain = cloneGhostFilterChain(ghostChain);
        if (normalizedChain) window.eveState.config.activeManhwaFolderChains[key] = normalizedChain;
        else delete window.eveState.config.activeManhwaFolderChains[key];

        const normalizedScopeRootId = scopeRootId ? String(scopeRootId).trim() : '';
        if (normalizedScopeRootId) window.eveState.config.activeManhwaScopeRoots[key] = normalizedScopeRootId;
        else delete window.eveState.config.activeManhwaScopeRoots[key];

        if (typeof window.saveConfig === 'function') window.saveConfig();
    };

    window.EveFolderViewV2.restoreActiveFolderState = function (workspaceId, categoryName) {
        if (!window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName)) return;
        if (!window.eveState?.config?.activeManhwaFolders) return;
        const key = `${workspaceId}::${categoryName}`;
        const targetFolderId = window.eveState.config.activeManhwaFolders[key];
        if (targetFolderId) {
            setTimeout(() => {
                window.EveFolderViewV2.enterFolder(null, categoryName, targetFolderId, workspaceId);
            }, 50);
        }
    };
})();
