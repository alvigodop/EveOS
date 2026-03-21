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
                window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(nextStore));
            } catch (error) {
                // ignore direct storage failures in restricted contexts
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
            const raw = window.localStorage?.getItem(STORAGE_KEY);
            if (raw) return syncDetachedStore(JSON.parse(raw) || {});
        } catch (error) {
            // ignore storage failures in file:// or private contexts
        }
        return syncDetachedStore({});
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

    function parkLinksByIds(linkIds) {
        const liveLinks = getAllLinksRef();
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!linkIdSet.size || !Array.isArray(liveLinks)) return [];

        const movedLinks = [];
        for (let index = liveLinks.length - 1; index >= 0; index -= 1) {
            const liveLink = liveLinks[index];
            if (!linkIdSet.has(text(liveLink?.id, ''))) continue;
            movedLinks.unshift(cloneValue(liveLink));
            liveLinks.splice(index, 1);
        }

        if (!movedLinks.length) return [];

        movedLinks.forEach((clonedLink) => {
            const workspaceId = text(clonedLink?.workspace, 'main');
            const categoryName = text(clonedLink?.category, 'Unsorted');
            const bucket = ensureWorkspaceBucket(workspaceId);
            bucket.push({
                id: buildDetachedId('link'),
                kind: 'link',
                workspaceId,
                originCategoryName: categoryName,
                parkingCategoryName: PARKING_CATEGORY_NAME,
                parkedAt: Date.now(),
                label: text(clonedLink?.title, 'Bookmark'),
                link: clonedLink
            });
        });

        persistDetachedStore();
        return movedLinks;
    }

    function extractDetachedLinks(entry, linkIds) {
        const linkIdSet = new Set((Array.isArray(linkIds) ? linkIds : []).map((id) => text(id, '')).filter(Boolean));
        if (!entry || !linkIdSet.size) return [];

        if (entry.kind === 'link') {
            const detachedLink = cloneValue(entry.link || {});
            const detachedLinkId = text(detachedLink?.id, '');
            if (!detachedLinkId || !linkIdSet.has(detachedLinkId)) return [];
            removeDetachedEntry(text(entry.id, ''));
            return [detachedLink];
        }

        if (entry.kind !== 'folder') return [];

        const nextLinks = [];
        const movedLinks = [];
        (Array.isArray(entry.folder?.links) ? entry.folder.links : []).forEach((link) => {
            const linkId = text(link?.id, '');
            if (linkIdSet.has(linkId)) {
                movedLinks.push(cloneValue(link));
                return;
            }
            nextLinks.push(link);
        });

        if (!movedLinks.length) return [];

        entry.folder = entry.folder || { rootId: '', nodes: [], links: [] };
        entry.folder.links = nextLinks;
        return movedLinks;
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

    function moveDetachedLinksToEntry(sourceEntryId, linkIds, targetEntryId, targetFolderId) {
        const sourceEntry = getDetachedEntry(sourceEntryId);
        const targetEntry = getDetachedEntry(targetEntryId);
        if (!sourceEntry || !targetEntry || targetEntry.kind !== 'folder') return null;

        const normalizedTargetFolderId = text(targetFolderId, '');
        if (normalizedTargetFolderId) {
            const targetExists = (Array.isArray(targetEntry.folder?.nodes) ? targetEntry.folder.nodes : [])
                .some((node) => text(node?.id, '') === normalizedTargetFolderId);
            if (!targetExists) return null;
        }

        const movedLinks = extractDetachedLinks(sourceEntry, linkIds);
        if (!movedLinks.length) return null;

        targetEntry.folder = targetEntry.folder || { rootId: '', nodes: [], links: [] };
        const targetLinks = Array.isArray(targetEntry.folder.links) ? targetEntry.folder.links : [];
        movedLinks.forEach((link) => {
            link.folderId = normalizedTargetFolderId;
            targetLinks.push(link);
        });
        targetEntry.folder.links = targetLinks;

        persistDetachedStore();
        return {
            selectionId: 'detached_link_' + text(targetEntry.id, '') + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' detached bookmarks.')
                : 'Detached bookmark moved.'
        };
    }

    function moveDetachedLinksToParking(sourceEntryId, linkIds) {
        const sourceEntry = getDetachedEntry(sourceEntryId);
        if (!sourceEntry) return null;

        const movedLinks = extractDetachedLinks(sourceEntry, linkIds);
        if (!movedLinks.length) return null;

        const workspaceId = text(sourceEntry.workspaceId, 'main');
        const bucket = ensureWorkspaceBucket(workspaceId);
        let firstEntryId = '';
        movedLinks.forEach((link) => {
            const entryId = buildDetachedId('link');
            if (!firstEntryId) firstEntryId = entryId;
            bucket.push({
                id: entryId,
                kind: 'link',
                workspaceId,
                originCategoryName: text(link?.category, sourceEntry.originCategoryName || 'Unsorted'),
                parkingCategoryName: PARKING_CATEGORY_NAME,
                parkedAt: Date.now(),
                label: text(link?.title, 'Bookmark'),
                link
            });
        });

        persistDetachedStore();
        return {
            selectionId: 'detached_link_' + firstEntryId + '_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Moved ' + movedLinks.length + ' bookmarks to detached root.')
                : 'Bookmark moved to detached root.'
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

    function restoreDetachedLinks(entryId, linkIds, targetSpec) {
        const entry = getDetachedEntry(entryId);
        if (!entry || !targetSpec) return null;

        const targetWorkspaceId = text(targetSpec?.workspaceId, 'main');
        const targetCategoryName = text(targetSpec?.categoryName, 'Unsorted');
        const targetFolderId = text(targetSpec?.folderId || targetSpec?.targetParentId, '');
        const movedLinks = extractDetachedLinks(entry, linkIds);
        if (!movedLinks.length) return null;

        const liveLinks = getAllLinksRef();
        movedLinks.forEach((link) => {
            link.workspace = targetWorkspaceId;
            link.category = targetCategoryName;
            if (targetFolderId) link.folderId = targetFolderId;
            else delete link.folderId;
            liveLinks.push(link);
            syncLinkToLibrary(link.id);
        });

        persistDetachedStore();
        return {
            selectionId: 'link_' + text(movedLinks[0]?.id, ''),
            message: movedLinks.length > 1
                ? ('Restored ' + movedLinks.length + ' detached bookmarks.')
                : (targetFolderId ? 'Detached bookmark attached to a folder.' : 'Detached bookmark attached to a card.')
        };
    }

    function handleDetachedLinkDragStart(event, entryId, linkId) {
        if (!event?.dataTransfer) return;
        event.stopPropagation();
        const payload = JSON.stringify({
            type: 'detached-link',
            entryId: text(entryId, ''),
            linkId: text(linkId, '')
        });
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (event.target?.classList) event.target.classList.add('is-dragging');
        }, 0);
    }

    function handleDetachedFolderDragStart(event, entryId, folderId) {
        if (!event?.dataTransfer) return;
        event.stopPropagation();
        const payload = JSON.stringify({
            type: 'detached-folder',
            entryId: text(entryId, ''),
            folderId: text(folderId, ''),
            detachedRoot: true
        });
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (event.target?.classList) event.target.classList.add('is-dragging');
        }, 0);
    }

    function handleDashboardParkingDrop(event, workspaceId) {
        stopDropEvent(event);
        const payload = getDragPayload(event?.dataTransfer);
        if (!payload) return false;

        let result = null;
        if (Array.isArray(payload?.ids) && payload.ids.length) {
            const parked = parkLinksByIds(payload.ids);
            result = parked.length ? { message: parked.length > 1 ? ('Moved ' + parked.length + ' bookmarks into detached parking.') : 'Bookmark moved into detached parking.' } : null;
        } else if (payload?.type === 'folder' && payload.id) {
            const entry = parkFolderSubtree(payload.sourceWorkspace, payload.sourceCategory, payload.id);
            result = entry ? { message: 'Folder chain moved into detached parking.' } : null;
        } else if (payload?.type === 'detached-link' && payload.entryId && payload.linkId) {
            result = moveDetachedLinksToParking(payload.entryId, [payload.linkId]);
        }

        if (!result) return false;
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.showToast === 'function' && result.message) window.showToast(result.message, 'success');
        return true;
    }

    function handleDashboardDetachedFolderDrop(event, targetEntryId, targetFolderId) {
        stopDropEvent(event);
        const payload = getDragPayload(event?.dataTransfer);
        if (!payload) return false;

        let result = null;
        if (Array.isArray(payload?.ids) && payload.ids.length) {
            result = attachLiveLinksToEntry(targetEntryId, payload.ids, targetFolderId);
        } else if (payload?.type === 'folder' && payload.id) {
            result = attachLiveFolderToEntry(
                targetEntryId,
                payload.sourceWorkspace,
                payload.sourceCategory,
                payload.id,
                targetFolderId
            );
        } else if (payload?.type === 'detached-link' && payload.entryId && payload.linkId) {
            result = moveDetachedLinksToEntry(payload.entryId, [payload.linkId], targetEntryId, targetFolderId);
        }

        if (!result) return false;
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.showToast === 'function' && result.message) window.showToast(result.message, 'success');
        return true;
    }

    ns._detached = ns._detached || {};
    Object.assign(ns._detached, {
        STORAGE_KEY,
        PARKING_CATEGORY_NAME,
        getDetachedStore,
        getDetachedEntriesForScope,
        getDetachedEntry,
        parkLink,
        parkLinksByIds,
        parkFolderSubtree,
        attachLiveLinksToEntry,
        attachLiveFolderToEntry,
        moveDetachedLinksToEntry,
        moveDetachedLinksToParking,
        restoreDetachedEntry,
        restoreDetachedLinks,
        handleDetachedLinkDragStart,
        handleDetachedFolderDragStart,
        handleDashboardParkingDrop,
        handleDashboardDetachedFolderDrop,
        persistDetachedStore
    });
})(window.EveConstellationMap);
