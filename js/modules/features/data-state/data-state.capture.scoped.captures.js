/**
 * Unified State Store Capture Scoped Capture Methods
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureScopedCaptureHelpers = function createCaptureScopedCaptureHelpers(base, sharedHelpers, pinHelpers) {
        const cloneBookmarkFolders = base.cloneBookmarkFolders;
        const captureState = base.captureState;
        const normalizeKnowledgeContextKey = base.normalizeKnowledgeContextKey;
        const filterKnowledgeState = base.filterKnowledgeState;
        const getConnectionCategoryName = sharedHelpers.getConnectionCategoryName;
        const buildScopedCategoryKey = sharedHelpers.buildScopedCategoryKey;
        const getScopedFolderNodes = sharedHelpers.getScopedFolderNodes;
        const buildFolderMaps = sharedHelpers.buildFolderMaps;
        const collectFolderSubtreeIds = sharedHelpers.collectFolderSubtreeIds;
        const buildFolderSubtree = sharedHelpers.buildFolderSubtree;
        const filterCategoriesForConnections = sharedHelpers.filterCategoriesForConnections;
        const filterLinksForWorkspace = sharedHelpers.filterLinksForWorkspace;
        const filterLinksForCard = sharedHelpers.filterLinksForCard;
        const filterConnectionsForWorkspace = sharedHelpers.filterConnectionsForWorkspace;
        const filterFolderTreesForWorkspace = sharedHelpers.filterFolderTreesForWorkspace;
        const filterFolderTreesForCard = sharedHelpers.filterFolderTreesForCard;
        const getWorkspaceName = sharedHelpers.getWorkspaceName;
        const parseLibraryKey = sharedHelpers.parseLibraryKey;
        const filterPinsForWorkspace = pinHelpers.filterPinsForWorkspace;
        const filterPinsForCard = pinHelpers.filterPinsForCard;
        const filterPinsForBookmark = pinHelpers.filterPinsForBookmark;
        const filterPinsForFolder = pinHelpers.filterPinsForFolder;

        function applyKnowledgeContexts(state, categoryNames) {
            const contexts = Array.from(new Set(
                (Array.isArray(categoryNames) ? categoryNames : [categoryNames])
                    .map((value) => normalizeKnowledgeContextKey(value))
                    .filter((value) => value && value !== '__global__')
            ));
            state.knowledge = filterKnowledgeState(state.knowledge, contexts);
        }

        function captureWorkspace(workspaceId) {
            const state = captureState();
            const workspaceLinks = filterLinksForWorkspace(workspaceId);
            const workspaceConnections = filterConnectionsForWorkspace(workspaceId, workspaceLinks);
            const workspaceCategoryNames = Array.from(new Set(workspaceLinks.map((entry) => String(entry?.category || 'Unsorted').trim() || 'Unsorted')));
            state.metadata.workspaceId = workspaceId;
            state.metadata.workspaceName = getWorkspaceName(workspaceId);
            state.metadata.type = 'workspace';
            state.bookmarks.links = workspaceLinks;
            state.bookmarks.config = {
                ...state.bookmarks.config,
                activeWorkspace: workspaceId
            };
            state.bookmarks.folders = filterFolderTreesForWorkspace(cloneBookmarkFolders(), workspaceId);
            state.bookmarks.pins = filterPinsForWorkspace(workspaceId);
            state.library.connections = workspaceConnections;
            state.library.categories = filterCategoriesForConnections(state.library.categories, workspaceConnections);
            applyKnowledgeContexts(state, workspaceCategoryNames);
            return state;
        }

        function captureCard(workspaceId, categoryName) {
            const state = captureWorkspace(workspaceId);
            const cardLinks = filterLinksForCard(workspaceId, categoryName);
            const linkIds = new Set(cardLinks.map(entry => entry.id));
            const cardConnections = (state.library.connections || []).filter(conn => {
                const connCategory = getConnectionCategoryName(conn);
                return connCategory === categoryName || linkIds.has(conn.linkId);
            });

            state.metadata.workspaceId = workspaceId;
            state.metadata.workspaceName = getWorkspaceName(workspaceId);
            state.metadata.categoryName = categoryName;
            state.metadata.type = 'card';
            state.bookmarks.links = cardLinks;
            state.bookmarks.config = {
                ...state.bookmarks.config,
                activeWorkspace: workspaceId
            };
            state.bookmarks.folders = filterFolderTreesForCard(cloneBookmarkFolders(), workspaceId, categoryName);
            state.bookmarks.pins = filterPinsForCard(workspaceId, categoryName);
            state.library.connections = cardConnections;
            state.library.categories = filterCategoriesForConnections(state.library.categories, cardConnections);
            applyKnowledgeContexts(state, [categoryName]);
            return state;
        }

        function captureBookmark(workspaceId, categoryName, linkId) {
            const normalizedWorkspace = String(workspaceId || '').trim();
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            const normalizedLinkId = String(linkId || '').trim();
            if (!normalizedWorkspace || !normalizedLinkId) return null;

            const state = captureWorkspace(normalizedWorkspace);
            const selectedLink = (state.bookmarks.links || []).find(entry => String(entry.id) === normalizedLinkId);
            if (!selectedLink) return null;

            const bookmarkCategory = String(selectedLink.category || normalizedCategory || 'Unsorted');
            const bookmarkConnections = (state.library.connections || []).filter(conn => String(conn.linkId) === normalizedLinkId);

            state.metadata.workspaceId = normalizedWorkspace;
            state.metadata.workspaceName = getWorkspaceName(normalizedWorkspace);
            state.metadata.categoryName = bookmarkCategory;
            state.metadata.bookmarkId = normalizedLinkId;
            state.metadata.type = 'bookmark';
            state.bookmarks.links = [{ ...selectedLink, workspace: normalizedWorkspace, category: bookmarkCategory }];
            state.bookmarks.config = {
                ...state.bookmarks.config,
                activeWorkspace: normalizedWorkspace
            };
            state.bookmarks.folders = filterFolderTreesForCard(cloneBookmarkFolders(), normalizedWorkspace, bookmarkCategory);
            state.bookmarks.pins = filterPinsForBookmark(normalizedLinkId);
            state.library.connections = bookmarkConnections;
            state.library.categories = filterCategoriesForConnections(state.library.categories, bookmarkConnections);
            applyKnowledgeContexts(state, [bookmarkCategory]);
            return state;
        }

        function captureFolder(workspaceId, categoryName, folderId) {
            const normalizedWorkspace = String(workspaceId || '').trim();
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedWorkspace || !normalizedCategory || !normalizedFolderId) return null;

            const state = captureCard(normalizedWorkspace, normalizedCategory);
            if (!state) return null;

            const scopedKey = buildScopedCategoryKey(normalizedWorkspace, normalizedCategory);
            const folderNodes = getScopedFolderNodes(state.bookmarks?.folders, normalizedWorkspace, normalizedCategory);
            const subtreeNodes = buildFolderSubtree(folderNodes, normalizedFolderId);
            if (!subtreeNodes.length) return null;

            const { childrenByParent } = buildFolderMaps(subtreeNodes);
            const subtreeIds = collectFolderSubtreeIds(normalizedFolderId, childrenByParent);
            const folderLinks = (state.bookmarks?.links || []).filter((entry) => (
                subtreeIds.has(String(entry?.folderId || '').trim())
            ));
            const linkIds = new Set(folderLinks.map((entry) => String(entry?.id || '').trim()).filter(Boolean));
            const folderConnections = (state.library?.connections || []).filter((conn) => (
                linkIds.has(String(conn?.linkId || '').trim())
            ));

            state.metadata.workspaceId = normalizedWorkspace;
            state.metadata.workspaceName = getWorkspaceName(normalizedWorkspace);
            state.metadata.categoryName = normalizedCategory;
            state.metadata.folderId = normalizedFolderId;
            state.metadata.type = 'folder';
            state.bookmarks.links = folderLinks.map((entry) => ({
                ...entry,
                workspace: normalizedWorkspace,
                category: normalizedCategory
            }));
            state.bookmarks.config = {
                ...state.bookmarks.config,
                activeWorkspace: normalizedWorkspace
            };
            state.bookmarks.folders = {
                [scopedKey]: {
                    nodes: subtreeNodes
                }
            };
            state.bookmarks.pins = filterPinsForFolder(normalizedWorkspace, normalizedCategory, normalizedFolderId);
            state.library.connections = folderConnections;
            state.library.categories = filterCategoriesForConnections(state.library.categories, folderConnections);
            applyKnowledgeContexts(state, [normalizedCategory]);
            return state;
        }

        function findCategoryLibraryData(categories, workspaceId, categoryName) {
            if (!categories || typeof categories !== 'object') return null;
            if (Object.prototype.hasOwnProperty.call(categories, categoryName)) {
                return categories[categoryName];
            }

            const normalizedWorkspace = String(workspaceId || '');
            for (const [libraryKey, data] of Object.entries(categories)) {
                const parsed = parseLibraryKey(libraryKey);
                if (String(parsed.categoryName) !== String(categoryName)) continue;
                if (!normalizedWorkspace || !parsed.workspaceId || String(parsed.workspaceId) === normalizedWorkspace) {
                    return data;
                }
            }
            return null;
        }

        return {
            captureWorkspace,
            captureCard,
            captureFolder,
            captureBookmark,
            findCategoryLibraryData
        };
    };
})();
