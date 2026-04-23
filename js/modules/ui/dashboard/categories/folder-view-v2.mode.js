window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { cloneGhostFilterChain } = shared;
    window.EveFolderViewV2._restoreTimers = window.EveFolderViewV2._restoreTimers || {};

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
        const key = `${workspaceId}::${categoryName}`;
        const restoreTimers = window.EveFolderViewV2._restoreTimers || {};
        if (restoreTimers[key]) {
            clearTimeout(restoreTimers[key]);
            delete restoreTimers[key];
        }
        if (!window.eveState?.config?.activeManhwaFolders) return;
        const targetFolderId = window.eveState.config.activeManhwaFolders[key];
        if (!targetFolderId) return;

        restoreTimers[key] = setTimeout(() => {
            if (restoreTimers[key]) delete restoreTimers[key];
            const latestTargetFolderId = window.eveState?.config?.activeManhwaFolders?.[key];
            if (String(latestTargetFolderId || '') !== String(targetFolderId || '')) return;
            window.EveFolderViewV2.enterFolder(null, categoryName, targetFolderId, workspaceId, {
                preservePageScroll: false,
                source: 'auto-restore'
            });
        }, 50);
    };

    window.EveFolderViewV2.queueRestoreActiveFolderState = function (workspaceId, categoryName, options) {
        const resolvedWorkspaceId = String(workspaceId || 'main').trim() || 'main';
        const resolvedCategoryName = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const queueOptions = options && typeof options === 'object' ? options : {};
        const key = `${resolvedWorkspaceId}::${resolvedCategoryName}`;
        const restoreTimers = window.EveFolderViewV2._restoreTimers || {};
        const delayMs = Math.max(0, Number(queueOptions.delayMs || 0) || 0);

        if (restoreTimers[key]) {
            clearTimeout(restoreTimers[key]);
            delete restoreTimers[key];
        }

        const runRestore = function () {
            if (queueOptions.visibleOnly) {
                const card = document.querySelector(`.category-card[data-card-category="${CSS.escape(resolvedCategoryName)}"][data-card-workspace="${CSS.escape(resolvedWorkspaceId)}"]`);
                if (!card || !card.isConnected) return;
            }
            window.EveFolderViewV2.restoreActiveFolderState(resolvedWorkspaceId, resolvedCategoryName);
        };

        restoreTimers[key] = setTimeout(function () {
            if (restoreTimers[key]) delete restoreTimers[key];
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () {
                    setTimeout(runRestore, delayMs);
                });
            } else {
                setTimeout(runRestore, delayMs);
            }
        }, 0);
    };
})();
