/**
 * Folder-scoped state restore factory.
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    ns.createApplyFolderState = function createApplyFolderState(deps) {
        const {
            getLinks,
            getBookmarkFolders,
            cloneConnections,
            findCategoryLibraryData,
            stripLegacyPinnedFlag,
            mergeLibraryEntries,
            deriveLegacyPinsFromLinks,
            replaceQuickPinsForFolder,
            getFolderTreesObject,
            buildScopedCategoryKey,
            getFolderNodes,
            normalizeFolderTreeSettings,
            buildFolderMaps,
            collectFolderSubtreeIds,
            mergeFolderSubtree,
            setLinks,
            setConfig,
            setBookmarkFolders,
            applyLibraryCategories,
            applyKnowledgeState
        } = deps;
    function applyFolderState(state) {
        if (!state || typeof state !== 'object') return false;

        const workspaceId = String(
            state.metadata?.workspaceId
            || state.bookmarks?.config?.activeWorkspace
            || ''
        ).trim();
        const categoryName = String(state.metadata?.categoryName || '').trim() || 'Unsorted';
        const targetFolderId = String(state.metadata?.folderId || '').trim();
        if (!workspaceId || !categoryName || !targetFolderId) return false;

        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const existingTree = existingFolderTrees[scopedKey] || { nodes: [] };
        const incomingTree = getFolderTreesObject(state.bookmarks?.folders)[scopedKey];
        if (!incomingTree) return false;

        const { childrenByParent } = buildFolderMaps(getFolderNodes(existingTree));
        const removedFolderIds = collectFolderSubtreeIds(targetFolderId, childrenByParent);
        const removedLinkIds = new Set(
            getLinks()
                .filter((entry) => (
                    String(entry?.workspace || '') === workspaceId
                    && String(entry?.category || 'Unsorted') === categoryName
                    && removedFolderIds.has(String(entry?.folderId || '').trim())
                ))
                .map((entry) => String(entry?.id || '').trim())
                .filter(Boolean)
        );

        const incomingLinks = Array.isArray(state.bookmarks?.links)
            ? state.bookmarks.links.map((entry) => ({
                ...stripLegacyPinnedFlag(entry),
                workspace: workspaceId,
                category: categoryName
            }))
            : [];
        const incomingLinkIds = new Set(incomingLinks.map((entry) => String(entry?.id || '').trim()).filter(Boolean));

        const remainingLinks = getLinks().filter((entry) => {
            const entryId = String(entry?.id || '').trim();
            if (incomingLinkIds.has(entryId)) return false;
            if (
                String(entry?.workspace || '') === workspaceId
                && String(entry?.category || 'Unsorted') === categoryName
                && removedFolderIds.has(String(entry?.folderId || '').trim())
            ) {
                return false;
            }
            return true;
        });
        setLinks(remainingLinks.concat(incomingLinks));
        setConfig({ activeWorkspace: workspaceId });

        const mergedNodes = mergeFolderSubtree(existingTree, incomingTree, targetFolderId);
        setBookmarkFolders({
            ...existingFolderTrees,
            [scopedKey]: {
                nodes: mergedNodes,
                settings: normalizeFolderTreeSettings(existingTree?.settings)
            }
        });
        if (state.bookmarks && Object.prototype.hasOwnProperty.call(state.bookmarks, 'pins')) {
            replaceQuickPinsForFolder(workspaceId, categoryName, targetFolderId, Array.isArray(state.bookmarks?.pins) ? state.bookmarks.pins : []);
        } else if (Array.isArray(state.bookmarks?.links)) {
            replaceQuickPinsForFolder(workspaceId, categoryName, targetFolderId, deriveLegacyPinsFromLinks(state.bookmarks.links));
        }

        const existingConnections = cloneConnections();
        const incomingConnections = Array.isArray(state.library?.connections)
            ? state.library.connections.map((conn) => ({
                ...conn,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }))
            : [];
        const nextConnections = existingConnections
            .filter((conn) => {
                const linkId = String(conn?.linkId || '').trim();
                return !removedLinkIds.has(linkId) && !incomingLinkIds.has(linkId);
            })
            .concat(incomingConnections);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(nextConnections);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = nextConnections;
        }

        const incomingCategory = findCategoryLibraryData(state.library?.categories, workspaceId, categoryName);
        if (incomingCategory) {
            const stateModule = window.EveLibrary?.State;
            const storageModule = window.EveDataStore?.getLibraryStorageModule ? window.EveDataStore.getLibraryStorageModule() : null;
            const existingCategory = stateModule?.getCategoryLibrary
                ? stateModule.getCategoryLibrary(categoryName, workspaceId)
                : { entries: [], dataType: 'graphicNovels', folderView: {} };
            const mergedCategory = {
                ...existingCategory,
                dataType: existingCategory?.dataType || incomingCategory?.dataType || 'graphicNovels',
                entries: mergeLibraryEntries(existingCategory?.entries, incomingCategory?.entries),
                folderView: existingCategory?.folderView || incomingCategory?.folderView || { root: 'all', chain: [], expanded: false }
            };
            if (stateModule?.setCategoryLibrary) {
                stateModule.setCategoryLibrary(categoryName, mergedCategory, workspaceId);
                if (storageModule?.saveLibrary) storageModule.saveLibrary();
            } else {
                applyLibraryCategories({ [scopedKey]: mergedCategory });
            }
        }

        applyKnowledgeState(state.knowledge, [categoryName]);
        if (state.audioflix?.scoped === true) {
            window.EveAudioflixLinks?.mergeScopedBackup?.(state.audioflix, {
                scopeType: 'folder',
                workspaceId,
                categoryName,
                folderId: targetFolderId,
                folderIds: Array.from(removedFolderIds),
                bookmarkIds: Array.from(removedLinkIds)
            });
        }

        return true;
    }

        return applyFolderState;
    };
})();
