// --- Core Storage Delta + Mutation Helpers ---
function getCoreStorage() {
    return window.EveCoreStorage || EveStorageRuntime.coreStorage || null;
}

function sanitizeLinksForStorage(sourceLinks) {
    return Array.isArray(sourceLinks)
        ? sourceLinks.map((link) => {
            if (!link || typeof link !== 'object') return link;
            const nextLink = { ...link };
            delete nextLink.pinned;
            return nextLink;
        })
        : [];
}

function getBookmarkFoldersForStorage() {
    return (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
        ? bookmarkFolders
        : {};
}

function getQuickPinsForStorage() {
    return (typeof quickPins !== 'undefined' && Array.isArray(quickPins))
        ? quickPins
        : [];
}

function getConstellationDetachedForStorage() {
    return (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object')
        ? window.constellationDetachedChains
        : {};
}

function buildCoreStateSnapshot() {
    return {
        links: sanitizeLinksForStorage(typeof links !== 'undefined' ? links : []),
        bookmarkFolders: getBookmarkFoldersForStorage(),
        quickPins: getQuickPinsForStorage(),
        constellationDetachedChains: getConstellationDetachedForStorage()
    };
}

function buildStateSignature(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        console.warn('Core Storage: Failed to build state signature; forcing save.', error);
        return 'unstable:' + Date.now() + ':' + Math.random();
    }
}

var CORE_DELTA_LIMIT = 300;

function cloneCoreStateForDelta(snapshot, signature) {
    try {
        return JSON.parse(signature || buildStateSignature(snapshot || buildCoreStateSnapshot()));
    } catch (error) {
        return null;
    }
}

function cloneConfigForDelta(nextConfig, signature) {
    try {
        return JSON.parse(signature || buildStateSignature(nextConfig || config || {}));
    } catch (error) {
        return null;
    }
}

function normalizeDeltaText(value, fallback) {
    var normalized = String(value == null ? '' : value).trim();
    return normalized || String(fallback || '').trim();
}

function getDeltaScopedKey(workspaceId, categoryName) {
    return normalizeDeltaText(workspaceId, 'main') + '::' + normalizeDeltaText(categoryName, 'Unsorted');
}

function splitDeltaScopedKey(scopedKey) {
    var parts = String(scopedKey || '').split('::');
    return {
        workspaceId: normalizeDeltaText(parts.shift(), 'main'),
        categoryName: normalizeDeltaText(parts.join('::'), 'Unsorted')
    };
}

function addDeltaScope(scopeMap, workspaceId, categoryName) {
    var scope = splitDeltaScopedKey(getDeltaScopedKey(workspaceId, categoryName));
    scopeMap[scope.workspaceId + '::' + scope.categoryName] = scope;
}

function addDeltaLinkScope(scopeMap, folderIds, link) {
    if (!link || typeof link !== 'object') return;
    addDeltaScope(scopeMap, link.workspace, link.category);
    var folderId = normalizeDeltaText(link.folderId, '');
    if (folderId) folderIds[folderId] = true;
}

function buildLinkMapForDelta(linkList) {
    var map = {};
    (Array.isArray(linkList) ? linkList : []).forEach(function (link) {
        var linkId = normalizeDeltaText(link && link.id, '');
        if (!linkId) return;
        map[linkId] = link;
    });
    return map;
}

function pushDeltaSet(target, value) {
    var normalized = normalizeDeltaText(value, '');
    if (normalized) target[normalized] = true;
}

function toCappedDeltaList(setLike, state) {
    var values = Object.keys(setLike || {});
    if (values.length > CORE_DELTA_LIMIT) {
        state.complete = false;
        return values.slice(0, CORE_DELTA_LIMIT);
    }
    return values;
}

function collectWorkspaceIdsForConfigDelta(workspaces, target) {
    (Array.isArray(workspaces) ? workspaces : []).forEach(function (workspace) {
        var id = normalizeDeltaText(workspace && workspace.id, '');
        if (id) target[id] = true;
        collectWorkspaceIdsForConfigDelta(workspace && workspace.subTabs, target);
    });
}

function buildConfigDelta(previousConfig, nextConfig) {
    var completeState = { complete: !!previousConfig };
    var previous = previousConfig && typeof previousConfig === 'object' ? previousConfig : {};
    var next = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
    var changedKeys = {};
    var workspaceIds = {};
    var keys = {};
    Object.keys(previous).forEach(function (key) { keys[key] = true; });
    Object.keys(next).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (key) {
        var changed = false;
        try {
            changed = JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
        } catch (error) {
            changed = true;
        }
        if (!changed) return;
        pushDeltaSet(changedKeys, key);
        if (key === 'workspaces') {
            collectWorkspaceIdsForConfigDelta(previous[key], workspaceIds);
            collectWorkspaceIdsForConfigDelta(next[key], workspaceIds);
        }
    });
    var deltaChangedKeys = toCappedDeltaList(changedKeys, completeState);
    var deltaWorkspaceIds = toCappedDeltaList(workspaceIds, completeState);
    return {
        kind: 'core-config-delta',
        complete: !!completeState.complete,
        changedKeys: deltaChangedKeys,
        workspaceIds: deltaWorkspaceIds
    };
}

function buildStoreSignatureMapForDelta(store) {
    var map = {};
    Object.keys(store || {}).forEach(function (key) {
        try {
            map[key] = JSON.stringify(store[key]);
        } catch (error) {
            map[key] = 'unstable';
        }
    });
    return map;
}

