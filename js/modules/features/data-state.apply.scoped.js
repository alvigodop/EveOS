/**
 * Unified State Store Apply Scoped Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyScopedReady) return;
    if (!ns.captureReady || !ns.applySharedReady) {
        console.warn('[EveDataStore] Capture/shared apply helpers missing; scoped apply helpers not initialized.');
        return;
    }

    const getLinks = ns.getLinks;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const setBookmarkFolders = ns.setBookmarkFolders;
    const cloneConnections = ns.cloneConnections;
    const getConnectionCategoryName = ns.getConnectionCategoryName;
    const findCategoryLibraryData = ns.findCategoryLibraryData;

    function mergeLibraryEntries(existingEntries, incomingEntries) {
        const merged = new Map();
        (Array.isArray(existingEntries) ? existingEntries : []).forEach((entry) => {
            const id = String(entry?.id || '').trim();
            if (id) merged.set(id, { ...(entry || {}) });
        });
        (Array.isArray(incomingEntries) ? incomingEntries : []).forEach((entry) => {
            const id = String(entry?.id || '').trim();
            if (!id) return;
            merged.set(id, { ...(entry || {}) });
        });
        return Array.from(merged.values());
    }

    function getFolderTreesObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        const stateModule = window.EveLibrary?.State;
        if (stateModule?.buildScopedCategoryKey) {
            return stateModule.buildScopedCategoryKey(categoryName, workspaceId);
        }
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function filterFolderTreesByWorkspace(folderTrees, workspaceId) {
        const trees = getFolderTreesObject(folderTrees);
        const filtered = {};
        Object.entries(trees).forEach(([key, value]) => {
            if (String(key || '').split('::', 1)[0] !== String(workspaceId || 'main')) return;
            filtered[key] = value;
        });
        return filtered;
    }

    function getFolderNodes(tree) {
        if (Array.isArray(tree?.nodes)) return tree.nodes.map((node) => ({ ...(node || {}) }));
        if (Array.isArray(tree)) return tree.map((node) => ({ ...(node || {}) }));
        return [];
    }

    function buildFolderMaps(nodes) {
        const nodeById = new Map();
        const childrenByParent = new Map();
        (Array.isArray(nodes) ? nodes : []).forEach((rawNode) => {
            const id = String(rawNode?.id || '').trim();
            if (!id) return;
            const node = {
                ...(rawNode || {}),
                id,
                parentId: String(rawNode?.parentId || '').trim() || null,
                name: String(rawNode?.name || rawNode?.title || 'Folder').trim() || 'Folder',
                order: Number.isFinite(Number(rawNode?.order)) ? Number(rawNode.order) : 0
            };
            nodeById.set(id, node);
            const parentKey = node.parentId || '__root__';
            if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
            childrenByParent.get(parentKey).push(node);
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

    function mergeFolderSubtree(existingTree, incomingTree, targetFolderId) {
        const targetId = String(targetFolderId || '').trim();
        if (!targetId) return getFolderNodes(existingTree);

        const existingNodes = getFolderNodes(existingTree);
        const incomingNodes = getFolderNodes(incomingTree);
        const { nodeById: existingById, childrenByParent: existingChildren } = buildFolderMaps(existingNodes);
        const { nodeById: incomingById } = buildFolderMaps(incomingNodes);
        if (!incomingNodes.length) return existingNodes;

        const incomingRoots = incomingNodes.filter((node) => !String(node?.parentId || '').trim());
        const incomingRoot = incomingById.get(targetId) || incomingRoots[0] || null;
        if (!incomingRoot) return existingNodes;

        const sourceRootId = String(incomingRoot.id || '').trim();
        const existingTarget = existingById.get(targetId) || null;
        const targetParentId = existingTarget?.parentId || null;
        const removedIds = existingTarget ? collectFolderSubtreeIds(targetId, existingChildren) : new Set();
        const rootRemap = sourceRootId && sourceRootId !== targetId ? new Map([[sourceRootId, targetId]]) : new Map();

        const transformedIncoming = incomingNodes.map((node) => {
            const sourceId = String(node?.id || '').trim();
            const sourceParentId = String(node?.parentId || '').trim();
            const nextId = rootRemap.get(sourceId) || sourceId;
            const nextParentId = sourceId === sourceRootId
                ? targetParentId
                : (rootRemap.get(sourceParentId) || sourceParentId || null);
            return {
                ...node,
                id: nextId,
                parentId: nextParentId || null
            };
        });
        const incomingIds = new Set(transformedIncoming.map((node) => String(node?.id || '').trim()).filter(Boolean));

        return existingNodes
            .filter((node) => {
                const id = String(node?.id || '').trim();
                return !removedIds.has(id) && !incomingIds.has(id);
            })
            .concat(transformedIncoming);
    }

    function applyState(state) {
        if (!state || typeof state !== 'object') return false;

        if (state.bookmarks) {
            if (Array.isArray(state.bookmarks.links)) {
                ns.setLinks(state.bookmarks.links);
            }
            if (state.bookmarks.config && typeof state.bookmarks.config === 'object') {
                ns.setConfig(state.bookmarks.config);
            }
            setBookmarkFolders(getFolderTreesObject(state.bookmarks.folders));
        }

        if (state.library) {
            ns.applyLibraryCategories(state.library.categories);
            if (Array.isArray(state.library.connections)) {
                if (window.EveLibrary?.ConnectionsAPI?.setAll) {
                    window.EveLibrary.ConnectionsAPI.setAll(state.library.connections);
                } else {
                    window.EveLibrary = window.EveLibrary || {};
                    window.EveLibrary.Connections = state.library.connections.map(entry => ({ ...entry }));
                }
            }
        }

        return true;
    }

    function applyWorkspaceState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        if (!workspaceId) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter(entry => entry.workspace !== workspaceId);
            ns.setLinks(remaining.concat(state.bookmarks.links.map(entry => ({ ...entry, workspace: workspaceId }))));
        }

        if (state.bookmarks?.config) {
            ns.setConfig({ activeWorkspace: workspaceId });
        }
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const incomingFolderTrees = filterFolderTreesByWorkspace(state.bookmarks?.folders, workspaceId);
        const remainingFolderTrees = Object.fromEntries(
            Object.entries(existingFolderTrees).filter(([key]) => String(key || '').split('::', 1)[0] !== String(workspaceId))
        );
        setBookmarkFolders({ ...remainingFolderTrees, ...incomingFolderTrees });

        if (state.library) {
            ns.applyLibraryCategories(state.library.categories);
            ns.applyConnections(workspaceId, state.library.connections || []);
        }

        return true;
    }

    function applyCardState(state) {
        if (!state || typeof state !== 'object') return false;
        const workspaceId = state.metadata?.workspaceId || state.bookmarks?.config?.activeWorkspace;
        const categoryName = state.metadata?.categoryName;
        if (!workspaceId || !categoryName) return false;

        if (Array.isArray(state.bookmarks?.links)) {
            const remaining = getLinks().filter(entry => !(entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName));
            const incoming = state.bookmarks.links.map(entry => ({
                ...entry,
                workspace: workspaceId,
                category: categoryName
            }));
            ns.setLinks(remaining.concat(incoming));
        }

        ns.setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
        const nextFolderTrees = { ...existingFolderTrees };
        delete nextFolderTrees[targetScopedKey];
        if (Object.prototype.hasOwnProperty.call(getFolderTreesObject(state.bookmarks?.folders), targetScopedKey)) {
            nextFolderTrees[targetScopedKey] = state.bookmarks.folders[targetScopedKey];
        }
        setBookmarkFolders(nextFolderTrees);

        if (state.library?.categories && typeof state.library.categories === 'object') {
            const selectedCategory = findCategoryLibraryData(state.library.categories, workspaceId, categoryName);
            if (selectedCategory) {
                ns.applyLibraryCategories({ [categoryName]: selectedCategory });
            } else {
                ns.applyLibraryCategories(state.library.categories);
            }
        }

        if (Array.isArray(state.library?.connections)) {
            const existing = cloneConnections();
            const incoming = state.library.connections.map(conn => ({
                ...conn,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }));
            const incomingLinkIds = new Set(incoming.map(conn => conn.linkId).filter(Boolean));
            const filtered = existing.filter(conn => {
                const connCategory = getConnectionCategoryName(conn) || '';
                if (conn.workspace === workspaceId && connCategory === categoryName) return false;
                if (incomingLinkIds.has(conn.linkId)) return false;
                return true;
            });
            const next = filtered.concat(incoming);
            if (window.EveLibrary?.ConnectionsAPI?.setAll) {
                window.EveLibrary.ConnectionsAPI.setAll(next);
            } else {
                window.EveLibrary = window.EveLibrary || {};
                window.EveLibrary.Connections = next;
            }
        }

        return true;
    }

    function applyBookmarkState(state) {
        if (!state || typeof state !== 'object') return false;
        const incomingLinks = Array.isArray(state.bookmarks?.links) ? state.bookmarks.links : [];
        if (!incomingLinks.length) return false;

        const incomingLink = { ...incomingLinks[0] };
        const workspaceId = String(
            state.metadata?.workspaceId
            || incomingLink.workspace
            || state.bookmarks?.config?.activeWorkspace
            || ''
        ).trim();
        if (!workspaceId) return false;

        const categoryName = String(
            state.metadata?.categoryName
            || incomingLink.category
            || 'Unsorted'
        ).trim() || 'Unsorted';
        incomingLink.workspace = workspaceId;
        incomingLink.category = categoryName;

        if (!incomingLink.id) return false;
        const normalizedLinkId = String(incomingLink.id);

        const remaining = getLinks().filter(entry => String(entry.id) !== normalizedLinkId);
        ns.setLinks(remaining.concat(incomingLink));
        ns.setConfig({ activeWorkspace: workspaceId });
        const targetScopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const incomingFolderTrees = getFolderTreesObject(state.bookmarks?.folders);
        if (Object.prototype.hasOwnProperty.call(incomingFolderTrees, targetScopedKey)) {
            const existingFolderTrees = getFolderTreesObject(getBookmarkFolders());
            setBookmarkFolders({
                ...existingFolderTrees,
                [targetScopedKey]: incomingFolderTrees[targetScopedKey]
            });
        }

        if (state.library?.categories && typeof state.library.categories === 'object') {
            ns.applyLibraryCategories(state.library.categories);
        }

        const existing = cloneConnections();
        const incomingConnections = Array.isArray(state.library?.connections)
            ? state.library.connections.map(conn => ({
                ...conn,
                linkId: normalizedLinkId,
                workspace: workspaceId,
                categoryName: conn.categoryName || categoryName
            }))
            : [];
        const filtered = existing.filter(conn => String(conn.linkId) !== normalizedLinkId);
        const next = filtered.concat(incomingConnections);
        if (window.EveLibrary?.ConnectionsAPI?.setAll) {
            window.EveLibrary.ConnectionsAPI.setAll(next);
        } else {
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = next;
        }

        return true;
    }

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
                ...entry,
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
        ns.setLinks(remainingLinks.concat(incomingLinks));
        ns.setConfig({ activeWorkspace: workspaceId });

        const mergedNodes = mergeFolderSubtree(existingTree, incomingTree, targetFolderId);
        setBookmarkFolders({
            ...existingFolderTrees,
            [scopedKey]: { nodes: mergedNodes }
        });

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
                ns.applyLibraryCategories({ [scopedKey]: mergedCategory });
            }
        }

        return true;
    }

    Object.assign(ns, {
        applyState,
        applyWorkspaceState,
        applyCardState,
        applyFolderState,
        applyBookmarkState
    });

    ns.applyScopedReady = true;
})();
