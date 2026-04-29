window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const shared = ns.IndexShared;
    const sources = ns.IndexRecordBuildersSources;
    const runtimeIntegrity = ns.IndexRuntimeIntegrity;
    const runtimeSummary = ns.IndexRuntimeSummary;
    if (!shared || !sources || !runtimeIntegrity || !runtimeSummary) return;

    const {
        STORAGE_KEY,
        STORAGE_MANAGER_KEY,
        SNAPSHOT_MAX_AGE_MS,
        SEARCH_STORAGE_KEYS,
        INCREMENTAL_LOCAL_RECORD_TYPES,
        state,
        now,
        text,
        normalizeText,
        toArray,
        computeFreshness,
        readConfig,
        buildFolderPathLabel
    } = shared;
    const buildDatapackStateFingerprint = typeof shared.buildDatapackStateFingerprint === 'function'
        ? shared.buildDatapackStateFingerprint
        : function () { return ''; };
    const {
        buildSnapshot,
        buildLocalRecordBundle,
        buildScopedLocalRecordBundle,
        buildSourceRecordBundle,
        buildSnapshotStats,
        filterCategoryMap,
        rehydrateSourceRecords
    } = sources;
    const {
        matchesScope,
        buildScopeRecordMatcher,
        computeVisibility,
        computeHealth,
        diagnoseRecord,
        buildIntegrityReportSync
    } = runtimeIntegrity;
    const { buildStructureSummary } = runtimeSummary;
    let exactScopeIndexCache = {
        snapshot: null,
        index: null
    };
    const INDEX_RELEVANT_CONFIG_KEYS = new Set([
        'workspaces',
        'categoryOrder',
        'categoryOrderByWorkspace',
        'hideStats',
        'smartCardWeights',
        'bookmarkIdentifiers'
    ]);

    async function loadPersistedSnapshot() {
        if (state.loaded) return state.snapshot;
        state.loaded = true;

        let snapshot = null;
        try {
            if (window.StorageManager?.loadDataAsync) {
                snapshot = await window.StorageManager.loadDataAsync(STORAGE_MANAGER_KEY, null, null);
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager load failed:', error);
        }

        if (!snapshot) {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                snapshot = raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.warn('[NexusIndex] localStorage load failed:', error);
            }
        }

        if (snapshot?.version === shared.INDEX_VERSION && Array.isArray(snapshot.records)) {
            const currentFingerprint = buildDatapackStateFingerprint();
            const snapshotFingerprint = text(snapshot.datapackFingerprint, '');
            if (currentFingerprint && snapshotFingerprint && snapshotFingerprint !== currentFingerprint) {
                state.snapshot = null;
                state.dirty = true;
                state.lastReason = 'datapack-fingerprint-mismatch';
                state.datapackFingerprint = currentFingerprint;
                return state.snapshot;
            }
            if (currentFingerprint && !snapshotFingerprint) {
                state.snapshot = null;
                state.dirty = true;
                state.lastReason = 'datapack-fingerprint-missing';
                state.datapackFingerprint = currentFingerprint;
                return state.snapshot;
            }
            state.snapshot = snapshot;
            state.dirty = false;
            state.datapackFingerprint = snapshotFingerprint || currentFingerprint;
        }

        return state.snapshot;
    }

    async function persistSnapshot(snapshot) {
        let savedToPrimaryStorage = false;
        try {
            if (window.StorageManager?.saveDataAsync) {
                await window.StorageManager.saveDataAsync(STORAGE_MANAGER_KEY, snapshot, null);
                savedToPrimaryStorage = true;
            }
        } catch (error) {
            console.warn('[NexusIndex] StorageManager save failed:', error);
        }

        if (savedToPrimaryStorage) return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch (error) {
            if (!(error && error.name === 'QuotaExceededError')) {
                console.warn('[NexusIndex] localStorage save failed:', error);
            }
        }
    }

    function normalizeMutationMeta(meta) {
        if (!meta || typeof meta !== 'object') return null;
        const categoryName = text(meta.categoryName, '');
        const sourceKey = text(meta.sourceKey, '');
        const query = text(meta.query, '');
        const workspaceId = text(meta.workspaceId, '');
        const folderId = text(meta.folderId, '');
        const linkId = text(meta.linkId, '');
        const kind = text(meta.kind, '');
        const dragType = text(meta.dragType, '');
        const dragId = text(meta.dragId, '');
        const nonIndexing = !!meta.nonIndexing;
        const quickPins = !!meta.quickPins;
        const constellation = !!meta.constellation;
        const dataDelta = meta.dataDelta && typeof meta.dataDelta === 'object' ? meta.dataDelta : null;
        const configDelta = meta.configDelta && typeof meta.configDelta === 'object' ? meta.configDelta : null;
        if (!categoryName && !sourceKey && !query && !workspaceId && !folderId && !linkId && !kind && !dragType && !dragId && !nonIndexing && !quickPins && !constellation && !dataDelta && !configDelta) return null;
        return {
            categoryName: categoryName,
            sourceKey: sourceKey,
            query: query,
            workspaceId: workspaceId,
            folderId: folderId,
            linkId: linkId,
            kind: kind,
            dragType: dragType,
            dragId: dragId,
            nonIndexing: nonIndexing,
            quickPins: quickPins,
            constellation: constellation,
            dataDelta: dataDelta,
            configDelta: configDelta
        };
    }

    function resolveMutationCategoryName(explicitCategoryName, fallbackContext) {
        const explicit = text(explicitCategoryName, '');
        if (explicit) return explicit;
        const currentCategory = text(window.currentCategoryCtx, '');
        if (currentCategory) return currentCategory;
        return text(fallbackContext, '');
    }

    function markDirty(reason, mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const invalidationPlan = classifyInvalidationPlan(reason, normalizedMeta);
        state.lastInvalidationPlan = invalidationPlan;
        if (!invalidationPlan.dirty) return;
        state.revision = Number(state.revision || 0) + 1;
        state.dirty = true;
        state.lastReason = text(reason, 'state-mutated');
        state.lastMutationMeta = normalizedMeta;
    }

    function isSourceDrivenReason(reason) {
        const normalizedReason = text(reason, '');
        return normalizedReason === 'cache-store-query'
            || normalizedReason === 'cache-store-pool'
            || normalizedReason.startsWith('scoped-storage:')
            || normalizedReason.startsWith('storage-save:');
    }

    function shouldTrackStorageKey(key) {
        const normalized = text(key, '');
        return !!normalized && normalized !== STORAGE_MANAGER_KEY && SEARCH_STORAGE_KEYS.has(normalized);
    }

    function wrapMutationMethod(target, methodName, onSuccess) {
        if (!target || typeof target[methodName] !== 'function') return false;
        const original = target[methodName];
        if (original.__nexusIndexWrapped) return true;

        const wrapped = function () {
            const args = Array.prototype.slice.call(arguments);
            const result = original.apply(this, args);
            if (result && typeof result.then === 'function') {
                return result.then(function (value) {
                    onSuccess(args, value);
                    return value;
                });
            }
            onSuccess(args, result);
            return result;
        };

        wrapped.__nexusIndexWrapped = true;
        wrapped.__nexusIndexOriginal = original;
        target[methodName] = wrapped;
        return true;
    }

    function installMutationHooks() {
        const searchInternals = window.EveOS?.API?.SearchInternals;
        wrapMutationMethod(searchInternals || {}, 'saveScopedStorageValueAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('scoped-storage:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        window.StorageManager?.categoryContext
                    )
                });
            }
        });

        const cacheApi = window.EveOS?.API?.Cache;
        wrapMutationMethod(cacheApi || {}, 'storeQuery', function (args) {
            markDirty('cache-store-query', {
                sourceKey: 'cache-store-query',
                categoryName: resolveMutationCategoryName(
                    args?.[2],
                    window.StorageManager?.categoryContext
                ),
                query: text(args?.[0], '')
            });
        });
        wrapMutationMethod(cacheApi || {}, 'storePool', function (args) {
            markDirty('cache-store-pool', {
                sourceKey: 'cache-store-pool',
                categoryName: resolveMutationCategoryName(
                    args?.[1],
                    window.StorageManager?.categoryContext
                )
            });
        });

        const storageManager = window.StorageManager;
        wrapMutationMethod(storageManager || {}, 'saveDataAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        storageManager?.categoryContext
                    )
                });
            }
        });
        wrapMutationMethod(storageManager || {}, 'saveData', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) {
                markDirty('storage-save:' + key, {
                    sourceKey: key,
                    categoryName: resolveMutationCategoryName(
                        args?.[2],
                        storageManager?.categoryContext
                    )
                });
            }
        });
    }

    function finalizeSnapshot(snapshot, reason, startRevision, mutationMeta) {
        const fingerprint = buildDatapackStateFingerprint();
        const finalizedSnapshot = Object.assign({}, snapshot, {
            datapackFingerprint: fingerprint || text(snapshot?.datapackFingerprint, '')
        });
        state.snapshot = finalizedSnapshot;
        state.datapackFingerprint = finalizedSnapshot.datapackFingerprint;
        if (Number(state.revision || 0) === startRevision) {
            state.dirty = false;
            state.lastReason = reason;
            state.lastMutationMeta = normalizeMutationMeta(mutationMeta);
        }
        return persistSnapshot(finalizedSnapshot).then(function () {
            return finalizedSnapshot;
        });
    }

    function scheduleFollowUpBuild() {
        if (!state.dirty) return;
        setTimeout(function () {
            if (!state.buildPromise && state.dirty) {
                ensureFresh({
                    reason: state.lastReason,
                    mutationMeta: state.lastMutationMeta
                });
            }
        }, 0);
    }

    function buildIncrementalSnapshot(reason) {
        const localBundle = buildLocalRecordBundle();
        const preservedSourceRecords = rehydrateSourceRecords(
            toArray(state.snapshot?.records).filter(function (record) {
                return !INCREMENTAL_LOCAL_RECORD_TYPES.has(text(record?.type, ''));
            }),
            localBundle.categoryMap
        );
        const records = []
            .concat(localBundle.records)
            .concat(preservedSourceRecords);

        return {
            version: shared.INDEX_VERSION,
            builtAt: now(),
            reason: text(reason, 'manual'),
            stats: buildSnapshotStats(records),
            records: records
        };
    }

    async function buildSourceIncrementalSnapshot(reason, mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const affectedCategoryName = text(normalizedMeta?.categoryName, '');
        if (!affectedCategoryName) {
            return await buildSnapshot(reason);
        }

        const sourceKey = text(normalizedMeta?.sourceKey, '');
        const includeCached = sourceKey === 'cache-store-query' || sourceKey === 'cache-store-pool' || !sourceKey;
        const includeKnowledge = true;

        const localBundle = buildLocalRecordBundle();
        const affectedCategoryMap = filterCategoryMap(localBundle.categoryMap, [affectedCategoryName]);
        const refreshedSourceBundle = await buildSourceRecordBundle(affectedCategoryMap, {
            includeKnowledge: includeKnowledge,
            includeCached: includeCached
        });
        const preservedSourceRecords = rehydrateSourceRecords(
            toArray(state.snapshot?.records).filter(function (record) {
                const type = text(record?.type, '');
                if (type !== 'knowledge' && type !== 'cached') return false;
                if (text(record?.categoryName, '') !== affectedCategoryName) return true;
                if (type === 'knowledge') return !includeKnowledge;
                if (type === 'cached') return !includeCached;
                return false;
            }),
            localBundle.categoryMap
        );
        const records = []
            .concat(localBundle.records)
            .concat(preservedSourceRecords)
            .concat(refreshedSourceBundle.records);

        return {
            version: shared.INDEX_VERSION,
            builtAt: now(),
            reason: text(reason, 'manual'),
            stats: buildSnapshotStats(records),
            records: records
        };
    }

    function getMutationDataDelta(mutationMeta) {
        const delta = mutationMeta?.dataDelta;
        return delta && typeof delta === 'object' && text(delta.kind, '') === 'core-data-delta'
            ? delta
            : null;
    }

    function getMutationConfigDelta(mutationMeta) {
        const delta = mutationMeta?.configDelta;
        return delta && typeof delta === 'object' && text(delta.kind, '') === 'core-config-delta'
            ? delta
            : null;
    }

    function isNonIndexingCoreDelta(reason, mutationMeta) {
        const delta = getMutationDataDelta(mutationMeta);
        if (delta) {
            const hasIndexScope = toArray(delta.linkIds).length
                || toArray(delta.affectedScopes).length
                || !!delta.hasFolderStoreChanges;
            if (hasIndexScope) return false;
            if (mutationMeta?.nonIndexing || mutationMeta?.quickPins || mutationMeta?.constellation) return true;
            return text(reason, '') === 'saveData'
                || text(reason, '').indexOf('quick-pins') !== -1
                || text(reason, '').indexOf('constellation-detached') !== -1;
        }

        const configDelta = getMutationConfigDelta(mutationMeta);
        if (!configDelta) {
            return !!(mutationMeta?.nonIndexing || mutationMeta?.quickPins || mutationMeta?.constellation);
        }
        const changedKeys = toArray(configDelta.changedKeys).map(function (key) {
            return text(key, '');
        }).filter(Boolean);
        if (!changedKeys.length) return true;
        return !changedKeys.some(function (key) {
            return INDEX_RELEVANT_CONFIG_KEYS.has(key);
        });
    }

    function pushAffectedScope(output, seen, workspaceId, categoryName) {
        const normalizedWorkspaceId = text(workspaceId, '');
        const normalizedCategoryName = text(categoryName, '');
        if (!normalizedWorkspaceId && !normalizedCategoryName) return;
        const key = normalizedWorkspaceId + '::' + normalizedCategoryName;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({
            workspaceId: normalizedWorkspaceId,
            categoryName: normalizedCategoryName
        });
    }

    function getDeltaAffectedScopes(delta) {
        const scopes = [];
        const seen = new Set();
        toArray(delta?.affectedScopes).forEach(function (scope) {
            pushAffectedScope(scopes, seen, scope?.workspaceId, scope?.categoryName);
        });

        if (scopes.length) return scopes;

        const workspaceIds = toArray(delta?.workspaceIds)
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        const categoryNames = toArray(delta?.categoryNames)
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        if (workspaceIds.length && categoryNames.length && workspaceIds.length * categoryNames.length <= 80) {
            workspaceIds.forEach(function (workspaceId) {
                categoryNames.forEach(function (categoryName) {
                    pushAffectedScope(scopes, seen, workspaceId, categoryName);
                });
            });
        } else if (workspaceIds.length === 1) {
            pushAffectedScope(scopes, seen, workspaceIds[0], '');
        } else if (categoryNames.length === 1) {
            pushAffectedScope(scopes, seen, '', categoryNames[0]);
        }

        return scopes;
    }

    function getMutationAffectedScopes(mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const scopes = [];
        const seen = new Set();
        getDeltaAffectedScopes(getMutationDataDelta(normalizedMeta)).forEach(function (scope) {
            pushAffectedScope(scopes, seen, scope.workspaceId, scope.categoryName);
        });
        pushAffectedScope(scopes, seen, normalizedMeta?.workspaceId, normalizedMeta?.categoryName);
        return scopes;
    }

    function getMutationAffectedLinkIds(mutationMeta) {
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const seen = new Set();
        const linkIds = [];
        function pushLinkId(value) {
            const linkId = text(value, '');
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            linkIds.push(linkId);
        }

        const delta = getMutationDataDelta(normalizedMeta);
        toArray(delta?.linkIds).forEach(pushLinkId);
        toArray(delta?.addedLinkIds).forEach(pushLinkId);
        toArray(delta?.updatedLinkIds).forEach(pushLinkId);
        toArray(delta?.removedLinkIds).forEach(pushLinkId);
        pushLinkId(normalizedMeta?.linkId);
        return linkIds;
    }

    function canUseScopedLocalIncremental(mutationMeta) {
        const delta = getMutationDataDelta(mutationMeta);
        if (delta && !delta.complete) return false;
        if (typeof buildScopedLocalRecordBundle !== 'function') return false;
        const scopes = getMutationAffectedScopes(mutationMeta);
        const linkIds = getMutationAffectedLinkIds(mutationMeta);
        if (!scopes.length && !linkIds.length) return false;
        if (scopes.length > 80 || linkIds.length > 500) return false;
        return true;
    }

    function classifyInvalidationPlan(reason, mutationMeta) {
        const normalizedReason = text(reason, 'state-mutated');
        const normalizedMeta = normalizeMutationMeta(mutationMeta);
        const dataDelta = getMutationDataDelta(normalizedMeta);
        const configDelta = getMutationConfigDelta(normalizedMeta);
        const scopes = getMutationAffectedScopes(normalizedMeta);
        const linkIds = getMutationAffectedLinkIds(normalizedMeta);
        const configKeys = toArray(configDelta?.changedKeys)
            .map(function (key) { return text(key, ''); })
            .filter(Boolean);
        const sourceDriven = isSourceDrivenReason(normalizedReason);
        const ignored = isNonIndexingCoreDelta(normalizedReason, normalizedMeta);
        let mode = 'full';

        if (ignored) {
            mode = 'ignore';
        } else if (sourceDriven && text(normalizedMeta?.categoryName, '')) {
            mode = 'source';
        } else if (!sourceDriven && canUseScopedLocalIncremental(normalizedMeta)) {
            mode = 'local-scope';
        } else if (!sourceDriven && state.snapshot) {
            mode = 'local';
        }

        return {
            dirty: !ignored,
            mode: mode,
            reason: normalizedReason,
            sourceDriven: sourceDriven,
            complete: dataDelta ? !!dataDelta.complete : true,
            affectedScopes: scopes,
            linkIds: linkIds,
            folderIds: toArray(dataDelta?.folderIds)
                .concat(text(normalizedMeta?.folderId, '') ? [text(normalizedMeta.folderId, '')] : [])
                .map(function (value) { return text(value, ''); })
                .filter(Boolean),
            configKeys: configKeys
        };
    }

    function getRecordScopeKey(record) {
        const workspaceId = text(record?.workspaceId || record?.path?.workspaceId, '');
        const categoryName = text(record?.categoryName || record?.path?.categoryName, '');
        return workspaceId && categoryName ? (workspaceId + '::' + categoryName) : '';
    }

    function shouldReplaceScopedLocalRecord(record, scopeKeySet) {
        const type = text(record?.type, '');
        if (!INCREMENTAL_LOCAL_RECORD_TYPES.has(type)) return false;
        const scopeKey = getRecordScopeKey(record);
        return !!scopeKey && scopeKeySet.has(scopeKey);
    }

    function buildScopedLocalIncrementalSnapshot(reason, mutationMeta) {
        if (!state.snapshot || !canUseScopedLocalIncremental(mutationMeta)) {
            return buildIncrementalSnapshot(reason);
        }

        const scopedBundle = buildScopedLocalRecordBundle({
            scopes: getMutationAffectedScopes(mutationMeta),
            linkIds: getMutationAffectedLinkIds(mutationMeta)
        });
        const scopeKeySet = new Set(toArray(scopedBundle?.scopeKeys).map(function (value) { return text(value, ''); }).filter(Boolean));
        if (!scopeKeySet.size) return buildIncrementalSnapshot(reason);

        const preservedLocalRecords = toArray(state.snapshot.records).filter(function (record) {
            const type = text(record?.type, '');
            return INCREMENTAL_LOCAL_RECORD_TYPES.has(type) && !shouldReplaceScopedLocalRecord(record, scopeKeySet);
        });
        const preservedSourceRecords = rehydrateSourceRecords(
            toArray(state.snapshot.records).filter(function (record) {
                const type = text(record?.type, '');
                return type === 'knowledge' || type === 'cached';
            }),
            scopedBundle.categoryMap
        );
        const records = []
            .concat(preservedLocalRecords)
            .concat(toArray(scopedBundle.records))
            .concat(preservedSourceRecords);

        return {
            version: shared.INDEX_VERSION,
            builtAt: now(),
            reason: text(reason, 'manual'),
            stats: buildSnapshotStats(records),
            records: records
        };
    }

    async function ensureFresh(options) {
        await loadPersistedSnapshot();
        const force = !!options?.force;
        const mutationMeta = normalizeMutationMeta(options?.mutationMeta || state.lastMutationMeta);
        const reason = text(options?.reason || state.lastReason, 'manual');
        const invalidationPlan = classifyInvalidationPlan(reason, mutationMeta);
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (!force && state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) {
            return state.snapshot;
        }
        if (
            !force
            && state.snapshot
            && state.dirty
            && snapshotAge < SNAPSHOT_MAX_AGE_MS
            && invalidationPlan.mode === 'local-scope'
        ) {
            return rebuild(Object.assign({}, options, { incremental: 'local-scope', mutationMeta: mutationMeta }));
        }
        if (
            !force
            && state.snapshot
            && state.dirty
            && snapshotAge < SNAPSHOT_MAX_AGE_MS
            && invalidationPlan.mode === 'source'
        ) {
            return rebuild(Object.assign({}, options, {
                incremental: 'source',
                mutationMeta: mutationMeta
            }));
        }
        if (
            !force
            && state.snapshot
            && state.dirty
            && snapshotAge < SNAPSHOT_MAX_AGE_MS
            && invalidationPlan.mode === 'local'
        ) {
            return rebuild(Object.assign({}, options, { incremental: true, mutationMeta: mutationMeta }));
        }
        return rebuild(options);
    }

    async function rebuild(options) {
        if (state.buildPromise) return state.buildPromise;
        const reason = text(options?.reason || state.lastReason, 'manual');
        const mutationMeta = normalizeMutationMeta(options?.mutationMeta || state.lastMutationMeta);
        const startRevision = Number(state.revision || 0);
        const buildRunner = options?.incremental === 'source'
            ? buildSourceIncrementalSnapshot(reason, mutationMeta)
            : (options?.incremental === 'local-scope'
                ? Promise.resolve().then(function () { return buildScopedLocalIncrementalSnapshot(reason, mutationMeta); })
                : (options?.incremental
                ? Promise.resolve().then(function () { return buildIncrementalSnapshot(reason); })
                : buildSnapshot(reason)));
        state.buildPromise = buildRunner
            .then(async function (snapshot) {
                return finalizeSnapshot(snapshot, reason, startRevision, mutationMeta);
            })
            .finally(function () {
                state.buildPromise = null;
                scheduleFollowUpBuild();
            });
        return state.buildPromise;
    }

    function looseFuzzyMatch(haystack, needle) {
        if (!haystack || !needle || needle.length < 3) return false;
        let h = 0;
        let n = 0;
        while (h < haystack.length && n < needle.length) {
            if (haystack[h] === needle[n]) n += 1;
            h += 1;
        }
        return n === needle.length;
    }

    function tokenizeSearchText(value) {
        return normalizeText(value)
            .split(/[^a-z0-9]+/i)
            .map(function (token) { return text(token, ''); })
            .filter(Boolean);
    }

    function buildAcronym(value) {
        return tokenizeSearchText(value).map(function (token) {
            return token.charAt(0);
        }).join('');
    }

    function getTypoDistanceLimit(token) {
        const length = String(token || '').length;
        if (length < 4) return 0;
        if (length <= 6) return 1;
        return 2;
    }

    function boundedEditDistance(left, right, maxDistance) {
        const a = text(left, '');
        const b = text(right, '');
        const limit = Number(maxDistance || 0);
        if (!a || !b) return limit + 1;
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > limit) return limit + 1;

        let previous = new Array(b.length + 1);
        let current = new Array(b.length + 1);
        for (let j = 0; j <= b.length; j += 1) previous[j] = j;

        for (let i = 1; i <= a.length; i += 1) {
            current[0] = i;
            let rowMin = current[0];
            for (let j = 1; j <= b.length; j += 1) {
                const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                const value = Math.min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + cost
                );
                current[j] = value;
                if (value < rowMin) rowMin = value;
            }
            if (rowMin > limit) return limit + 1;
            const temp = previous;
            previous = current;
            current = temp;
        }

        return previous[b.length];
    }

    function tokenMatchScore(fieldTokens, queryTokens) {
        if (!fieldTokens.length || !queryTokens.length) return 0;
        let score = 0;
        let matched = 0;

        queryTokens.forEach(function (queryToken) {
            let best = 0;
            fieldTokens.forEach(function (fieldToken) {
                if (fieldToken === queryToken) best = Math.max(best, 42);
                else if (fieldToken.startsWith(queryToken)) best = Math.max(best, 34);
                else if (fieldToken.includes(queryToken) && queryToken.length >= 3) best = Math.max(best, 24);
                else {
                    const typoLimit = getTypoDistanceLimit(queryToken);
                    if (typoLimit > 0 && boundedEditDistance(fieldToken, queryToken, typoLimit) <= typoLimit) {
                        best = Math.max(best, typoLimit === 1 ? 30 : 22);
                    }
                }
            });
            if (best > 0) {
                matched += 1;
                score += best;
            }
        });

        if (matched === queryTokens.length && queryTokens.length > 1) score += 24;
        return score;
    }

    function scoreField(value, query, options) {
        if (!value || !query) return 0;
        if (value === query) return 140;
        if (value.startsWith(query)) return 110;
        if (value.includes(query)) return 75;
        const tokens = tokenizeSearchText(value);
        const queryTokens = tokenizeSearchText(query);
        const tokenScore = tokenMatchScore(tokens, queryTokens);
        if (tokenScore) return Math.min(96, tokenScore);
        if (options?.acronym) {
            const acronym = buildAcronym(value);
            if (acronym && acronym === query) return 70;
            if (acronym && query.length >= 2 && acronym.startsWith(query)) return 44;
        }
        if (looseFuzzyMatch(value, query)) return 18;
        return 0;
    }

    function computeScore(record, query, scope) {
        const q = normalizeText(query);
        if (!q) return 0;

        let score = 0;
        const title = normalizeText(record?.title);
        const description = normalizeText(record?.description);
        const displayUrl = normalizeText(record?.displayUrl || record?.url);
        const pathLabel = normalizeText(record?.path?.pathLabel);
        const provider = normalizeText(record?.provider);
        const searchText = normalizeText(record?.searchableText);

        const titleScore = scoreField(title, q, { acronym: true });
        const pathScore = scoreField(pathLabel, q);
        score += titleScore;
        score += Math.floor(pathScore * 0.75);
        score += Math.floor(scoreField(displayUrl, q) * 0.45);
        score += Math.floor(scoreField(description, q) * 0.35);
        score += Math.floor(scoreField(provider, q) * 0.2);

        if (!score && searchText.includes(q)) score += 26;
        if (!score && looseFuzzyMatch(searchText.replace(/\s+/g, ''), q.replace(/\s+/g, ''))) score += 12;
        if (score <= 0) return 0;

        if (titleScore >= 140) score += 70;
        if (pathScore >= 140) score += 48;
        if (titleScore >= 96 && record?.type !== 'cached') score += 24;
        if (pathScore >= 96 && record?.type !== 'cached') score += 20;

        if (scope?.workspaceId && matchesScope(record, { workspaceId: scope.workspaceId })) score += 14;
        if (scope?.categoryName && text(record?.categoryName, '') === text(scope.categoryName, '')) score += 18;
        if (record?.type === 'card') score += 22;
        if (record?.type === 'folder') score += 18;
        if (record?.type === 'bookmark') score += 16;
        if (record?.type === 'library') score += 14;
        if (record?.library?.linked) score += 8;
        if (record?.provenance?.done) score -= 4;

        return score;
    }

    function parseQueryIntent(query) {
        const raw = text(query, '');
        const filters = {};
        const phrases = [];
        const excludedTerms = [];
        const requiredTerms = [];
        const terms = [];
        const phrasePattern = /"([^"]+)"/g;
        let remainder = raw.replace(phrasePattern, function (_, phrase) {
            const normalizedPhrase = normalizeText(phrase);
            if (normalizedPhrase) phrases.push(normalizedPhrase);
            return ' ';
        });

        remainder.split(/\s+/).map(function (token) {
            return text(token, '');
        }).filter(Boolean).forEach(function (token) {
            const negative = token.charAt(0) === '-';
            const required = token.charAt(0) === '+';
            const cleanToken = negative || required ? token.slice(1) : token;
            const separatorIndex = cleanToken.indexOf(':');
            if (separatorIndex > 0) {
                const key = normalizeText(cleanToken.slice(0, separatorIndex));
                const value = normalizeText(cleanToken.slice(separatorIndex + 1));
                if (value && ['type', 'provider', 'tab', 'workspace', 'card', 'health', 'visibility', 'freshness', 'flag'].includes(key)) {
                    if (!filters[key]) filters[key] = [];
                    filters[key].push(value);
                    return;
                }
            }
            const normalizedToken = normalizeText(cleanToken);
            if (!normalizedToken) return;
            if (negative) excludedTerms.push(normalizedToken);
            else if (required) requiredTerms.push(normalizedToken);
            else terms.push(normalizedToken);
        });

        const searchText = phrases.concat(requiredTerms).concat(terms).join(' ');
        return {
            raw: raw,
            searchText: searchText,
            phrases: phrases,
            requiredTerms: requiredTerms,
            terms: terms,
            excludedTerms: excludedTerms,
            filters: filters,
            hasFilters: Object.keys(filters).length > 0
        };
    }

    function recordSearchHaystack(record) {
        return normalizeText([
            record?.title,
            record?.description,
            record?.url,
            record?.displayUrl,
            record?.provider,
            record?.categoryName,
            record?.path?.workspaceLabel,
            record?.path?.pathLabel,
            record?.searchableText
        ].join(' '));
    }

    function matchesAnyFilterValue(value, filters) {
        const normalizedValue = normalizeText(value);
        return toArray(filters).some(function (filterValue) {
            const normalizedFilter = normalizeText(filterValue);
            return normalizedValue === normalizedFilter || normalizedValue.includes(normalizedFilter);
        });
    }

    function matchesFlagFilter(record, visibility, health, freshness, filters) {
        if (!toArray(filters).length) return true;
        return toArray(filters).some(function (filterValue) {
            const flag = normalizeText(filterValue);
            if (flag === 'orphaned') return !!record?.provenance?.orphaned;
            if (flag === 'broken') return visibility?.state === 'broken' || health?.state === 'broken';
            if (flag === 'hidden') return visibility?.state === 'hidden';
            if (flag === 'done') return !!record?.provenance?.done;
            if (flag === 'stale') return freshness?.state === 'stale';
            if (flag === 'warning') return health?.state === 'warning';
            return false;
        });
    }

    function matchesQueryIntent(record, intent, visibility, health, freshness) {
        const filters = intent?.filters || {};
        const haystack = recordSearchHaystack(record);
        if (toArray(intent?.excludedTerms).some(function (term) { return haystack.includes(term); })) return false;
        if (toArray(intent?.phrases).some(function (phrase) { return !haystack.includes(phrase); })) return false;
        if (toArray(intent?.requiredTerms).some(function (term) { return !haystack.includes(term); })) return false;
        if (filters.type && !matchesAnyFilterValue(record?.type, filters.type)) return false;
        if (filters.provider && !matchesAnyFilterValue(record?.provider, filters.provider)) return false;
        if (filters.tab && !matchesAnyFilterValue(record?.path?.workspaceLabel || record?.workspaceId, filters.tab)) return false;
        if (filters.workspace && !matchesAnyFilterValue(record?.workspaceId || record?.path?.workspaceLabel, filters.workspace)) return false;
        if (filters.card && !matchesAnyFilterValue(record?.categoryName, filters.card)) return false;
        if (filters.health && !matchesAnyFilterValue(health?.state + ' ' + health?.label, filters.health)) return false;
        if (filters.visibility && !matchesAnyFilterValue(visibility?.state + ' ' + visibility?.label, filters.visibility)) return false;
        if (filters.freshness && !matchesAnyFilterValue(freshness?.state + ' ' + freshness?.label, filters.freshness)) return false;
        if (filters.flag && !matchesFlagFilter(record, visibility, health, freshness, filters.flag)) return false;
        return true;
    }

    function buildFacets(records) {
        const facets = {
            tabs: {},
            cards: {},
            sourceTypes: {},
            providers: {},
            freshness: {},
            visibility: {},
            health: {},
            flags: {}
        };

        records.forEach(function (record) {
            const workspaceLabel = text(record?.path?.workspaceLabel, record?.workspaceId);
            const cardLabel = text(record?.categoryName, 'Unsorted');
            const typeLabel = text(record?.type, 'result');
            const providerLabel = text(record?.provider, 'unknown');
            const freshnessLabel = text(record?.freshness?.label, 'Unknown');
            const visibilityLabel = text(record?.visibility?.label, 'Visible');
            const healthLabel = text(record?.health?.label, 'Healthy');

            facets.tabs[workspaceLabel] = (facets.tabs[workspaceLabel] || 0) + 1;
            facets.cards[cardLabel] = (facets.cards[cardLabel] || 0) + 1;
            facets.sourceTypes[typeLabel] = (facets.sourceTypes[typeLabel] || 0) + 1;
            facets.providers[providerLabel] = (facets.providers[providerLabel] || 0) + 1;
            facets.freshness[freshnessLabel] = (facets.freshness[freshnessLabel] || 0) + 1;
            facets.visibility[visibilityLabel] = (facets.visibility[visibilityLabel] || 0) + 1;
            facets.health[healthLabel] = (facets.health[healthLabel] || 0) + 1;

            if (record?.provenance?.orphaned) facets.flags.Orphaned = (facets.flags.Orphaned || 0) + 1;
            if (record?.health?.state === 'broken' || record?.visibility?.state === 'broken') {
                facets.flags['Broken Path'] = (facets.flags['Broken Path'] || 0) + 1;
            }
        });

        return facets;
    }

    function buildAllowedTypes(settings) {
        const allowedTypes = new Set();
        const hasExplicitVectors = !!(settings?.activeVectors && typeof settings.activeVectors === 'object');
        const vectors = hasExplicitVectors
            ? settings.activeVectors
            : { bookmarks: true, knowledge: true, cachedResults: true };
        if (vectors.bookmarks) {
            allowedTypes.add('bookmark');
            allowedTypes.add('card');
            allowedTypes.add('folder');
            allowedTypes.add('library');
        }
        if (vectors.knowledge) allowedTypes.add('knowledge');
        if (vectors.cachedResults) allowedTypes.add('cached');
        return allowedTypes;
    }

    function compareRankedRecords(left, right) {
        return Number(right.score || 0) - Number(left.score || 0)
            || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
            || text(left.title, '').localeCompare(text(right.title, ''));
    }

    async function search(query, scope, settings) {
        const snapshot = await ensureFresh();
        const intent = parseQueryIntent(query);
        const q = normalizeText(intent.searchText);
        if (!q && !intent.hasFilters) return { records: [], facets: {}, stats: {}, snapshot: snapshot };

        const allowedTypes = buildAllowedTypes(settings);

        const records = [];
        snapshot.records.forEach(function (record) {
            if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
            const visibility = computeVisibility(record);
            const freshness = computeFreshness(record.updatedAt);
            const health = computeHealth(record);
            if (!matchesQueryIntent(record, intent, visibility, health, freshness)) return;
            const score = q ? computeScore(record, q, scope) : 1;
            if (score <= 0) return;
            const diagnostic = typeof diagnoseRecord === 'function'
                ? diagnoseRecord(record)
                : {
                    visibility: visibility,
                    health: health,
                    freshness: freshness,
                    severity: 'ok',
                    reasons: []
                };
            records.push(Object.assign({}, record, {
                score: score,
                visibility: visibility,
                visibilityState: visibility.state,
                freshness: freshness,
                freshnessState: freshness.state,
                health: health,
                healthState: health.state,
                diagnostic: diagnostic
            }));
        });

        records.sort(compareRankedRecords);

        return {
            records: records,
            facets: buildFacets(records),
            stats: snapshot.stats || {},
            snapshot: snapshot,
            queryIntent: intent
        };
    }

    function buildSuggestionSubtitle(record) {
        return text(record?.path?.pathLabel, '')
            || text(record?.displayUrl || record?.url, '')
            || text(record?.provider, '')
            || text(record?.categoryName, '');
    }

    function buildSuggestionRecord(record, score) {
        const visibility = computeVisibility(record);
        const freshness = computeFreshness(record?.updatedAt);
        const health = computeHealth(record);
        return {
            id: text(record?.id, ''),
            type: text(record?.type, 'result'),
            title: text(record?.title, 'Untitled'),
            subtitle: buildSuggestionSubtitle(record),
            insertText: text(record?.title, ''),
            score: score,
            updatedAt: Number(record?.updatedAt || 0),
            workspaceId: text(record?.workspaceId, ''),
            categoryName: text(record?.categoryName, ''),
            provider: text(record?.provider, ''),
            path: record?.path || null,
            visibilityState: visibility.state,
            healthState: health.state,
            freshnessState: freshness.state
        };
    }

    async function getSuggestionSnapshot() {
        await loadPersistedSnapshot();
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) return state.snapshot;
        return ensureFresh();
    }

    async function suggest(query, scope, settings) {
        const snapshot = await getSuggestionSnapshot();
        const q = normalizeText(query);
        if (!q || q.length < 2) {
            return { suggestions: [], stats: snapshot?.stats || {}, snapshot: snapshot };
        }

        const allowedTypes = buildAllowedTypes(settings);
        const maxSuggestions = Math.max(1, Math.min(20, Number(settings?.maxSuggestions || 8)));
        const suggestions = [];

        toArray(snapshot?.records).forEach(function (record) {
            if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
            const score = computeScore(record, q, scope);
            if (score <= 0) return;

            suggestions.push(buildSuggestionRecord(record, score));
            if (suggestions.length > maxSuggestions) {
                suggestions.sort(compareRankedRecords);
                suggestions.length = maxSuggestions;
            }
        });

        suggestions.sort(compareRankedRecords);

        return {
            suggestions: suggestions,
            stats: snapshot?.stats || {},
            snapshot: snapshot
        };
    }

    function findWorkspaceMeta(workspaceId, fallbackLabel, fallbackFullLabel) {
        const workspaces = toArray(readConfig().workspaces);
        const helpers = window.EveWorkspaceHelpers;
        const match = helpers?.findById
            ? helpers.findById(workspaces, workspaceId)
            : workspaces.find(function (workspace) {
                return text(workspace?.id, '') === text(workspaceId, '');
            }) || null;
        const parent = helpers?.findParent
            ? helpers.findParent(workspaces, workspaceId)
            : null;

        return {
            label: text(match?.name, fallbackLabel || workspaceId),
            fullLabel: text(fallbackFullLabel, text(match?.name, fallbackLabel || workspaceId)),
            parentWorkspaceId: text(parent?.id, ''),
            hiddenInParent: !!match?.hiddenInParent
        };
    }

    async function buildGraphProjection(options) {
        const snapshot = options?.snapshot || await ensureFresh();
        const scope = options?.scope || null;
        const inScope = typeof buildScopeRecordMatcher === 'function'
            ? buildScopeRecordMatcher(snapshot, scope)
            : function (record) { return matchesScope(record, scope); };
        const records = toArray(snapshot?.records).filter(function (record) {
            return inScope(record);
        });
        const nodes = [];
        const edges = [];
        const nodeById = new Map();
        const edgeKeys = new Set();
        const folderNodeMeta = new Map();
        const workspaceNodeMeta = new Map();

        function ensureNode(id, payload) {
            const normalizedPayload = {};
            Object.keys(payload || {}).forEach(function (key) {
                if (typeof payload[key] !== 'undefined') normalizedPayload[key] = payload[key];
            });
            if (nodeById.has(id)) {
                const existing = nodeById.get(id);
                Object.assign(existing, normalizedPayload);
                return existing;
            }
            const node = Object.assign({ id: id }, normalizedPayload);
            nodeById.set(id, node);
            nodes.push(node);
            return node;
        }

        function addEdge(sourceId, targetId, type) {
            const source = text(sourceId, '');
            const target = text(targetId, '');
            if (!source || !target || source === target) return;
            const edgeType = text(type, 'hierarchy');
            const key = source + '::' + target + '::' + edgeType;
            if (edgeKeys.has(key)) return;
            edgeKeys.add(key);
            edges.push({ source: source, target: target, type: edgeType });
        }

        function getWorkspaceNodeId(workspaceId) {
            return 'workspace::' + text(workspaceId, 'main');
        }

        function getCardNodeId(workspaceId, categoryName) {
            return 'card::' + text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
        }

        function getFolderNodeId(workspaceId, categoryName, folderId) {
            return 'folder::' + text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted') + '::' + text(folderId, '');
        }

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;
            const visibility = computeVisibility(record);
            const health = computeHealth(record);
            const freshness = computeFreshness(record.updatedAt);
            const workspaceMeta = findWorkspaceMeta(
                workspaceId,
                record?.path?.workspaceTrail?.slice?.(-1)?.[0]?.name,
                record?.path?.workspaceLabel
            );

            const workspaceNodeId = getWorkspaceNodeId(workspaceId);
            const cardNodeId = getCardNodeId(workspaceId, categoryName);

            workspaceNodeMeta.set(workspaceNodeId, workspaceMeta);
            ensureNode(workspaceNodeId, {
                kind: 'workspace',
                label: workspaceMeta.label,
                workspaceId: workspaceId,
                workspaceLabel: workspaceMeta.fullLabel,
                hiddenInParent: workspaceMeta.hiddenInParent
            });
            ensureNode(cardNodeId, {
                kind: 'card',
                label: categoryName,
                workspaceId: workspaceId,
                categoryName: categoryName,
                pathLabel: text(record?.path?.pathLabel, categoryName),
                visibilityState: record?.type === 'card' ? visibility.state : undefined,
                healthState: record?.type === 'card' ? health.state : undefined,
                orphaned: !!record?.provenance?.orphaned
            });

            if (record.type === 'folder' && text(record?.path?.folderId, '')) {
                const folderId = text(record.path.folderId, '');
                const folderNodeId = getFolderNodeId(workspaceId, categoryName, folderId);
                folderNodeMeta.set(folderNodeId, {
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId,
                    parentFolderId: text(record?.parentFolderId || record?.provenance?.parentFolderId, ''),
                    label: text(record.title, record?.path?.folderLabel || buildFolderPathLabel(workspaceId, categoryName, folderId) || folderId)
                });
                ensureNode(folderNodeId, {
                    kind: 'folder',
                    label: text(record.title, record?.path?.folderLabel || 'Folder'),
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId,
                    pathLabel: text(record?.path?.pathLabel, ''),
                    visibilityState: visibility.state,
                    healthState: health.state,
                    freshnessState: freshness.state,
                    orphaned: !!record?.provenance?.orphaned
                });
                return;
            }

            if (text(record?.path?.folderId, '')) {
                const folderId = text(record.path.folderId, '');
                const folderNodeId = getFolderNodeId(workspaceId, categoryName, folderId);
                ensureNode(folderNodeId, {
                    kind: 'folder',
                    label: text(record?.path?.folderLabel, buildFolderPathLabel(workspaceId, categoryName, folderId) || 'Folder'),
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId
                });
            }

            if (record.type === 'card') return;

            ensureNode(record.id, {
                kind: record.type,
                sourceType: record.type,
                label: text(record.title, 'Untitled'),
                workspaceId: workspaceId,
                categoryName: categoryName,
                folderId: text(record?.path?.folderId, ''),
                linkId: text(record?.path?.linkId || record?.provenance?.linkId, ''),
                url: text(record?.url, ''),
                healthState: text(record?.healthState || record?.baseHealth?.state, 'healthy'),
                visibilityState: text(record?.visibilityState || visibility.state, 'visible'),
                freshnessState: freshness.state,
                orphaned: !!record?.provenance?.orphaned,
                pathLabel: text(record?.path?.pathLabel, ''),
                meta: text(record?.description, '')
            });
        });

        workspaceNodeMeta.forEach(function (meta, workspaceNodeId) {
            const workspaceId = text(nodeById.get(workspaceNodeId)?.workspaceId, '');
            if (!workspaceId) return;
            if (meta.parentWorkspaceId) {
                const parentWorkspaceMeta = findWorkspaceMeta(meta.parentWorkspaceId, meta.parentWorkspaceId, meta.parentWorkspaceId);
                const parentWorkspaceNodeId = getWorkspaceNodeId(meta.parentWorkspaceId);
                ensureNode(parentWorkspaceNodeId, {
                    kind: 'workspace',
                    label: parentWorkspaceMeta.label,
                    workspaceId: meta.parentWorkspaceId,
                    workspaceLabel: parentWorkspaceMeta.fullLabel,
                    hiddenInParent: parentWorkspaceMeta.hiddenInParent
                });
                addEdge(parentWorkspaceNodeId, workspaceNodeId, 'hierarchy');
            }
        });

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;
            addEdge(getWorkspaceNodeId(workspaceId), getCardNodeId(workspaceId, categoryName), 'hierarchy');
        });

        folderNodeMeta.forEach(function (meta, folderNodeId) {
            const parentFolderId = text(meta.parentFolderId, '');
            const parentNodeId = parentFolderId
                ? getFolderNodeId(meta.workspaceId, meta.categoryName, parentFolderId)
                : getCardNodeId(meta.workspaceId, meta.categoryName);

            if (parentFolderId) {
                ensureNode(parentNodeId, {
                    kind: 'folder',
                    label: buildFolderPathLabel(meta.workspaceId, meta.categoryName, parentFolderId) || parentFolderId,
                    workspaceId: meta.workspaceId,
                    categoryName: meta.categoryName,
                    folderId: parentFolderId
                });
            }
            addEdge(parentNodeId, folderNodeId, 'hierarchy');
        });

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName || record.type === 'card' || record.type === 'folder') return;
            const folderId = text(record?.path?.folderId, '');
            const parentNodeId = folderId
                ? getFolderNodeId(workspaceId, categoryName, folderId)
                : getCardNodeId(workspaceId, categoryName);
            addEdge(parentNodeId, record.id, 'membership');
        });

        let preferredRootIds = [];
        const scopeType = text(scope?.scope, '');
        const scopeWorkspaceId = text(scope?.workspaceId, '');
        const scopeCategoryName = text(scope?.categoryName, '');
        const scopeFolderId = text(scope?.folderId, '');

        function uniqueRootIds(ids) {
            return Array.from(new Set(toArray(ids).map(function (value) { return text(value, ''); }).filter(Boolean)));
        }

        if (scopeType === 'workspace' && scopeWorkspaceId) {
            const workspaceNodeId = getWorkspaceNodeId(scopeWorkspaceId);
            preferredRootIds = edges
                .filter(function (edge) { return edge.source === workspaceNodeId; })
                .map(function (edge) { return edge.target; });
            if (!preferredRootIds.length && nodeById.has(workspaceNodeId)) preferredRootIds = [workspaceNodeId];
        } else if (scopeType === 'card' && scopeWorkspaceId && scopeCategoryName) {
            const cardNodeId = getCardNodeId(scopeWorkspaceId, scopeCategoryName);
            if (nodeById.has(cardNodeId)) preferredRootIds = [cardNodeId];
        } else if (scopeType === 'folder' && scopeWorkspaceId && scopeCategoryName && scopeFolderId) {
            const folderNodeId = getFolderNodeId(scopeWorkspaceId, scopeCategoryName, scopeFolderId);
            if (nodeById.has(folderNodeId)) preferredRootIds = [folderNodeId];
        } else if (scopeType === 'derived' && scopeWorkspaceId && scopeCategoryName) {
            const cardNodeId = getCardNodeId(scopeWorkspaceId, scopeCategoryName);
            if (nodeById.has(cardNodeId)) preferredRootIds = [cardNodeId];
        }

        preferredRootIds = uniqueRootIds(preferredRootIds);

        return {
            builtAt: snapshot?.builtAt || 0,
            scope: scope || null,
            nodes: nodes,
            edges: edges,
            preferredRootIds: preferredRootIds
        };
    }

    async function getIntegrityReport(options) {
        const snapshot = options?.snapshot || await ensureFresh();
        const scope = options?.scope || null;
        return buildIntegrityReportSync(snapshot, scope);
    }

    function getStats() {
        return state.snapshot?.stats || null;
    }

    function getSnapshot() {
        return state.snapshot || null;
    }

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
        if (workspaceId && categoryName) {
            const key = workspaceId + '::' + categoryName;
            return scopeIndex.cardKeySet.has(key) ? [key] : [];
        }
        return scopeIndex.cardKeys.filter(function (cardKey) {
            const separatorIndex = cardKey.indexOf('::');
            const keyWorkspaceId = separatorIndex >= 0 ? cardKey.slice(0, separatorIndex) : cardKey;
            const keyCategoryName = separatorIndex >= 0 ? cardKey.slice(separatorIndex + 2) : '';
            if (workspaceId && keyWorkspaceId !== workspaceId) return false;
            if (categoryName && keyCategoryName !== categoryName) return false;
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

    function getBuildState() {
        return {
            loaded: !!state.loaded,
            dirty: !!state.dirty,
            building: !!state.buildPromise,
            builtAt: Number(state.snapshot?.builtAt || 0),
            revision: Number(state.revision || 0),
            lastReason: text(state.lastReason, ''),
            lastMutationMeta: normalizeMutationMeta(state.lastMutationMeta),
            lastInvalidationPlan: state.lastInvalidationPlan || classifyInvalidationPlan(state.lastReason, state.lastMutationMeta),
            datapackFingerprint: text(state.datapackFingerprint || state.snapshot?.datapackFingerprint, '')
        };
    }

    function getInvalidationPlan(reason, mutationMeta) {
        if (arguments.length > 0) {
            return classifyInvalidationPlan(reason, mutationMeta);
        }
        return state.lastInvalidationPlan || classifyInvalidationPlan(state.lastReason, state.lastMutationMeta);
    }

    function hasUsableSnapshot() {
        const snapshotFingerprint = text(state.snapshot?.datapackFingerprint, '');
        return !!state.snapshot
            && !state.dirty
            && Number(state.snapshot?.builtAt || 0) > 0
            && (!!snapshotFingerprint || !text(state.datapackFingerprint, ''));
    }

    function isLinkScopeReadableDirtyReason(reason) {
        const normalizedReason = text(reason, '');
        return normalizedReason === 'saveConfig'
            || normalizedReason === 'library-link-updated'
            || isSourceDrivenReason(normalizedReason);
    }

    function hasReadableLinkSnapshot() {
        if (!state.snapshot || Number(state.snapshot?.builtAt || 0) <= 0) return false;
        if (!state.dirty) return true;
        return isLinkScopeReadableDirtyReason(state.lastReason);
    }

    function isStructureScopeReadableDirtyReason(reason) {
        const normalizedReason = text(reason, '');
        return normalizedReason === 'saveConfig'
            || normalizedReason === 'sidebar-tab-reorder'
            || normalizedReason === 'library-link-updated'
            || isSourceDrivenReason(normalizedReason);
    }

    function hasReadableStructureSnapshot() {
        if (!state.snapshot || Number(state.snapshot?.builtAt || 0) <= 0) return false;
        if (!state.dirty) return true;
        return isStructureScopeReadableDirtyReason(state.lastReason);
    }

    function getStructureSummary() {
        return buildStructureSummary(state.snapshot);
    }

    function getWorkspaceSummary(workspaceId) {
        const key = text(workspaceId, '');
        if (!key) return null;
        return getStructureSummary().workspaces[key] || null;
    }

    function getCardSummary(workspaceId, categoryName) {
        const key = text(workspaceId, '') + '::' + text(categoryName, '');
        if (!key || key === '::') return null;
        return getStructureSummary().cards[key] || null;
    }

    function getGroupSummary(groupId) {
        const key = text(groupId, '');
        if (!key) return null;
        return getStructureSummary().groups[key] || null;
    }

    window.addEventListener('eve:state-mutated', function (event) {
        markDirty(event?.detail?.source || 'state-mutated', event?.detail?.meta || null);
    });
    window.addEventListener('eve:library-link-updated', function (event) {
        markDirty('library-link-updated', event?.detail || null);
    });
    window.addEventListener('modulesRegistered', installMutationHooks);
    window.addEventListener('eve:storage-backend', installMutationHooks);
    installMutationHooks();

    const datapackIndexApi = {
        ensureFresh,
        rebuild,
        search,
        suggest,
        getStats,
        getSnapshot,
        getScopedBookmarkLinkIds,
        getExactBookmarkLinkIds,
        getIndexedBookmarkRecordByLinkId,
        resolveBookmarkLink,
        getBuildState,
        getInvalidationPlan,
        hasUsableSnapshot,
        hasReadableLinkSnapshot,
        hasReadableStructureSnapshot,
        getStructureSummary,
        getWorkspaceSummary,
        getCardSummary,
        getGroupSummary,
        getIntegrityReport,
        buildGraphProjection,
        markDirty,
        computeFreshness,
        computeVisibility,
        computeHealth
    };
    ns.Index = datapackIndexApi;

    window.EveOS = window.EveOS || {};
    window.EveOS.DatapackIndex = datapackIndexApi;
    window.EveOS.DatapackGraph = Object.assign(window.EveOS.DatapackGraph || {}, {
        getProjection: function (scope) {
            return datapackIndexApi.buildGraphProjection({ scope: scope || null });
        },
        getStructureSummary: function () {
            return datapackIndexApi.getStructureSummary();
        },
        getIntegrityReport: function (scope) {
            return datapackIndexApi.getIntegrityReport({ scope: scope || null });
        }
    });

    window.EveConstellationMap = window.EveConstellationMap || {};
    window.EveConstellationMap.getNexusGraphProjection = function (scope) {
        return ns.Index.buildGraphProjection({ scope: scope || null });
    };
})();
