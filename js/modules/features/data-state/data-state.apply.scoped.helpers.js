window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyScopedHelpersReady) return;
    if (!ns.captureReady || !ns.applySharedReady) return;

    const getLinks = ns.getLinks;
    const getBookmarkFolders = ns.getBookmarkFolders;
    const setBookmarkFolders = ns.setBookmarkFolders;
    const setQuickPins = ns.setQuickPins;
    const cloneConnections = ns.cloneConnections;
    const getConnectionCategoryName = ns.getConnectionCategoryName;
    const findCategoryLibraryData = ns.findCategoryLibraryData;

    function stripLegacyPinnedFlag(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        const nextEntry = { ...(entry || {}) };
        delete nextEntry.pinned;
        return nextEntry;
    }

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

    function deriveLegacyPinsFromLinks(links) {
        return (Array.isArray(links) ? links : [])
            .filter((entry) => !!entry?.pinned && String(entry?.id || '').trim())
            .map((entry, index) => ({
                id: `pin-bookmark-${String(entry.id).trim()}`,
                targetType: 'bookmark',
                targetId: String(entry.id).trim(),
                scopeType: 'tab',
                order: index
            }));
    }

    function replaceQuickPinsForWorkspace(workspaceId, incomingPins) {
        if (window.EveQuickPins?.replacePinsForWorkspace) {
            window.EveQuickPins.replacePinsForWorkspace(workspaceId, incomingPins, { persist: false });
            if (typeof saveData === 'function') saveData();
            return;
        }
        setQuickPins(Array.isArray(incomingPins) ? incomingPins : []);
    }

    function replaceQuickPinsForCard(workspaceId, categoryName, incomingPins) {
        if (window.EveQuickPins?.replacePinsForCard) {
            window.EveQuickPins.replacePinsForCard(workspaceId, categoryName, incomingPins, { persist: false });
            if (typeof saveData === 'function') saveData();
            return;
        }
        setQuickPins(Array.isArray(incomingPins) ? incomingPins : []);
    }

    function replaceQuickPinsForBookmark(bookmarkId, incomingPins) {
        if (window.EveQuickPins?.replacePinsForBookmark) {
            window.EveQuickPins.replacePinsForBookmark(bookmarkId, incomingPins, { persist: false });
            if (typeof saveData === 'function') saveData();
            return;
        }
        setQuickPins(Array.isArray(incomingPins) ? incomingPins : []);
    }

    function replaceQuickPinsForFolder(workspaceId, categoryName, folderId, incomingPins) {
        if (window.EveQuickPins?.replacePinsForFolder) {
            window.EveQuickPins.replacePinsForFolder(workspaceId, categoryName, folderId, incomingPins, { persist: false });
            if (typeof saveData === 'function') saveData();
            return;
        }
        setQuickPins(Array.isArray(incomingPins) ? incomingPins : []);
    }

    function getFolderTreesObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        const stateModule = window.EveLibrary?.State;
        if (stateModule?.buildScopedCategoryKey) {
            // Correct mapping: library state uses (category, workspace) to return "workspace::category"
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

    function normalizeFolderTreeSettings(settings) {
        const normalizeMode = window.EveBookmarkFolders?.normalizeClickBehaviorMode;
        const clickBehaviorMode = typeof normalizeMode === 'function'
            ? normalizeMode(settings?.clickBehaviorMode)
            : String(settings?.clickBehaviorMode || '').trim().toLowerCase();
        return {
            clickBehaviorMode: ['inherit', 'invert', 'focus_only', 'internal_only', 'open_and_focus', 'open_only'].includes(clickBehaviorMode)
                ? clickBehaviorMode
                : 'inherit'
        };
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
            childNodes.sort((a, b) => (a.order !== b.order ? a.order - b.order : String(a.name || '').localeCompare(String(b.name || ''))));
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
            const nextParentId = sourceId === sourceRootId ? targetParentId : (rootRemap.get(sourceParentId) || sourceParentId || null);
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

    Object.assign(ns, {
        getLinks,
        getBookmarkFolders,
        setBookmarkFolders,
        cloneConnections,
        getConnectionCategoryName,
        findCategoryLibraryData,
        stripLegacyPinnedFlag,
        mergeLibraryEntries,
        deriveLegacyPinsFromLinks,
        replaceQuickPinsForWorkspace,
        replaceQuickPinsForCard,
        replaceQuickPinsForBookmark,
        replaceQuickPinsForFolder,
        getFolderTreesObject,
        buildScopedCategoryKey,
        filterFolderTreesByWorkspace,
        getFolderNodes,
        normalizeFolderTreeSettings,
        buildFolderMaps,
        collectFolderSubtreeIds,
        mergeFolderSubtree
    });

    ns.applyScopedHelpersReady = true;
})();
