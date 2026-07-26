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
        const getPinContext = pinHelpers.getPinContext;

        function applyKnowledgeContexts(state, categoryNames) {
            const contexts = Array.from(new Set(
                (Array.isArray(categoryNames) ? categoryNames : [categoryNames])
                    .map((value) => normalizeKnowledgeContextKey(value))
                    .filter((value) => value && value !== '__global__')
            ));
            state.knowledge = filterKnowledgeState(state.knowledge, contexts);
        }

        function collectWorkspaceIds(workspaces, bucket = new Set()) {
            (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
                const workspaceId = String(workspace?.id || '').trim();
                if (!workspaceId || bucket.has(workspaceId)) return;
                bucket.add(workspaceId);
                collectWorkspaceIds(workspace?.subTabs, bucket);
            });
            return bucket;
        }

        function cloneWorkspaceBranch(workspaces, allowedWorkspaceIds) {
            return (Array.isArray(workspaces) ? workspaces : [])
                .map((workspace) => {
                    const workspaceId = String(workspace?.id || '').trim();
                    if (!workspaceId || !allowedWorkspaceIds.has(workspaceId)) return null;
                    const cloned = { ...(workspace || {}) };
                    cloned.subTabs = cloneWorkspaceBranch(workspace?.subTabs, allowedWorkspaceIds);
                    return cloned;
                })
                .filter(Boolean);
        }

        function filterFolderTreesForWorkspaceIds(folderTrees, workspaceIds) {
            const trees = folderTrees && typeof folderTrees === 'object' ? folderTrees : {};
            const filtered = {};
            Object.entries(trees).forEach(([key, value]) => {
                const parsed = parseLibraryKey(key);
                const workspaceId = String(parsed.workspaceId || 'main').trim() || 'main';
                if (!workspaceIds.has(workspaceId)) return;
                filtered[buildScopedCategoryKey(workspaceId, parsed.categoryName || 'Unsorted')] = value;
            });
            return filtered;
        }

        function filterPinsForWorkspaceIds(pins, workspaceIds) {
            return (Array.isArray(pins) ? pins : [])
                .filter((pin) => {
                    const context = getPinContext ? getPinContext(pin) : null;
                    const workspaceId = String(context?.workspaceId || '').trim();
                    return !!workspaceId && workspaceIds.has(workspaceId);
                })
                .map((pin) => ({ ...(pin || {}) }));
        }

        function normalizeManualOrderShape(value) {
            if (Array.isArray(value)) {
                return {
                    root: value.slice(),
                    parents: {}
                };
            }
            const next = value && typeof value === 'object' ? value : {};
            const root = Array.isArray(next.root) ? next.root.slice() : [];
            const parents = {};
            const sourceParents = next.parents && typeof next.parents === 'object' ? next.parents : {};
            Object.keys(sourceParents).forEach((parentId) => {
                if (!Array.isArray(sourceParents[parentId])) return;
                parents[String(parentId || '').trim()] = sourceParents[parentId].slice();
            });
            return { root, parents };
        }

        function filterManualOrderForGroup(manualOrder, workspaceIds, groupId) {
            const source = normalizeManualOrderShape(manualOrder);
            const allowToken = (token) => {
                const raw = String(token || '').trim();
                if (!raw) return false;
                const dividerIndex = raw.indexOf(':');
                if (dividerIndex === -1) return false;
                const type = raw.slice(0, dividerIndex).trim().toLowerCase();
                const id = raw.slice(dividerIndex + 1).trim();
                if (!id) return false;
                if (type === 'group') return id === groupId;
                if (type === 'workspace') return workspaceIds.has(id);
                return false;
            };

            const filtered = {
                root: source.root.filter(allowToken),
                parents: {}
            };

            Object.entries(source.parents).forEach(([parentId, entries]) => {
                const normalizedParentId = String(parentId || '').trim();
                if (!workspaceIds.has(normalizedParentId)) return;
                const filteredEntries = (Array.isArray(entries) ? entries : []).filter(allowToken);
                if (filteredEntries.length) {
                    filtered.parents[normalizedParentId] = filteredEntries;
                }
            });

            if (!filtered.root.length) filtered.root = [`group:${groupId}`];
            return filtered;
        }

        function captureWorkspace(workspaceId) {
            const state = captureState();
            const workspaceLinks = filterLinksForWorkspace(workspaceId);
            const workspaceConnections = filterConnectionsForWorkspace(workspaceId, workspaceLinks);
            const workspaceCategoryNames = Array.from(new Set(
                workspaceLinks.map((entry) => String(entry?.category || 'Unsorted').trim() || 'Unsorted')
            ));
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
            state.audioflix = window.EveAudioflixLinks?.captureScopedBackup?.({
                scopeType: 'workspace',
                workspaceId
            }) || null;
            return state;
        }

        function captureGroup(groupId) {
            const normalizedGroupId = String(groupId || '').trim();
            if (!normalizedGroupId) return null;

            const state = captureState();
            const currentConfig = state.bookmarks?.config && typeof state.bookmarks.config === 'object'
                ? state.bookmarks.config
                : {};
            const sidebarGroups = Array.isArray(currentConfig.sidebarGroups) ? currentConfig.sidebarGroups : [];
            const selectedGroup = sidebarGroups.find((group) => String(group?.id || '').trim() === normalizedGroupId);
            if (!selectedGroup) return null;

            const allRootWorkspaces = Array.isArray(currentConfig.workspaces) ? currentConfig.workspaces : [];
            const groupRoots = allRootWorkspaces.filter((workspace) => String(workspace?.groupId || '').trim() === normalizedGroupId);
            if (!groupRoots.length) return null;

            const allowedWorkspaceIds = collectWorkspaceIds(groupRoots);
            const filteredWorkspaces = cloneWorkspaceBranch(groupRoots, allowedWorkspaceIds);
            const groupLinks = (Array.isArray(state.bookmarks?.links) ? state.bookmarks.links : []).filter((entry) => {
                const workspaceId = String(entry?.workspace || 'main').trim() || 'main';
                return allowedWorkspaceIds.has(workspaceId);
            });
            const linkIds = new Set(groupLinks.map((entry) => String(entry?.id || '').trim()).filter(Boolean));
            const groupConnections = (Array.isArray(state.library?.connections) ? state.library.connections : []).filter((conn) => {
                const workspaceId = String(conn?.workspace || '').trim();
                const linkId = String(conn?.linkId || '').trim();
                return (workspaceId && allowedWorkspaceIds.has(workspaceId)) || (linkId && linkIds.has(linkId));
            });
            const groupCategoryNames = Array.from(new Set(
                groupLinks.map((entry) => String(entry?.category || 'Unsorted').trim() || 'Unsorted')
            ));
            const preferredWorkspaceId = String(currentConfig.activeWorkspace || '').trim();
            const firstGroupWorkspaceId = String(groupRoots[0]?.id || '').trim() || 'main';
            const activeWorkspaceId = preferredWorkspaceId && allowedWorkspaceIds.has(preferredWorkspaceId)
                ? preferredWorkspaceId
                : firstGroupWorkspaceId;
            const currentOverviewGroupId = String(currentConfig.groupOverviewId || '').trim();

            state.metadata.groupId = normalizedGroupId;
            state.metadata.groupName = String(selectedGroup?.name || '').trim() || normalizedGroupId;
            state.metadata.type = 'group';
            state.bookmarks.links = groupLinks;
            state.bookmarks.config = {
                ...currentConfig,
                activeWorkspace: activeWorkspaceId,
                groupOverviewId: currentOverviewGroupId === normalizedGroupId ? normalizedGroupId : '',
                workspaces: filteredWorkspaces,
                sidebarGroups: [{ ...(selectedGroup || {}) }],
                sidebarManualOrder: filterManualOrderForGroup(currentConfig.sidebarManualOrder, allowedWorkspaceIds, normalizedGroupId)
            };
            state.bookmarks.folders = filterFolderTreesForWorkspaceIds(cloneBookmarkFolders(), allowedWorkspaceIds);
            state.bookmarks.pins = filterPinsForWorkspaceIds(state.bookmarks?.pins, allowedWorkspaceIds);
            state.library.connections = groupConnections;
            state.library.categories = filterCategoriesForConnections(state.library.categories, groupConnections);
            applyKnowledgeContexts(state, groupCategoryNames);
            return state;
        }

        function captureCard(workspaceId, categoryName) {
            const state = captureWorkspace(workspaceId);
            const cardLinks = filterLinksForCard(workspaceId, categoryName);
            const linkIds = new Set(cardLinks.map((entry) => entry.id));
            const cardConnections = (state.library.connections || []).filter((conn) => {
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
            state.audioflix = window.EveAudioflixLinks?.captureScopedBackup?.({
                scopeType: 'card',
                workspaceId,
                categoryName
            }) || null;
            return state;
        }

        function captureBookmark(workspaceId, categoryName, linkId) {
            const normalizedWorkspace = String(workspaceId || '').trim();
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            const normalizedLinkId = String(linkId || '').trim();
            if (!normalizedWorkspace || !normalizedLinkId) return null;

            const state = captureWorkspace(normalizedWorkspace);
            const selectedLink = (state.bookmarks.links || []).find((entry) => String(entry.id) === normalizedLinkId);
            if (!selectedLink) return null;

            const bookmarkCategory = String(selectedLink.category || normalizedCategory || 'Unsorted');
            const bookmarkConnections = (state.library.connections || []).filter((conn) => String(conn.linkId) === normalizedLinkId);

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
            state.audioflix = window.EveAudioflixLinks?.captureScopedBackup?.({
                scopeType: 'bookmark',
                workspaceId: normalizedWorkspace,
                categoryName: bookmarkCategory,
                folderId: String(selectedLink.folderId || '').trim(),
                bookmarkId: normalizedLinkId
            }, {
                directOnly: true
            }) || null;
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
            state.audioflix = window.EveAudioflixLinks?.captureScopedBackup?.({
                scopeType: 'folder',
                workspaceId: normalizedWorkspace,
                categoryName: normalizedCategory,
                folderId: normalizedFolderId
            }, {
                folders: subtreeNodes.map((node) => ({
                    ...node,
                    sourceId: node.id,
                    workspaceId: normalizedWorkspace,
                    categoryName: normalizedCategory
                })),
                bookmarks: folderLinks.map((entry) => ({
                    ...entry,
                    sourceId: entry.id,
                    workspaceId: normalizedWorkspace,
                    categoryName: normalizedCategory
                }))
            }) || null;
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
            captureGroup,
            captureCard,
            captureFolder,
            captureBookmark,
            findCategoryLibraryData
        };
    };
})();
