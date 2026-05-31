window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    const shared = ns.IndexShared;
    const sources = ns.IndexRecordBuildersSources;
    const runtimeIntegrity = ns.IndexRuntimeIntegrity;
    const runtimeSummary = ns.IndexRuntimeSummary;
    const searchRuntimeFactory = ns.IndexSearchRuntime;
    const graphProjectionFactory = ns.IndexGraphProjection;
    const exactScopeFactory = ns.IndexExactScopeRuntime;
    const invalidationFactory = ns.IndexInvalidationRuntime;
    const persistenceFactory = ns.IndexPersistenceRuntime;
    if (!shared || !sources || !runtimeIntegrity || !runtimeSummary || !searchRuntimeFactory || !graphProjectionFactory || !exactScopeFactory || !invalidationFactory || !persistenceFactory) return;

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
    const INDEX_RELEVANT_CONFIG_KEYS = new Set([
        'workspaces',
        'categoryOrder',
        'categoryOrderByWorkspace',
        'hideStats',
        'smartCardWeights',
        'bookmarkIdentifiers',
        'smartViews'
    ]);

    const persistenceRuntime = persistenceFactory.create({
        shared: shared,
        buildDatapackStateFingerprint: buildDatapackStateFingerprint
    });
    const loadPersistedSnapshot = persistenceRuntime.loadPersistedSnapshot;
    const persistSnapshot = persistenceRuntime.persistSnapshot;
    const invalidationRuntime = invalidationFactory.create({
        shared: shared,
        INDEX_RELEVANT_CONFIG_KEYS: INDEX_RELEVANT_CONFIG_KEYS,
        buildScopedLocalRecordBundle: buildScopedLocalRecordBundle
    });
    const normalizeMutationMeta = invalidationRuntime.normalizeMutationMeta;
    const markDirty = invalidationRuntime.markDirty;
    const installMutationHooks = invalidationRuntime.installMutationHooks;
    const classifyInvalidationPlan = invalidationRuntime.classifyInvalidationPlan;
    const isSourceDrivenReason = invalidationRuntime.isSourceDrivenReason;
    const getMutationAffectedScopes = invalidationRuntime.getMutationAffectedScopes;
    const getMutationAffectedLinkIds = invalidationRuntime.getMutationAffectedLinkIds;
    const canUseScopedLocalIncremental = invalidationRuntime.canUseScopedLocalIncremental;
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

    let deferredFreshTimer = 0;

    function scheduleDeferredBuild(reason, mutationMeta, delayMs) {
        if (state.buildPromise || deferredFreshTimer || !state.dirty) return;
        const delay = Math.max(50, Number(delayMs || 900) || 900);
        deferredFreshTimer = setTimeout(function () {
            deferredFreshTimer = 0;
            if (!state.buildPromise && state.dirty) {
                ensureFresh({
                    reason: reason,
                    mutationMeta: mutationMeta
                });
            }
        }, delay);
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
        const forceFull = !!options?.forceFull || options?.incremental === false;
        const mutationMeta = normalizeMutationMeta(options?.mutationMeta || state.lastMutationMeta);
        const reason = text(options?.reason || state.lastReason, 'manual');
        const invalidationPlan = classifyInvalidationPlan(reason, mutationMeta);
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (options?.allowStale && state.snapshot && state.dirty && !forceFull) {
            scheduleDeferredBuild(reason, mutationMeta, options?.deferMs);
            return state.snapshot;
        }
        if (force && !forceFull && state.snapshot && !state.dirty) {
            if (!options?.verifyFingerprint) return state.snapshot;
            const currentFingerprint = buildDatapackStateFingerprint();
            const snapshotFingerprint = text(state.snapshot?.datapackFingerprint, '');
            if (!currentFingerprint || (snapshotFingerprint && snapshotFingerprint === currentFingerprint)) {
                return state.snapshot;
            }
            state.dirty = true;
            state.lastReason = 'datapack-fingerprint-mismatch';
            state.datapackFingerprint = currentFingerprint;
        }
        if (!force && state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) {
            return state.snapshot;
        }
        if (
            ((!force && snapshotAge < SNAPSHOT_MAX_AGE_MS) || (force && !forceFull))
            && state.snapshot
            && state.dirty
            && invalidationPlan.mode === 'local-scope'
        ) {
            return rebuild(Object.assign({}, options, { incremental: 'local-scope', mutationMeta: mutationMeta }));
        }
        if (
            ((!force && snapshotAge < SNAPSHOT_MAX_AGE_MS) || (force && !forceFull))
            && state.snapshot
            && state.dirty
            && invalidationPlan.mode === 'source'
        ) {
            return rebuild(Object.assign({}, options, {
                incremental: 'source',
                mutationMeta: mutationMeta
            }));
        }
        if (
            ((!force && snapshotAge < SNAPSHOT_MAX_AGE_MS) || (force && !forceFull))
            && state.snapshot
            && state.dirty
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

    const searchRuntime = searchRuntimeFactory.create({
        shared: shared,
        runtimeIntegrity: runtimeIntegrity,
        ensureFresh: ensureFresh,
        loadPersistedSnapshot: loadPersistedSnapshot
    });
    const search = searchRuntime.search;
    const suggest = searchRuntime.suggest;
    const graphProjectionRuntime = graphProjectionFactory.create({
        shared: shared,
        runtimeIntegrity: runtimeIntegrity,
        ensureFresh: ensureFresh
    });
    const buildGraphProjection = graphProjectionRuntime.buildGraphProjection;
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

    const exactScopeRuntime = exactScopeFactory.create({
        shared: shared,
        runtimeIntegrity: runtimeIntegrity,
        hasReadableLinkSnapshot: hasReadableLinkSnapshot
    });
    const getScopedBookmarkLinkIds = exactScopeRuntime.getScopedBookmarkLinkIds;
    const getExactBookmarkLinkIds = exactScopeRuntime.getExactBookmarkLinkIds;
    const getIndexedBookmarkRecordByLinkId = exactScopeRuntime.getIndexedBookmarkRecordByLinkId;
    const resolveBookmarkLink = exactScopeRuntime.resolveBookmarkLink;
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
