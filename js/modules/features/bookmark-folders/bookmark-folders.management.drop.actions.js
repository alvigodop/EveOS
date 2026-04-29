window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (api.dropActionsReady) return;

    const shared = ns._shared || {};
    const {
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        getLiveLinks,
        setLiveLinks,
        invalidateFolderViewModel
    } = shared;
    const {
        getFolderById,
        deleteFolder,
        moveFolder,
        transferFolderToCategory,
        toggleToolbarExpanded
    } = api;

    if (!normalizeWorkspaceId || !normalizeCategoryName || !normalizeFolderId || !getLiveLinks || !setLiveLinks || !moveFolder || !transferFolderToCategory) {
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

    const dropHoverTimers = new WeakMap();
    const dropHoverSelectors = [
        { selector: '.bookmark-folder-drop-target', className: 'bookmark-folder-drop-target' },
        { selector: '.folder-tile-drag-hover', className: 'folder-tile-drag-hover' },
        { selector: '.breadcrumb-drag-hover', className: 'breadcrumb-drag-hover' },
        { selector: '.v2-folder-root-container.active', className: 'active' },
        { selector: '.manhwa-frame.active', className: 'active' }
    ];

    window.setBookmarkFolderDropHover = function (event, className, active) {
        const target = event?.currentTarget;
        const hoverClass = String(className || '').trim();
        if (!target?.classList || !hoverClass) return;

        const existingTimer = dropHoverTimers.get(target);
        if (existingTimer) {
            clearTimeout(existingTimer);
            dropHoverTimers.delete(target);
        }

        if (active) {
            target.classList.add(hoverClass);
            return;
        }

        const relatedTarget = event?.relatedTarget;
        if (relatedTarget && target.contains && target.contains(relatedTarget)) return;

        const timer = setTimeout(() => {
            target.classList.remove(hoverClass);
            dropHoverTimers.delete(target);
        }, 80);
        dropHoverTimers.set(target, timer);
    };

    window.clearBookmarkFolderDropHovers = function () {
        dropHoverSelectors.forEach((entry) => {
            document.querySelectorAll(entry.selector).forEach((element) => {
                element.classList.remove(entry.className);
            });
        });
    };

    function addTouchedScope(scopes, workspaceId, categoryName) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        scopes.set(`${normalizedWorkspaceId}::${normalizedCategoryName}`, {
            workspaceId: normalizedWorkspaceId,
            categoryName: normalizedCategoryName
        });
    }

    function invalidateTouchedScopes(scopes) {
        if (!scopes || !scopes.size) return;
        scopes.forEach((scope) => {
            if (typeof invalidateFolderViewModel === 'function') {
                invalidateFolderViewModel(scope.workspaceId, scope.categoryName);
            } else if (window.EveFolderViewV2?.invalidateCachedViewModel) {
                window.EveFolderViewV2.invalidateCachedViewModel(scope.workspaceId, scope.categoryName);
            }
        });
    }

    function moveLinksToFolderTarget(linkIds, workspaceId, categoryName, folderId, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const normalizedFolderId = normalizeFolderId(folderId);
        const validFolderId = normalizedFolderId && getFolderById(targetWorkspaceId, targetCategoryName, normalizedFolderId)
            ? normalizedFolderId
            : '';

        const liveLinks = getLiveLinks();
        if (!linkIds.length) return false;
        let movedAny = false;
        const movedIds = [];
        const mergedIds = [];
        const removedIds = [];
        const touchedScopes = new Map();
        const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
        const mergeApi = window.EveBookmarkMerge;

        linkIds.forEach((linkId) => {
            const link = liveLinks.find((candidate) => String(candidate?.id) === String(linkId));
            if (!link) return;
            const nextWorkspaceId = targetWorkspaceId;
            const nextCategoryName = targetCategoryName;
            const currentFolderId = normalizeFolderId(link?.folderId);
            const sourceWorkspaceId = normalizeWorkspaceId(link?.workspace);
            const sourceCategoryName = normalizeCategoryName(link?.category);
            const alreadyAtTarget = sourceWorkspaceId === nextWorkspaceId
                && sourceCategoryName === nextCategoryName
                && currentFolderId === validFolderId;
            if (alreadyAtTarget) return;

            addTouchedScope(touchedScopes, sourceWorkspaceId, sourceCategoryName);

            if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                const result = mergeApi.moveOrMergeLinkToScope(link, {
                    workspaceId: nextWorkspaceId,
                    categoryName: nextCategoryName,
                    folderId: validFolderId
                }, {
                    source: 'bookmark-folder-links-moved',
                    links: liveLinks
                });
                if (!result?.moved && !result?.merged) return;
                movedIds.push(String(result.targetId || link.id));
                if (result.merged) mergedIds.push(String(result.targetId || ''));
                if (Array.isArray(result.removedIds)) removedIds.push(...result.removedIds);
            } else {
                link.workspace = nextWorkspaceId;
                link.category = nextCategoryName;
                if (validFolderId) link.folderId = validFolderId;
                else delete link.folderId;
                if (typeof syncLinked === 'function') syncLinked(link.id);
                movedIds.push(String(link.id));
            }
            addTouchedScope(touchedScopes, nextWorkspaceId, nextCategoryName);
            movedAny = true;
        });

        if (movedAny) {
            setLiveLinks(liveLinks);
            invalidateTouchedScopes(touchedScopes);
            if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('eve:bookmark-folder-links-moved', {
                    detail: {
                        linkIds: movedIds,
                        workspaceId: targetWorkspaceId,
                        categoryName: targetCategoryName,
                        folderId: validFolderId,
                        mergedLinkIds: mergedIds.filter(Boolean),
                        removedLinkIds: removedIds
                    }
                }));
            }
        }
        if (movedAny && options.persist !== false && typeof saveData === 'function') {
            saveData({
                skipRender: !!options.skipRender,
                skipSuggestions: !!options.skipSuggestions,
                forceRender: true,
                immediate: options.immediate !== false,
                source: 'bookmark-folder-links-moved',
                meta: {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    folderId: validFolderId,
                    movedCount: movedIds.length,
                    mergedLinkIds: mergedIds.filter(Boolean),
                    removedLinkIds: removedIds
                }
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
        const resolvedParentId = normalizeFolderId(parentId);
        const resolvedWorkspace = workspaceId ? String(workspaceId).trim() : '';
        let attempts = 0;

        const openWhenReady = function () {
            if (!document.getElementById('bookmarkFolderCreatorModal') && typeof initModals === 'function') {
                initModals();
            }
            if (typeof window.openFolderCreator === 'function') {
                window.openFolderCreator(resolvedCategory, resolvedParentId, resolvedWorkspace);
                return;
            }
            attempts += 1;
            if (attempts <= 8) {
                setTimeout(openWhenReady, 50);
                return;
            }
            if (typeof showToast === 'function') {
                showToast('Folder controls are still loading. Try again in a moment.', 'warning');
            }
        };

        openWhenReady();
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
