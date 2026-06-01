window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexExactScopeRuntime) return;

    function create(deps) {
        const shared = deps?.shared || {};
        const runtimeIntegrity = deps?.runtimeIntegrity || {};
        const hasReadableLinkSnapshot = deps?.hasReadableLinkSnapshot;
        const {
            state,
            text,
            toArray
        } = shared;
        const {
            matchesScope,
            buildScopeRecordMatcher
        } = runtimeIntegrity;
        let exactScopeIndexCache = {
            snapshot: null,
            index: null
        };
    function getExactRecordFolderId(record) {
        return text(record?.path?.folderId || record?.parentFolderId || record?.provenance?.parentFolderId, '');
    }

    function getExactRecordLinkId(record) {
        return text(record?.path?.linkId || record?.provenance?.linkId || record?.sourceIdentity?.linkId, '');
    }

    function ensureMapList(map, key) {
        if (!map.has(key)) map.set(key, []);
        return map.get(key);
    }

    function ensureNestedMap(map, key) {
        if (!map.has(key)) map.set(key, new Map());
        return map.get(key);
    }

    function buildExactScopeIndex(snapshot) {
        if (exactScopeIndexCache.snapshot === snapshot && exactScopeIndexCache.index) {
            return exactScopeIndexCache.index;
        }

        const index = {
            cardKeys: [],
            cardKeySet: new Set(),
            bookmarkIdsByCard: new Map(),
            folderChildrenByCard: new Map(),
            bookmarkIdsByFolderByCard: new Map(),
            recordByLinkId: new Map()
        };

        toArray(snapshot?.records).forEach(function (record) {
            const type = text(record?.type, '');
            if (type !== 'bookmark' && type !== 'folder') return;

            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;

            const cardKey = workspaceId + '::' + categoryName;
            if (!index.cardKeySet.has(cardKey)) {
                index.cardKeySet.add(cardKey);
                index.cardKeys.push(cardKey);
            }

            if (type === 'folder') {
                const folderId = text(record?.path?.folderId, '');
                if (!folderId) return;
                const parentFolderId = text(record?.parentFolderId || record?.provenance?.parentFolderId, '');
                const childrenMap = ensureNestedMap(index.folderChildrenByCard, cardKey);
                ensureMapList(childrenMap, parentFolderId).push(folderId);
                return;
            }

            const linkId = getExactRecordLinkId(record);
            if (!linkId) return;
            if (!index.recordByLinkId.has(linkId)) index.recordByLinkId.set(linkId, record);
            ensureMapList(index.bookmarkIdsByCard, cardKey).push(linkId);

            const folderId = getExactRecordFolderId(record);
            if (folderId) {
                const folderMap = ensureNestedMap(index.bookmarkIdsByFolderByCard, cardKey);
                ensureMapList(folderMap, folderId).push(linkId);
            }
        });

        exactScopeIndexCache = {
            snapshot: snapshot,
            index: index
        };
        return index;
    }

    function getExactScopeCardKeys(scopeIndex, workspaceId, categoryName) {
        const lowerWsId = String(workspaceId || '').trim().toLowerCase();
        const lowerCatName = String(categoryName || '').trim().toLowerCase();

        return scopeIndex.cardKeys.filter(function (cardKey) {
            const separatorIndex = cardKey.indexOf('::');
            const keyWorkspaceId = separatorIndex >= 0 ? cardKey.slice(0, separatorIndex) : cardKey;
            const keyCategoryName = separatorIndex >= 0 ? cardKey.slice(separatorIndex + 2) : '';
            if (lowerWsId && keyWorkspaceId.toLowerCase() !== lowerWsId) return false;
            if (lowerCatName && keyCategoryName.toLowerCase() !== lowerCatName) return false;
            return true;
        });
    }

    function buildExactFolderHierarchy(records) {
        const childrenByFolderId = new Map();

        toArray(records).forEach(function (record) {
            if (text(record?.type, '') !== 'folder') return;
            const folderId = text(record?.path?.folderId, '');
            if (!folderId) return;
            const parentFolderId = text(record?.parentFolderId || record?.provenance?.parentFolderId, '');
            if (!childrenByFolderId.has(parentFolderId)) childrenByFolderId.set(parentFolderId, []);
            childrenByFolderId.get(parentFolderId).push(folderId);
        });

        return {
            childrenByFolderId: childrenByFolderId
        };
    }

    function collectExactFolderSubtree(folderId, hierarchy) {
        const subtree = new Set();
        const rootId = text(folderId, '');
        if (!rootId) return subtree;
        const queue = [rootId];
        while (queue.length) {
            const currentId = text(queue.shift(), '');
            if (!currentId || subtree.has(currentId)) continue;
            subtree.add(currentId);
            toArray(hierarchy?.childrenByFolderId?.get(currentId)).forEach(function (childId) {
                if (!subtree.has(childId)) queue.push(childId);
            });
        }
        return subtree;
    }

    function getScopedBookmarkLinkIds(scope) {
        const snapshot = state.snapshot;
        if (!snapshot || !hasReadableLinkSnapshot()) return [];

        const inScope = typeof buildScopeRecordMatcher === 'function'
            ? buildScopeRecordMatcher(snapshot, scope || null)
            : function (record) { return matchesScope(record, scope || null); };
        const linkIds = [];
        const seen = new Set();

        toArray(snapshot.records).forEach(function (record) {
            if (text(record?.type, '') !== 'bookmark' || !inScope(record)) return;
            const linkId = text(record?.path?.linkId || record?.provenance?.linkId || record?.sourceIdentity?.linkId, '');
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            linkIds.push(linkId);
        });

        return linkIds;
    }

    function getExactBookmarkLinkIds(scope) {
        const snapshot = state.snapshot;
        if (!snapshot || !hasReadableLinkSnapshot()) return [];

        const workspaceId = text(scope?.workspaceId, '');
        const categoryName = text(scope?.categoryName, '');
        const folderId = text(scope?.folderId, '');
        const scopeIndex = buildExactScopeIndex(snapshot);
        const cardKeys = getExactScopeCardKeys(scopeIndex, workspaceId, categoryName);
        const linkIds = [];
        const seen = new Set();

        function pushLinkId(linkId) {
            const normalizedLinkId = text(linkId, '');
            if (!normalizedLinkId || seen.has(normalizedLinkId)) return;
            seen.add(normalizedLinkId);
            linkIds.push(normalizedLinkId);
        }

        cardKeys.forEach(function (cardKey) {
            if (folderId) {
                const allowedFolderIds = collectExactFolderSubtree(folderId, {
                    childrenByFolderId: scopeIndex.folderChildrenByCard.get(cardKey) || new Map()
                });
                if (!allowedFolderIds.size) return;
                const folderMap = scopeIndex.bookmarkIdsByFolderByCard.get(cardKey) || new Map();
                allowedFolderIds.forEach(function (allowedFolderId) {
                    toArray(folderMap.get(allowedFolderId)).forEach(pushLinkId);
                });
                return;
            }
            toArray(scopeIndex.bookmarkIdsByCard.get(cardKey)).forEach(pushLinkId);
        });

        return linkIds;
    }

    function getIndexedBookmarkRecordByLinkId(linkId) {
        const snapshot = state.snapshot;
        if (!snapshot || !hasReadableLinkSnapshot()) return null;

        const normalizedLinkId = text(linkId, '');
        if (!normalizedLinkId) return null;

        return buildExactScopeIndex(snapshot).recordByLinkId.get(normalizedLinkId) || null;
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (typeof window.links !== 'undefined' && Array.isArray(window.links)) return window.links;
        return [];
    }

    function buildBookmarkLinkFallback(record, linkId) {
        if (!record) return null;
        return {
            id: text(linkId, ''),
            title: text(record?.title, 'Untitled'),
            url: text(record?.url, ''),
            category: text(record?.categoryName, ''),
            workspace: text(record?.workspaceId, ''),
            done: !!record?.provenance?.done,
            folderId: text(record?.path?.folderId, ''),
            notes: text(record?.description, ''),
            tags: toArray(record?.provenance?.tags),
            identifiers: toArray(record?.provenance?.identifiers),
            icon: text(record?.provenance?.icon, ''),
            coverImage: text(record?.provenance?.coverImage, ''),
            priority: text(record?.provenance?.priority, '')
        };
    }

    function resolveBookmarkLink(linkId) {
        const normalizedLinkId = text(linkId, '');
        if (!normalizedLinkId) return null;

        const liveLink = getLiveLinks().find(function (link) {
            return text(link?.id, '') === normalizedLinkId;
        }) || null;
        if (liveLink) return liveLink;

        return buildBookmarkLinkFallback(getIndexedBookmarkRecordByLinkId(normalizedLinkId), normalizedLinkId);
    }
        return {
            getScopedBookmarkLinkIds,
            getExactBookmarkLinkIds,
            getIndexedBookmarkRecordByLinkId,
            resolveBookmarkLink
        };
    }

    ns.IndexExactScopeRuntime = { create };
})();