window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (api.dropActionsReady) return;

    const shared = ns._shared || {};
    const {
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        getLiveLinks
    } = shared;
    const {
        getFolderById,
        deleteFolder,
        moveFolder,
        transferFolderToCategory,
        toggleToolbarExpanded
    } = api;

    if (!normalizeWorkspaceId || !normalizeCategoryName || !normalizeFolderId || !moveFolder || !transferFolderToCategory) {
        console.warn('[EveBookmarkFolders] Drop helpers missing; drop actions not initialized.');
        return;
    }

    function getActiveCategoryContext(categoryName) {
        return normalizeCategoryName(categoryName || window.currentCategoryCtx || window.ctxCatName || 'Unsorted');
    }

    function parseDragPayload(dataTransfer) {
        const rawJson = dataTransfer?.getData('application/json') || dataTransfer?.getData('text/plain') || '';
        let dragIds = [];
        try {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed?.ids)) {
                dragIds = parsed.ids.map((item) => String(item));
            } else if (parsed !== null && parsed !== undefined && rawJson) {
                dragIds = [String(parsed)];
            }
        } catch (error) {
            if (rawJson) dragIds = [String(rawJson)];
        }
        return dragIds.filter(Boolean);
    }

    function moveLinksToFolderTarget(linkIds, workspaceId, categoryName, folderId, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const normalizedFolderId = normalizeFolderId(folderId);
        const validFolderId = normalizedFolderId && getFolderById(targetWorkspaceId, targetCategoryName, normalizedFolderId)
            ? normalizedFolderId
            : '';

        const liveLinks = typeof getLiveLinks === 'function' ? getLiveLinks() : [];
        if (!Array.isArray(liveLinks) || !linkIds.length) return false;
        let movedAny = false;
        const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;

        liveLinks.forEach((link) => {
            if (!linkIds.includes(String(link?.id))) return;
            const nextWorkspaceId = targetWorkspaceId;
            const nextCategoryName = targetCategoryName;
            const currentFolderId = normalizeFolderId(link?.folderId);
            const alreadyAtTarget = normalizeWorkspaceId(link?.workspace) === nextWorkspaceId
                && normalizeCategoryName(link?.category) === nextCategoryName
                && currentFolderId === validFolderId;
            if (alreadyAtTarget) return;

            link.workspace = nextWorkspaceId;
            link.category = nextCategoryName;
            if (validFolderId) link.folderId = validFolderId;
            else delete link.folderId;
            if (typeof syncLinked === 'function') syncLinked(link.id);
            movedAny = true;
        });

        if (movedAny && options.persist !== false && typeof saveData === 'function') {
            saveData({
                skipRender: !!options.skipRender,
                skipSuggestions: !!options.skipSuggestions,
                forceRender: true
            });
        }

        return movedAny;
    }

    window.openBookmarkFolders = function (categoryName) {
        if (typeof openCategorySettings === 'function') {
            openCategorySettings(getActiveCategoryContext(categoryName), 'folders');
        }
    };

    window.toggleBookmarkFolderToolbar = function (categoryName, workspaceId) {
        toggleToolbarExpanded(workspaceId, getActiveCategoryContext(categoryName));
    };

    window.deleteBookmarkFolderPrompt = async function (categoryName, folderId, workspaceId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        const resolvedWorkspace = normalizeWorkspaceId(workspaceId);
        const target = getFolderById(resolvedWorkspace, resolvedCategory, folderId);
        if (!target) return;
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`)
            : window.confirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`);
        if (!confirmed) return;
        if (!deleteFolder({
            workspaceId: resolvedWorkspace,
            categoryName: resolvedCategory,
            folderId
        })) return;
        if (typeof showToast === 'function') showToast(`Folder "${target.name}" removed`, 'success');
        if (typeof window.renderCategoryFolderManager === 'function') {
            window.renderCategoryFolderManager();
        }
    };

    window.openAddModalForFolder = function (categoryName, folderId, workspaceId) {
        if (typeof openAddModal === 'function') {
            openAddModal({
                category: getActiveCategoryContext(categoryName),
                folderId: normalizeFolderId(folderId),
                workspaceId: workspaceId ? String(workspaceId).trim() : ''
            });
        }
    };

    window.promptCreateBookmarkFolder = function (categoryName, parentId, workspaceId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        if (typeof window.openFolderCreator === 'function') {
            window.openFolderCreator(resolvedCategory, parentId, workspaceId);
        }
    };

    window.promptRenameBookmarkFolder = function (categoryName, folderId, workspaceId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        if (typeof window.openFolderRenamer === 'function') {
            window.openFolderRenamer(resolvedCategory, folderId, workspaceId);
        }
    };

    window.moveBookmarksToFolderDrop = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const rawData = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('application/json');
        if (!rawData) return;

        let payload = null;
        try {
            payload = JSON.parse(rawData);
        } catch (error) {
            // Not a JSON payload
        }
        const detachedApi = window.EveConstellationMap?._detached;

        if (payload && payload.type === 'detached-link' && payload.entryId && payload.linkId) {
            const restored = detachedApi?.restoreDetachedLinks?.(
                payload.entryId,
                [payload.linkId],
                {
                    workspaceId,
                    categoryName: getActiveCategoryContext(categoryName),
                    folderId
                }
            );
            if (restored && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        if (payload && payload.type === 'detached-folder' && payload.entryId) {
            const restored = detachedApi?.restoreDetachedEntry?.(
                payload.entryId,
                {
                    workspaceId,
                    categoryName: getActiveCategoryContext(categoryName),
                    folderId,
                    targetParentId: folderId
                }
            );
            if (restored && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        if (payload && payload.type === 'folder' && payload.id) {
            const folderIdToMove = payload.id;
            const targetFolderId = normalizeFolderId(folderId);
            if (folderIdToMove === targetFolderId) return;

            const isCrossCard = (payload.sourceWorkspace && payload.sourceWorkspace !== workspaceId)
                || (payload.sourceCategory && payload.sourceCategory !== categoryName);

            if (isCrossCard) {
                if (!payload.sourceWorkspace || !payload.sourceCategory) {
                    console.warn('[moveBookmarksToFolderDrop] Cross-card transfer aborted: Missing source metadata.', payload);
                    return;
                }
                transferFolderToCategory(
                    folderIdToMove,
                    payload.sourceWorkspace,
                    payload.sourceCategory,
                    workspaceId,
                    categoryName,
                    targetFolderId
                );
            } else {
                moveFolder(workspaceId, categoryName, folderIdToMove, targetFolderId);
            }

            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        const linkIds = parseDragPayload(event?.dataTransfer);
        if (!linkIds.length) return;
        moveLinksToFolderTarget(linkIds, workspaceId, getActiveCategoryContext(categoryName), folderId);
    };

    Object.assign(api, {
        moveLinksToFolderTarget
    });

    api.dropActionsReady = true;
})(window.EveBookmarkFolders);
