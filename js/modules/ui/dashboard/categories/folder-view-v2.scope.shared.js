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

    ns.buildHeaderActionTrayHtml = function (workspaceId, categoryName, folderId, isGhost) {
        const ws = escapeCardJs(workspaceId);
        const cat = escapeCardJs(categoryName);
        const fid = escapeCardJs(folderId);
        const safeWs = escapeCardHtml(workspaceId);
        const safeCat = escapeCardHtml(categoryName);
        const safeFid = escapeCardHtml(folderId);
        const editFolderButtonHtml = isGhost
            ? ''
            : `<button type="button" class="folder-breadcrumb-action-btn" title="Edit Current Folder" onclick="event.preventDefault(); event.stopPropagation(); if(typeof window.showFolderContextMenu === 'function') window.showFolderContextMenu(event, '${cat}', '${fid}', '${ws}');">&#9998; Edit Folder</button>`;
        return `<div class="folder-breadcrumb-action-tray">${editFolderButtonHtml}<button type="button" class="folder-breadcrumb-action-btn bulk-scope-btn" data-scope-category="${safeCat}" data-scope-workspace="${safeWs}" data-scope-folder-id="${safeFid}" title="Select Folder Subtree" onclick="event.preventDefault(); event.stopPropagation(); bulkToggleFolderScopeSelection('${cat}', '${ws}', '${fid}');">&#9744; Select Subtree</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Title Links" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkTitle('${cat}', '${fid}', '${ws}');">&#127991; Auto-Title</button><button type="button" class="folder-breadcrumb-action-btn" title="Auto-Add Library Entries" onclick="event.preventDefault(); event.stopPropagation(); window.EveFolderViewV2.openFolderBulkLibraryAuto('${cat}', '${fid}', '${ws}');">&#128214; Auto-Library</button></div>`;
    };

    function toggleHeaderActionsInPlace(workspaceId, categoryName, folderId, expanded) {
        const card = document.querySelector(`.category-card[data-card-workspace="${CSS.escape(String(workspaceId || ''))}"][data-card-category="${CSS.escape(String(categoryName || ''))}"]`);
        const breadcrumbs = card?.querySelector?.('.folder-breadcrumbs');
        if (!breadcrumbs) return false;
        const existingTray = card.querySelector('.folder-breadcrumb-action-tray');
        if (existingTray) existingTray.remove();
        const actionButton = breadcrumbs.querySelector('.folder-breadcrumb-icon-btn[title="Folder Actions"]');
        if (actionButton) actionButton.classList.toggle('active', !!expanded);
        if (expanded) {
            const viewModel = ns.getCachedViewModel(workspaceId, categoryName);
            const targetNode = viewModel?.nodes?.find((node) => String(node?.id || '') === String(folderId || ''));
            breadcrumbs.insertAdjacentHTML('afterend', ns.buildHeaderActionTrayHtml(workspaceId, categoryName, folderId, !!targetNode?.isGhost));
        }
        return true;
    }

    ns.toggleHeaderActions = function (workspaceId, categoryName, folderId) {
        const key = buildHeaderActionKey(workspaceId, categoryName, folderId);
        ns._headerActionState[key] = !ns._headerActionState[key];
        if (toggleHeaderActionsInPlace(workspaceId, categoryName, folderId, ns._headerActionState[key])) return;
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