function collectChangedFolderScopesForDelta(previousFolders, nextFolders, scopeMap) {
    var previousMap = buildStoreSignatureMapForDelta(previousFolders);
    var nextMap = buildStoreSignatureMapForDelta(nextFolders);
    var changed = false;
    var keys = {};
    Object.keys(previousMap).forEach(function (key) { keys[key] = true; });
    Object.keys(nextMap).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (scopedKey) {
        if (previousMap[scopedKey] === nextMap[scopedKey]) return;
        changed = true;
        var scope = splitDeltaScopedKey(scopedKey);
        addDeltaScope(scopeMap, scope.workspaceId, scope.categoryName);
    });
    return changed;
}

function buildCoreDataDelta(previousSnapshot, nextSnapshot) {
    var completeState = { complete: !!previousSnapshot };
    var linkIds = {};
    var addedLinkIds = {};
    var updatedLinkIds = {};
    var removedLinkIds = {};
    var workspaceIds = {};
    var categoryNames = {};
    var folderIds = {};
    var scopeMap = {};
    var previousLinks = buildLinkMapForDelta(previousSnapshot && previousSnapshot.links);
    var nextLinks = buildLinkMapForDelta(nextSnapshot && nextSnapshot.links);
    var ids = {};

    Object.keys(previousLinks).forEach(function (id) { ids[id] = true; });
    Object.keys(nextLinks).forEach(function (id) { ids[id] = true; });

    Object.keys(ids).forEach(function (linkId) {
        var previousLink = previousLinks[linkId] || null;
        var nextLink = nextLinks[linkId] || null;
        var changed = !previousLink || !nextLink;
        if (!changed) {
            try {
                changed = JSON.stringify(previousLink) !== JSON.stringify(nextLink);
            } catch (error) {
                changed = true;
            }
        }
        if (!changed) return;

        pushDeltaSet(linkIds, linkId);
        if (!previousLink && nextLink) pushDeltaSet(addedLinkIds, linkId);
        else if (previousLink && !nextLink) pushDeltaSet(removedLinkIds, linkId);
        else pushDeltaSet(updatedLinkIds, linkId);

        [previousLink, nextLink].forEach(function (link) {
            if (!link) return;
            pushDeltaSet(workspaceIds, link.workspace || 'main');
            pushDeltaSet(categoryNames, link.category || 'Unsorted');
            addDeltaLinkScope(scopeMap, folderIds, link);
        });
    });

    var hasFolderStoreChanges = collectChangedFolderScopesForDelta(
        previousSnapshot && previousSnapshot.bookmarkFolders,
        nextSnapshot && nextSnapshot.bookmarkFolders,
        scopeMap
    );

    var quickPinsChanged = false;
    var detachedChanged = false;
    try {
        quickPinsChanged = JSON.stringify(previousSnapshot && previousSnapshot.quickPins || []) !== JSON.stringify(nextSnapshot && nextSnapshot.quickPins || []);
    } catch (error) {
        quickPinsChanged = true;
    }
    try {
        detachedChanged = JSON.stringify(previousSnapshot && previousSnapshot.constellationDetachedChains || {}) !== JSON.stringify(nextSnapshot && nextSnapshot.constellationDetachedChains || {});
    } catch (error) {
        detachedChanged = true;
    }

    var affectedScopes = Object.keys(scopeMap).map(function (key) { return scopeMap[key]; });
    if (affectedScopes.length > CORE_DELTA_LIMIT) {
        completeState.complete = false;
        affectedScopes = affectedScopes.slice(0, CORE_DELTA_LIMIT);
    }

    var deltaLinkIds = toCappedDeltaList(linkIds, completeState);
    var deltaAddedLinkIds = toCappedDeltaList(addedLinkIds, completeState);
    var deltaUpdatedLinkIds = toCappedDeltaList(updatedLinkIds, completeState);
    var deltaRemovedLinkIds = toCappedDeltaList(removedLinkIds, completeState);
    var deltaWorkspaceIds = toCappedDeltaList(workspaceIds, completeState);
    var deltaCategoryNames = toCappedDeltaList(categoryNames, completeState);
    var deltaFolderIds = toCappedDeltaList(folderIds, completeState);

    return {
        kind: 'core-data-delta',
        complete: !!completeState.complete,
        linkIds: deltaLinkIds,
        addedLinkIds: deltaAddedLinkIds,
        updatedLinkIds: deltaUpdatedLinkIds,
        removedLinkIds: deltaRemovedLinkIds,
        workspaceIds: deltaWorkspaceIds,
        categoryNames: deltaCategoryNames,
        folderIds: deltaFolderIds,
        affectedScopes: affectedScopes,
        hasFolderStoreChanges: !!hasFolderStoreChanges,
        hasQuickPinChanges: !!quickPinsChanged,
        hasConstellationChanges: !!detachedChanged
    };
}

function buildStateMutationMeta(baseMeta, delta, configDelta) {
    var meta = baseMeta && typeof baseMeta === 'object' ? Object.assign({}, baseMeta) : {};
    if (delta) meta.dataDelta = delta;
    if (configDelta) meta.configDelta = configDelta;
    return Object.keys(meta).length ? meta : null;
}

var _stateMutationSequence = 0;

function normalizeMutationSource(source, fallback) {
    var normalized = String(source || '').trim();
    return normalized || fallback || 'state-mutated';
}

function dispatchStateMutation(source, detail) {
    if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    _stateMutationSequence += 1;
    window.dispatchEvent(new CustomEvent('eve:state-mutated', {
        detail: Object.assign({
            source: normalizeMutationSource(source, 'state-mutated'),
            dirty: true,
            mutationSeq: _stateMutationSequence,
            at: Date.now()
        }, detail || {})
    }));
}
