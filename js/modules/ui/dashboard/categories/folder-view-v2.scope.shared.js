window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const ns = window.EveFolderViewV2;
    const shared = ns._shared = ns._shared || {};
    if (shared.scopeSharedReady) return;

    function escapeCardHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCardJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function buildScopedFolderViewKey(workspaceId, categoryName) {
        return `${String(workspaceId || 'main').trim() || 'main'}::${String(categoryName || '').trim() || 'Unsorted'}`;
    }

    function cloneGhostFilterChain(chain) {
        if (!Array.isArray(chain)) return null;
        const normalized = chain
            .map((item) => ({
                dimension: String(item?.dimension || '').trim(),
                valueKey: String(item?.valueKey || '').trim().toLowerCase(),
                label: String(item?.label || '').trim()
            }))
            .filter((item) => item.dimension && item.valueKey);
        return normalized.length ? normalized : null;
    }

    ns._viewModelCache = ns._viewModelCache || {};
    ns._headerActionState = ns._headerActionState || {};

    ns.setCachedViewModel = function (workspaceId, categoryName, viewModel) {
        ns._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] = viewModel || null;
    };

    ns.getCachedViewModel = function (workspaceId, categoryName) {
        return ns._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)] || null;
    };

    ns.invalidateCachedViewModel = function (workspaceId, categoryName) {
        delete ns._viewModelCache[buildScopedFolderViewKey(workspaceId, categoryName)];
    };

    ns.invalidateAllCachedViewModels = function () {
        ns._viewModelCache = {};
    };

    function buildHeaderActionKey(workspaceId, categoryName, folderId) {
        return `${buildScopedFolderViewKey(workspaceId, categoryName)}::${String(folderId || '').trim() || '__root__'}`;
    }

    ns.isHeaderActionsExpanded = function (workspaceId, categoryName, folderId) {
        return !!ns._headerActionState[buildHeaderActionKey(workspaceId, categoryName, folderId)];
    };

    function rerenderActiveFolderView(workspaceId, categoryName) {
        const scopedKey = `${workspaceId}::${categoryName}`;
        const activeFolderId = String(window.eveState?.config?.activeManhwaFolders?.[scopedKey] || '').trim();
        if (activeFolderId) {
            ns.enterFolder(null, categoryName, activeFolderId, workspaceId);
            return;
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }

    ns.toggleHeaderActions = function (workspaceId, categoryName, folderId) {
        const key = buildHeaderActionKey(workspaceId, categoryName, folderId);
        ns._headerActionState[key] = !ns._headerActionState[key];
        rerenderActiveFolderView(workspaceId, categoryName);
    };

    Object.assign(shared, {
        escapeCardHtml,
        escapeCardJs,
        buildScopedFolderViewKey,
        cloneGhostFilterChain,
        rerenderActiveFolderView
    });

    shared.scopeSharedReady = true;
})();
