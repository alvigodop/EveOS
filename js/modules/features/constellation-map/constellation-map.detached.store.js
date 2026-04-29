window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const detached = ns._detached = ns._detached || {};
    const text = detached.text || shared.text;

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
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
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

    function buildSyntheticDetachedRootId(entry, nodeIds) {
        const usedIds = nodeIds instanceof Set ? nodeIds : new Set();
        const baseId = 'detached_root';
        let candidate = baseId;
        let index = 1;
        while (usedIds.has(candidate)) {
            candidate = baseId + '__' + index.toString(36);
            index += 1;
        }
        return candidate;
    }

    function normalizeDetachedFolderEntry(entry) {
        if (!entry || entry.kind !== 'folder' || !entry.folder || typeof entry.folder !== 'object') return false;

        const folder = entry.folder;
        const nodes = Array.isArray(folder.nodes) ? folder.nodes : [];
        const links = Array.isArray(folder.links) ? folder.links : [];
        if (!Array.isArray(folder.nodes)) folder.nodes = nodes;
        if (!Array.isArray(folder.links)) folder.links = links;
        const nodeIds = new Set(nodes.map((node) => text(node?.id, '')).filter(Boolean));
        let rootId = text(folder.rootId, '');
        let changed = false;

        if (!nodeIds.size && links.length) {
            const syntheticRootId = buildSyntheticDetachedRootId(entry, nodeIds);
            const syntheticRoot = {
                id: syntheticRootId,
                parentId: null,
                name: text(entry?.label, 'Detached Chain'),
                order: 1,
                createdAt: Number(entry?.parkedAt) || Date.now(),
                updatedAt: Number(entry?.parkedAt) || Date.now(),
                clickBehaviorMode: 'inherit',
                taskMode: 'inherit'
            };
            nodes.push(syntheticRoot);
            folder.nodes = nodes;
            folder.rootId = syntheticRootId;
            nodeIds.add(syntheticRootId);
            rootId = syntheticRootId;
            changed = true;
        }

        if ((!rootId || !nodeIds.has(rootId)) && nodes.length) {
            const fallbackRoot = nodes.find((node) => !text(node?.parentId, '')) || nodes[0];
            const fallbackRootId = text(fallbackRoot?.id, '');
            if (fallbackRootId && fallbackRootId !== rootId) {
                folder.rootId = fallbackRootId;
                rootId = fallbackRootId;
                changed = true;
            }
        }

        if (!rootId) return changed;

        nodes.forEach((node) => {
            const nodeId = text(node?.id, '');
            const parentId = text(node?.parentId, '');
            if (!nodeId) return;
            if (nodeId === rootId) {
                if (parentId) {
                    node.parentId = null;
                    changed = true;
                }
                return;
            }
            if (parentId && !nodeIds.has(parentId)) {
                node.parentId = rootId;
                changed = true;
            }
        });

        links.forEach((link) => {
            const folderId = text(link?.folderId, '');
            if (folderId && nodeIds.has(folderId)) return;
            if (link?.folderId !== rootId) {
                link.folderId = rootId;
                changed = true;
            }
        });

        return changed;
    }

    function normalizeDetachedStore(store) {
        let changed = false;
        Object.keys(store || {}).forEach((workspaceId) => {
            const bucket = Array.isArray(store[workspaceId]) ? store[workspaceId] : [];
            bucket.forEach((entry) => {
                if (normalizeDetachedFolderEntry(entry)) changed = true;
            });
        });
        return changed;
    }

    function syncDetachedStore(store) {
        const nextStore = setDetachedStore(store);
        if (normalizeDetachedStore(nextStore)) {
            try {
                window.localStorage?.setItem(detached.STORAGE_KEY, JSON.stringify(nextStore));
            } catch (error) {
            }
        }
        return nextStore;
    }

    function getDetachedStore() {
        if (window.eveState?.constellationDetachedChains && typeof window.eveState.constellationDetachedChains === 'object') {
            return syncDetachedStore(window.eveState.constellationDetachedChains);
        }
        if (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object') {
            return syncDetachedStore(window.constellationDetachedChains);
        }
        try {
            const raw = window.localStorage?.getItem(detached.STORAGE_KEY);
            if (raw) return syncDetachedStore(JSON.parse(raw) || {});
        } catch (error) {
        }
        return syncDetachedStore({});
    }

    function persistDetachedStore() {
        const store = getDetachedStore();
        try {
            window.localStorage?.setItem(detached.STORAGE_KEY, JSON.stringify(store));
        } catch (error) {
        }
        if (typeof saveData === 'function') {
            saveData({
                skipRender: true,
                skipSuggestions: true,
                source: 'constellation-detached-store-updated',
                meta: { nonIndexing: true, constellation: true }
            });
        }
        return store;
    }

    function getDragPayload(dataTransfer) {
        const raw = dataTransfer?.getData('application/json')
            || dataTransfer?.getData('text/plain')
            || '';
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            return { ids: [String(raw)] };
        }
    }

    function stopDropEvent(event) {
        if (!event) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
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
            const removed = bucket.splice(entryIndex, 1)[0] || null;
            if (!bucket.length) delete store[workspaceId];
            return removed;
        }
        return null;
    }

    function syncLinkToLibrary(linkId) {
        const syncFromLink = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
        if (typeof syncFromLink === 'function') {
            syncFromLink(linkId);
        }
    }

    Object.assign(detached, {
        cloneValue,
        getFolderHelpers,
        buildUniqueFolderId,
        remapDetachedFolderPayload,
        getAllLinksRef,
        setDetachedStore,
        buildSyntheticDetachedRootId,
        normalizeDetachedFolderEntry,
        normalizeDetachedStore,
        syncDetachedStore,
        getDetachedStore,
        persistDetachedStore,
        getDragPayload,
        stopDropEvent,
        buildDetachedId,
        ensureWorkspaceBucket,
        getDetachedEntriesForScope,
        getDetachedEntry,
        removeDetachedEntry,
        syncLinkToLibrary
    });
})(window.EveConstellationMap);
