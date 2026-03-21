window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { text } = shared;

    const STORAGE_KEY = 'eveV22ConstellationDetached';
    const PARKING_CATEGORY_NAME = 'Detached Nodes';

    function cloneValue(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function getFolderHelpers() {
        const folderShared = window.EveBookmarkFolders?._shared || {};
        return {
            normalizeWorkspaceId: folderShared.normalizeWorkspaceId || ((value) => text(value, 'main')),
            normalizeCategoryName: folderShared.normalizeCategoryName || ((value) => text(value, 'Unsorted')),
            normalizeFolderId: folderShared.normalizeFolderId || ((value) => text(value, '')),
            normalizeParentId: folderShared.normalizeParentId || ((value) => {
                const normalized = text(value, '');
                return normalized || null;
            }),
            normalizeTreeSettings: folderShared.normalizeTreeSettings || (() => ({ clickBehaviorMode: 'inherit' })),
            buildScopedKey: folderShared.buildScopedKey || ((ws, cat) => `${text(ws, 'main')}::${text(cat, 'Unsorted')}`),
            buildChildrenMap: folderShared.buildChildrenMap || function (nodes) {
                const map = new Map();
                (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                    const parentId = text(node?.parentId, '') || null;
                    if (!map.has(parentId)) map.set(parentId, []);
                    map.get(parentId).push(node);
                });
                return map;
            },
            cloneStore: folderShared.cloneStore || function () {
                return cloneValue(window.bookmarkFolders || {});
            },
            writeStore: folderShared.writeStore || function (nextStore) {
                window.bookmarkFolders = nextStore;
                if (window.eveState) window.eveState.bookmarkFolders = nextStore;
            }
        };
    }

    function buildUniqueFolderId(baseId, existingIds) {
        const normalizedBase = text(baseId, 'folder');
        let candidate = normalizedBase;
        let index = 1;
        while (existingIds.has(candidate)) {
            candidate = normalizedBase + '__' + index.toString(36);
            index += 1;
        }
        existingIds.add(candidate);
        return candidate;
    }

    function remapDetachedFolderPayload(folderHelpers, folderData, existingIds, nextParentId) {
        const normalizeFolderId = folderHelpers.normalizeFolderId;
        const normalizeParentId = folderHelpers.normalizeParentId;
        const nodes = Array.isArray(folderData?.nodes) ? folderData.nodes : [];
        const links = Array.isArray(folderData?.links) ? folderData.links : [];
        const originalRootId = normalizeFolderId(folderData?.rootId);
        const idMap = new Map();

        nodes.forEach((node) => {
            const oldId = normalizeFolderId(node?.id);
            if (!oldId) return;
            idMap.set(oldId, buildUniqueFolderId(oldId, existingIds));
        });

        const remappedNodes = nodes.map((node) => {
            const oldId = normalizeFolderId(node?.id);
            const oldParentId = normalizeFolderId(node?.parentId);
            const clonedNode = cloneValue(node);
            clonedNode.id = idMap.get(oldId) || oldId;
            if (oldId === originalRootId) {
                clonedNode.parentId = normalizeParentId(nextParentId);
            } else {
                clonedNode.parentId = idMap.get(oldParentId) || normalizeParentId(oldParentId);
            }
            return clonedNode;
        });

        const remappedLinks = links.map((link) => {
            const clonedLink = cloneValue(link);
            const oldFolderId = normalizeFolderId(link?.folderId);
            clonedLink.folderId = idMap.get(oldFolderId) || oldFolderId;
            return clonedLink;
        });

        return {
            rootId: idMap.get(originalRootId) || originalRootId,
            nodes: remappedNodes,
            links: remappedLinks
        };
    }

    function getAllLinksRef() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        return [];
    }

    function setDetachedStore(store) {
        const nextStore = store && typeof store === 'object' ? store : {};
        window.constellationDetachedChains = nextStore;
        if (window.eveState) {
            window.eveState.constellationDetachedChains = nextStore;
        }
        return nextStore;
    }

    function getDetachedStore() {
        if (window.eveState?.constellationDetachedChains && typeof window.eveState.constellationDetachedChains === 'object') {
            return setDetachedStore(window.eveState.constellationDetachedChains);
        }
        if (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object') {
            return setDetachedStore(window.constellationDetachedChains);
        }
        try {
            const raw = window.localStorage?.getItem(STORAGE_KEY);
            if (raw) return setDetachedStore(JSON.parse(raw) || {});
        } catch (error) {
            // ignore storage failures in file:// or private contexts
        }
        return setDetachedStore({});
    }

    function persistDetachedStore() {
        const store = getDetachedStore();
        try {
            window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch (error) {
            // ignore direct storage failures; saveData may still succeed
        }
        if (typeof saveData === 'function') {
            saveData({ skipRender: true, skipSuggestions: true });
        }
        return store;
    }

    function buildDetachedId(prefix) {
        const safePrefix = String(prefix || 'entry').trim() || 'entry';
        return 'det_' + safePrefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function ensureWorkspaceBucket(workspaceId) {
        const normalizedWorkspaceId = text(workspaceId, 'main');
        const store = getDetachedStore();
        if (!Array.isArray(store[normalizedWorkspaceId])) {
            store[normalizedWorkspaceId] = [];
        }
        return store[normalizedWorkspaceId];
    }

    function getDetachedEntriesForScope(scope) {
        const store = getDetachedStore();
        if (scope?.scope === 'all') {
            return Object.keys(store)
                .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
                .flatMap((workspaceId) => (Array.isArray(store[workspaceId]) ? store[workspaceId] : []));
        }
        const workspaceId = text(scope?.workspaceId, 'main');
        return Array.isArray(store[workspaceId]) ? store[workspaceId] : [];
    }

    function getDetachedEntry(entryId) {
        const normalizedEntryId = text(entryId, '');
        if (!normalizedEntryId) return null;
        const store = getDetachedStore();
        const workspaceIds = Object.keys(store);
        for (let index = 0; index < workspaceIds.length; index += 1) {
            const workspaceId = workspaceIds[index];
            const bucket = Array.isArray(store[workspaceId]) ? store[workspaceId] : [];
            const match = bucket.find((entry) => text(entry?.id, '') === normalizedEntryId);
            if (match) return match;
        }
        return null;
    }

    function removeDetachedEntry(entryId) {
        const normalizedEntryId = text(entryId, '');
        if (!normalizedEntryId) return null;
        const store = getDetachedStore();
        const workspaceIds = Object.keys(store);
        for (let index = 0; index < workspaceIds.length; index += 1) {
            const workspaceId = workspaceIds[index];
            const bucket = Array.isArray(store[workspaceId]) ? store[workspaceId] : [];
            const entryIndex = bucket.findIndex((entry) => text(entry?.id, '') === normalizedEntryId);
            if (entryIndex === -1) continue;
            const [removed] = bucket.splice(entryIndex, 1);
            if (!bucket.length) delete store[workspaceId];
            return removed || null;
        }
        return null;
    }

    function syncLinkToLibrary(linkId) {
        const syncFromLink = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
        if (typeof syncFromLink === 'function') {
            syncFromLink(linkId);
        }
    }

    function parkLink(link) {
        const liveLinks = getAllLinksRef();
        const linkId = text(link?.id, '');
        const linkIndex = liveLinks.findIndex((entry) => text(entry?.id, '') === linkId);
        if (linkIndex === -1) return null;

        const clonedLink = cloneValue(liveLinks[linkIndex]);
        const workspaceId = text(clonedLink.workspace, 'main');
        const categoryName = text(clonedLink.category, 'Unsorted');
        const bucket = ensureWorkspaceBucket(workspaceId);
        const entry = {
            id: buildDetachedId('link'),
            kind: 'link',
            workspaceId,
            originCategoryName: categoryName,
            parkingCategoryName: PARKING_CATEGORY_NAME,
            parkedAt: Date.now(),
            label: text(clonedLink.title, 'Bookmark'),
            link: clonedLink
        };

        liveLinks.splice(linkIndex, 1);
        bucket.push(entry);
        persistDetachedStore();
        return entry;
    }

    function parkFolderSubtree(workspaceId, categoryName, folderId) {
        const folderHelpers = getFolderHelpers();
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            normalizeTreeSettings,
            buildScopedKey,
            buildChildrenMap,
            cloneStore,
            writeStore
        } = folderHelpers;

        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const resolvedCategoryName = normalizeCategoryName(categoryName);
        const resolvedFolderId = normalizeFolderId(folderId);
        if (!resolvedFolderId) return null;

        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(resolvedWorkspaceId, resolvedCategoryName);
        const sourceTree = nextStore[scopedKey];
        if (!sourceTree || !Array.isArray(sourceTree.nodes)) return null;

        const rootNode = sourceTree.nodes.find((node) => normalizeFolderId(node?.id) === resolvedFolderId);
        if (!rootNode) return null;

        const childrenMap = buildChildrenMap(sourceTree.nodes);
        const subtreeIds = new Set();
        function collectSubtree(nodeId) {
            subtreeIds.add(nodeId);
            (childrenMap.get(nodeId) || []).forEach((childNode) => collectSubtree(normalizeFolderId(childNode?.id)));
        }
        collectSubtree(resolvedFolderId);

        const movedNodes = sourceTree.nodes
            .filter((node) => subtreeIds.has(normalizeFolderId(node?.id)))
            .map((node) => {
                const clonedNode = cloneValue(node);
                if (normalizeFolderId(clonedNode?.id) === resolvedFolderId) {
                    clonedNode.parentId = null;
                }
                return clonedNode;
            });
        if (!movedNodes.length) return null;

        const liveLinks = getAllLinksRef();
        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!subtreeIds.has(normalizeFolderId(link?.folderId))) continue;
            movedLinks.unshift(cloneValue(link));
            liveLinks.splice(index, 1);
        }

        sourceTree.nodes = sourceTree.nodes.filter((node) => !subtreeIds.has(normalizeFolderId(node?.id)));
        if (!sourceTree.nodes.length && normalizeTreeSettings(sourceTree.settings).clickBehaviorMode === 'inherit') {
            delete nextStore[scopedKey];
        } else {
            nextStore[scopedKey] = {
                nodes: sourceTree.nodes,
                settings: normalizeTreeSettings(sourceTree.settings)
            };
        }

        writeStore(nextStore, false);

        const bucket = ensureWorkspaceBucket(resolvedWorkspaceId);
        const entry = {
            id: buildDetachedId('folder'),
            kind: 'folder',
            workspaceId: resolvedWorkspaceId,
            originCategoryName: resolvedCategoryName,
            parkingCategoryName: PARKING_CATEGORY_NAME,
            parkedAt: Date.now(),
            label: text(rootNode?.name, 'Detached Folder'),
            folder: {
                rootId: resolvedFolderId,
                nodes: movedNodes,
                links: movedLinks
            }
        };

        bucket.push(entry);
        persistDetachedStore();
        return entry;
    }

    function attachLiveLinksToEntry(entryId, linkIds, targetFolderId) {
        const entry = getDetachedEntry(entryId);
        if (!entry || entry.kind !== 'folder') return null;

        const normalizedTargetFolderId = text(targetFolderId, '');
        const liveLinks = getAllLinksRef();
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!linkIdSet.size) return null;

        if (normalizedTargetFolderId) {
            const targetExists = (Array.isArray(entry.folder?.nodes) ? entry.folder.nodes : [])
                .some((node) => text(node?.id, '') === normalizedTargetFolderId);
            if (!targetExists) return null;
        }

        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!linkIdSet.has(text(link?.id, ''))) continue;
            const clonedLink = cloneValue(link);
            clonedLink.folderId = normalizedTargetFolderId;
            movedLinks.unshift(clonedLink);
            liveLinks.splice(index, 1);
        }

        if (!movedLinks.length) return null;

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        entry.folder.links = [...(Array.isArray(entry.folder.links) ? entry.folder.links : []), ...movedLinks];
        persistDetachedStore();

        return {
            selectionId: 'detached_link_' + text(entry.id, '') + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' bookmarks into a detached chain.')
                : 'Bookmark moved into a detached chain.'
        };
    }

    function attachLiveFolderToEntry(entryId, workspaceId, categoryName, folderId, targetFolderId) {
        const entry = getDetachedEntry(entryId);
        if (!entry || entry.kind !== 'folder') return null;

        const folderHelpers = getFolderHelpers();
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            normalizeTreeSettings,
            buildScopedKey,
            buildChildrenMap,
            cloneStore,
            writeStore
        } = folderHelpers;

        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const resolvedCategoryName = normalizeCategoryName(categoryName);
        const resolvedFolderId = normalizeFolderId(folderId);
        const resolvedTargetFolderId = normalizeFolderId(targetFolderId);
        if (!resolvedFolderId) return null;

        if (resolvedTargetFolderId) {
            const targetExists = (Array.isArray(entry.folder?.nodes) ? entry.folder.nodes : [])
                .some((node) => normalizeFolderId(node?.id) === resolvedTargetFolderId);
            if (!targetExists) return null;
        }

        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(resolvedWorkspaceId, resolvedCategoryName);
        const sourceTree = nextStore[scopedKey];
        if (!sourceTree || !Array.isArray(sourceTree.nodes)) return null;

        const rootNode = sourceTree.nodes.find((node) => normalizeFolderId(node?.id) === resolvedFolderId);
        if (!rootNode) return null;

        const childrenMap = buildChildrenMap(sourceTree.nodes);
        const subtreeIds = new Set();
        function collectSubtree(nodeId) {
            subtreeIds.add(nodeId);
            (childrenMap.get(nodeId) || []).forEach((childNode) => collectSubtree(normalizeFolderId(childNode?.id)));
        }
        collectSubtree(resolvedFolderId);

        const movedFolderData = {
            rootId: resolvedFolderId,
            nodes: sourceTree.nodes.filter((node) => subtreeIds.has(normalizeFolderId(node?.id))).map((node) => cloneValue(node)),
            links: []
        };
        if (!movedFolderData.nodes.length) return null;

        const liveLinks = getAllLinksRef();
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const link = liveLinks[index];
            if (!subtreeIds.has(normalizeFolderId(link?.folderId))) continue;
            movedFolderData.links.unshift(cloneValue(link));
            liveLinks.splice(index, 1);
        }

        sourceTree.nodes = sourceTree.nodes.filter((node) => !subtreeIds.has(normalizeFolderId(node?.id)));
        if (!sourceTree.nodes.length && normalizeTreeSettings(sourceTree.settings).clickBehaviorMode === 'inherit') {
            delete nextStore[scopedKey];
        } else {
            nextStore[scopedKey] = {
                nodes: sourceTree.nodes,
                settings: normalizeTreeSettings(sourceTree.settings)
            };
        }
        writeStore(nextStore, false);

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        const existingIds = new Set((Array.isArray(entry.folder.nodes) ? entry.folder.nodes : []).map((node) => normalizeFolderId(node?.id)));
        const remapped = remapDetachedFolderPayload(folderHelpers, movedFolderData, existingIds, resolvedTargetFolderId || null);
        entry.folder.nodes = [...(Array.isArray(entry.folder.nodes) ? entry.folder.nodes : []), ...remapped.nodes];
        entry.folder.links = [...(Array.isArray(entry.folder.links) ? entry.folder.links : []), ...remapped.links];
        persistDetachedStore();

        return {
            selectionId: 'detached_folder_' + text(entry.id, '') + '_' + text(remapped.rootId, ''),
            message: resolvedTargetFolderId
                ? 'Folder branch moved into a detached folder chain.'
                : 'Folder branch moved into a detached chain.'
        };
    }

    function restoreDetachedLink(entry, targetSpec) {
        const liveLinks = getAllLinksRef();
        const link = cloneValue(entry?.link || {});
        if (!link || typeof link !== 'object') return null;

        link.workspace = text(targetSpec?.workspaceId, 'main');
        link.category = text(targetSpec?.categoryName, 'Unsorted');
        if (text(targetSpec?.folderId, '')) link.folderId = text(targetSpec.folderId, '');
        else delete link.folderId;

        liveLinks.push(link);
        syncLinkToLibrary(link.id);
        return {
            selectionId: 'link_' + text(link.id, ''),
            message: text(targetSpec?.folderId, '')
                ? 'Detached bookmark attached to a folder chain.'
                : 'Detached bookmark attached to a card.'
        };
    }

    function restoreDetachedFolder(entry, targetSpec) {
        const folderHelpers = getFolderHelpers();
        const {
            normalizeWorkspaceId,
            normalizeCategoryName,
            normalizeFolderId,
            normalizeParentId,
            normalizeTreeSettings,
            buildScopedKey,
            cloneStore,
            writeStore
        } = folderHelpers;

        const folderData = entry?.folder;
        if (!folderData?.rootId || !Array.isArray(folderData.nodes)) return null;

        const targetWorkspaceId = normalizeWorkspaceId(targetSpec?.workspaceId);
        const targetCategoryName = normalizeCategoryName(targetSpec?.categoryName);
        const targetParentId = normalizeParentId(targetSpec?.targetParentId || targetSpec?.folderId);
        const rootId = normalizeFolderId(folderData.rootId);

        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(targetWorkspaceId, targetCategoryName);
        const targetTree = nextStore[scopedKey] || { nodes: [], settings: normalizeTreeSettings({}) };
        const existingIds = new Set((targetTree.nodes || []).map((node) => normalizeFolderId(node?.id)));
        const remapped = remapDetachedFolderPayload(folderHelpers, folderData, existingIds, targetParentId);

        targetTree.nodes = [...(targetTree.nodes || []), ...remapped.nodes];
        nextStore[scopedKey] = {
            nodes: targetTree.nodes,
            settings: normalizeTreeSettings(targetTree.settings)
        };
        writeStore(nextStore, false);

        const liveLinks = getAllLinksRef();
        remapped.links.forEach((link) => {
            const clonedLink = cloneValue(link);
            clonedLink.workspace = targetWorkspaceId;
            clonedLink.category = targetCategoryName;
            liveLinks.push(clonedLink);
            syncLinkToLibrary(clonedLink.id);
        });

        return {
            selectionId: 'folder_' + targetWorkspaceId + '_' + targetCategoryName + '_' + remapped.rootId,
            message: targetParentId
                ? 'Detached folder chain attached to a folder.'
                : 'Detached folder chain attached to a card.'
        };
    }

    function restoreDetachedEntry(entryId, targetSpec) {
        const entry = getDetachedEntry(entryId);
        if (!entry || !targetSpec) return null;

        const result = entry.kind === 'folder'
            ? restoreDetachedFolder(entry, targetSpec)
            : restoreDetachedLink(entry, targetSpec);
        if (!result) return null;

        removeDetachedEntry(entryId);
        persistDetachedStore();
        return result;
    }

    ns._detached = ns._detached || {};
    Object.assign(ns._detached, {
        STORAGE_KEY,
        PARKING_CATEGORY_NAME,
        getDetachedStore,
        getDetachedEntriesForScope,
        getDetachedEntry,
        parkLink,
        parkFolderSubtree,
        attachLiveLinksToEntry,
        attachLiveFolderToEntry,
        restoreDetachedEntry,
        persistDetachedStore
    });
})(window.EveConstellationMap);
