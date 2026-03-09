/**
 * Unified State Store Capture Scoped Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureScopedHelpers = function createCaptureScopedHelpers(base) {
        const getLibraryStateModule = base.getLibraryStateModule;
        const getLinks = base.getLinks;
        const getConfig = base.getConfig;
        const cloneBookmarkFolders = base.cloneBookmarkFolders;
        const cloneQuickPins = base.cloneQuickPins;
        const cloneConnections = base.cloneConnections;
        const captureState = base.captureState;

        function filterLinksForWorkspace(workspaceId) {
            if (!workspaceId) return [];
            return getLinks().filter(entry => entry.workspace === workspaceId);
        }

        function filterLinksForCard(workspaceId, categoryName) {
            if (!workspaceId || !categoryName) return [];
            return getLinks().filter(entry => entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName);
        }

        function filterConnectionsForWorkspace(workspaceId, workspaceLinks) {
            const currentConnections = cloneConnections();
            const linkIds = new Set(workspaceLinks.map(entry => entry.id));
            return currentConnections.filter(conn => conn.workspace === workspaceId || linkIds.has(conn.linkId));
        }

        function getConnectionCategoryName(conn) {
            return conn?.categoryName || conn?.category || conn?.libraryCategory || null;
        }

        function getConnectionEntryId(conn) {
            return conn?.libraryEntryId || conn?.entryId || null;
        }

        function parseLibraryKey(key) {
            const stateModule = getLibraryStateModule();
            if (stateModule?.parseScopedCategoryKey) {
                return stateModule.parseScopedCategoryKey(key);
            }
            return {
                key,
                categoryName: key,
                workspaceId: '',
                scoped: false
            };
        }

        function buildScopedCategoryKey(workspaceId, categoryName) {
            const stateModule = getLibraryStateModule();
            if (stateModule?.buildScopedCategoryKey) {
                return stateModule.buildScopedCategoryKey(categoryName, workspaceId);
            }
            const ws = String(workspaceId || 'main').trim() || 'main';
            const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            return `${ws}::${cat}`;
        }

        function filterFolderTreesForWorkspace(folderTrees, workspaceId) {
            const trees = folderTrees && typeof folderTrees === 'object' ? folderTrees : {};
            const filtered = {};
            Object.entries(trees).forEach(([key, value]) => {
                const parsed = parseLibraryKey(key);
                if (String(parsed.workspaceId || 'main') !== String(workspaceId || 'main')) return;
                filtered[buildScopedCategoryKey(parsed.workspaceId || 'main', parsed.categoryName || 'Unsorted')] = value;
            });
            return filtered;
        }

        function filterFolderTreesForCard(folderTrees, workspaceId, categoryName) {
            const trees = folderTrees && typeof folderTrees === 'object' ? folderTrees : {};
            const key = buildScopedCategoryKey(workspaceId, categoryName);
            return Object.prototype.hasOwnProperty.call(trees, key)
                ? { [key]: trees[key] }
                : {};
        }

        function getScopedFolderNodes(folderTrees, workspaceId, categoryName) {
            const scoped = filterFolderTreesForCard(folderTrees, workspaceId, categoryName);
            const key = buildScopedCategoryKey(workspaceId, categoryName);
            const tree = scoped[key];
            if (Array.isArray(tree?.nodes)) return tree.nodes.map((node) => ({ ...(node || {}) }));
            if (Array.isArray(tree)) return tree.map((node) => ({ ...(node || {}) }));
            return [];
        }

        function buildFolderMaps(nodes) {
            const list = Array.isArray(nodes) ? nodes.map((node) => ({ ...(node || {}) })) : [];
            const nodeById = new Map();
            const childrenByParent = new Map();
            list.forEach((node) => {
                const id = String(node?.id || '').trim();
                if (!id) return;
                const normalized = {
                    ...node,
                    id,
                    parentId: String(node?.parentId || '').trim() || null,
                    name: String(node?.name || node?.title || 'Folder').trim() || 'Folder',
                    order: Number.isFinite(Number(node?.order)) ? Number(node.order) : 0
                };
                nodeById.set(id, normalized);
                const parentKey = normalized.parentId || '__root__';
                if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
                childrenByParent.get(parentKey).push(normalized);
            });
            childrenByParent.forEach((childNodes) => {
                childNodes.sort((a, b) => {
                    if (a.order !== b.order) return a.order - b.order;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                });
            });
            return { nodeById, childrenByParent };
        }

        function collectFolderSubtreeIds(folderId, childrenByParent) {
            const targetId = String(folderId || '').trim();
            if (!targetId) return new Set();
            const pending = [targetId];
            const seen = new Set();
            while (pending.length) {
                const currentId = pending.pop();
                if (!currentId || seen.has(currentId)) continue;
                seen.add(currentId);
                (childrenByParent.get(currentId) || []).forEach((child) => {
                    const childId = String(child?.id || '').trim();
                    if (childId && !seen.has(childId)) pending.push(childId);
                });
            }
            return seen;
        }

        function buildFolderSubtree(nodes, folderId) {
            const normalizedFolderId = String(folderId || '').trim();
            const { nodeById, childrenByParent } = buildFolderMaps(nodes);
            if (!nodeById.has(normalizedFolderId)) return [];
            const subtreeIds = collectFolderSubtreeIds(normalizedFolderId, childrenByParent);
            return (Array.isArray(nodes) ? nodes : [])
                .map((node) => ({ ...(node || {}) }))
                .filter((node) => subtreeIds.has(String(node?.id || '').trim()))
                .map((node) => (
                    String(node?.id || '').trim() === normalizedFolderId
                        ? { ...node, parentId: null }
                        : node
                ));
        }

        function filterCategoriesForConnections(categories, workspaceConnections) {
            if (!categories || typeof categories !== 'object') return {};
            if (!Array.isArray(workspaceConnections) || workspaceConnections.length === 0) return {};

            const entryIds = new Set();
            const normalizedConnections = workspaceConnections.map(conn => ({
                categoryName: getConnectionCategoryName(conn),
                workspaceId: conn?.workspace ? String(conn.workspace) : '',
                entryId: getConnectionEntryId(conn)
            }));
            normalizedConnections.forEach(conn => {
                if (conn.entryId) entryIds.add(conn.entryId);
            });

            const filtered = {};
            Object.entries(categories).forEach(([libraryKey, categoryData]) => {
                if (!categoryData || typeof categoryData !== 'object') return;
                const entries = Array.isArray(categoryData.entries) ? categoryData.entries : [];
                const parsedKey = parseLibraryKey(libraryKey);

                const hasMatchingConnection = normalizedConnections.some(conn => {
                    if (!conn.categoryName) return false;
                    if (String(conn.categoryName) !== String(parsedKey.categoryName)) return false;
                    if (!parsedKey.workspaceId || !conn.workspaceId) return true;
                    return String(conn.workspaceId) === String(parsedKey.workspaceId);
                });

                if (hasMatchingConnection) {
                    filtered[libraryKey] = {
                        ...categoryData,
                        entries: entries.filter(entry => entryIds.size === 0 || entryIds.has(entry.id))
                    };
                    return;
                }

                if (entryIds.size > 0) {
                    const matched = entries.filter(entry => entryIds.has(entry.id));
                    if (matched.length > 0) {
                        filtered[libraryKey] = { ...categoryData, entries: matched };
                    }
                }
            });

            return filtered;
        }

        function getWorkspaceName(workspaceId) {
            const ws = (getConfig().workspaces || []).find(w => w.id === workspaceId);
            return ws ? ws.name : workspaceId;
        }

        function parseCardTargetId(value) {
            const raw = String(value || '').trim();
            if (!raw.includes('::')) {
                return { workspaceId: 'main', categoryName: String(raw || 'Unsorted').trim() || 'Unsorted' };
            }
            const [workspaceId, categoryName] = raw.split('::', 2);
            return {
                workspaceId: String(workspaceId || 'main').trim() || 'main',
                categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
            };
        }

        function parseFolderTargetId(value) {
            const raw = String(value || '').trim();
            const parts = raw.split('::');
            return {
                workspaceId: String(parts[0] || 'main').trim() || 'main',
                categoryName: String(parts[1] || 'Unsorted').trim() || 'Unsorted',
                folderId: String(parts.slice(2).join('::') || '').trim()
            };
        }

        function getPinContext(pin) {
            if (!pin || typeof pin !== 'object') return null;
            const targetType = String(pin.targetType || '').trim().toLowerCase();
            if (targetType === 'bookmark') {
                const targetId = String(pin.targetId || '').trim();
                const link = getLinks().find((entry) => String(entry?.id || '').trim() === targetId);
                if (!link) return null;
                return {
                    workspaceId: String(link.workspace || 'main').trim() || 'main',
                    categoryName: String(link.category || 'Unsorted').trim() || 'Unsorted',
                    folderId: String(link.folderId || '').trim()
                };
            }
            if (targetType === 'card') return parseCardTargetId(pin.targetId);
            if (targetType === 'folder') return parseFolderTargetId(pin.targetId);
            return null;
        }

        function clonePinsByPredicate(predicate) {
            return (cloneQuickPins() || [])
                .filter((pin) => predicate(pin, getPinContext(pin)))
                .map((pin) => ({ ...(pin || {}) }));
        }

        function filterPinsForWorkspace(workspaceId) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            return clonePinsByPredicate((_pin, context) => (
                !!context && String(context.workspaceId || 'main') === normalizedWorkspace
            ));
        }

        function filterPinsForCard(workspaceId, categoryName) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            return clonePinsByPredicate((_pin, context) => (
                !!context
                && String(context.workspaceId || 'main') === normalizedWorkspace
                && String(context.categoryName || 'Unsorted') === normalizedCategory
            ));
        }

        function filterPinsForBookmark(linkId) {
            const normalizedLinkId = String(linkId || '').trim();
            if (!normalizedLinkId) return [];
            return clonePinsByPredicate((pin) => (
                String(pin?.targetType || '').trim().toLowerCase() === 'bookmark'
                && String(pin?.targetId || '').trim() === normalizedLinkId
            ));
        }

        function filterPinsForFolder(workspaceId, categoryName, folderId) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedFolderId) return [];

            const scopedNodes = getScopedFolderNodes(cloneBookmarkFolders(), normalizedWorkspace, normalizedCategory);
            const { childrenByParent } = buildFolderMaps(scopedNodes);
            const subtreeIds = collectFolderSubtreeIds(normalizedFolderId, childrenByParent);
            return clonePinsByPredicate((pin, context) => {
                if (!context) return false;
                if (String(context.workspaceId || 'main') !== normalizedWorkspace) return false;
                if (String(context.categoryName || 'Unsorted') !== normalizedCategory) return false;
                const targetType = String(pin?.targetType || '').trim().toLowerCase();
                if (targetType === 'folder') {
                    return subtreeIds.has(String(context.folderId || '').trim());
                }
                if (targetType === 'bookmark') {
                    return subtreeIds.has(String(context.folderId || '').trim());
                }
                return false;
            });
        }

        function captureWorkspace(workspaceId) {
            const state = captureState();
            const workspaceLinks = filterLinksForWorkspace(workspaceId);
            const workspaceConnections = filterConnectionsForWorkspace(workspaceId, workspaceLinks);
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
            getConnectionCategoryName,
            captureWorkspace,
            captureCard,
            captureFolder,
            captureBookmark,
            getWorkspaceName,
            findCategoryLibraryData
        };
    };
})();
