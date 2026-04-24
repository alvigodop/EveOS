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
    const {
        buildSnapshot,
        buildLocalRecordBundle,
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
        buildIntegrityReportSync
    } = runtimeIntegrity;
    const { buildStructureSummary } = runtimeSummary;

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
            state.snapshot = snapshot;
            state.dirty = false;
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
        if (!categoryName && !sourceKey && !query) return null;
        return {
            categoryName: categoryName,
            sourceKey: sourceKey,
            query: query
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
        state.revision = Number(state.revision || 0) + 1;
        state.dirty = true;
        state.lastReason = text(reason, 'state-mutated');
        state.lastMutationMeta = normalizeMutationMeta(mutationMeta);
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
        state.snapshot = snapshot;
        if (Number(state.revision || 0) === startRevision) {
            state.dirty = false;
            state.lastReason = reason;
            state.lastMutationMeta = normalizeMutationMeta(mutationMeta);
        }
        return persistSnapshot(snapshot).then(function () {
            return snapshot;
        });
    }

    function scheduleFollowUpBuild() {
        if (!state.dirty) return;
        setTimeout(function () {
            if (!state.buildPromise && state.dirty) {
                rebuild({ reason: state.lastReason });
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

    async function ensureFresh(options) {
        await loadPersistedSnapshot();
        const force = !!options?.force;
        const mutationMeta = normalizeMutationMeta(options?.mutationMeta || state.lastMutationMeta);
        const reason = text(options?.reason || state.lastReason, 'manual');
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (!force && state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) {
            return state.snapshot;
        }
        if (
            !force
            && state.snapshot
            && state.dirty
            && snapshotAge < SNAPSHOT_MAX_AGE_MS
            && !isSourceDrivenReason(reason)
        ) {
            return rebuild(Object.assign({}, options, { incremental: true }));
        }
        if (
            !force
            && state.snapshot
            && state.dirty
            && snapshotAge < SNAPSHOT_MAX_AGE_MS
            && isSourceDrivenReason(reason)
            && text(mutationMeta?.categoryName, '')
        ) {
            return rebuild(Object.assign({}, options, {
                incremental: 'source',
                mutationMeta: mutationMeta
            }));
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
            : (options?.incremental
                ? Promise.resolve().then(function () { return buildIncrementalSnapshot(reason); })
                : buildSnapshot(reason));
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

    function scoreField(value, query) {
        if (!value || !query) return 0;
        if (value === query) return 140;
        if (value.startsWith(query)) return 110;
        if (value.includes(query)) return 75;
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

        score += scoreField(title, q);
        score += Math.floor(scoreField(pathLabel, q) * 0.6);
        score += Math.floor(scoreField(displayUrl, q) * 0.45);
        score += Math.floor(scoreField(description, q) * 0.35);
        score += Math.floor(scoreField(provider, q) * 0.2);

        if (!score && searchText.includes(q)) score += 26;
        if (!score && looseFuzzyMatch(searchText.replace(/\s+/g, ''), q.replace(/\s+/g, ''))) score += 12;

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
        const vectors = settings?.activeVectors || {};
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
        const q = normalizeText(query);
        if (!q) return { records: [], facets: {}, stats: {}, snapshot: snapshot };

        const allowedTypes = buildAllowedTypes(settings);

        const records = [];
        snapshot.records.forEach(function (record) {
            if (!record || !allowedTypes.has(record.type) || !matchesScope(record, scope)) return;
            const score = computeScore(record, q, scope);
            if (score <= 0) return;
            const visibility = computeVisibility(record);
            const freshness = computeFreshness(record.updatedAt);
            const health = computeHealth(record);
            records.push(Object.assign({}, record, {
                score: score,
                visibility: visibility,
                visibilityState: visibility.state,
                freshness: freshness,
                freshnessState: freshness.state,
                health: health,
                healthState: health.state
            }));
        });

        records.sort(compareRankedRecords);

        return {
            records: records,
            facets: buildFacets(records),
            stats: snapshot.stats || {},
            snapshot: snapshot
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
        if (state.snapshot) return state.snapshot;
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
        if (!snapshot || !hasUsableSnapshot()) return [];

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
        if (!snapshot || !hasUsableSnapshot()) return [];

        const workspaceId = text(scope?.workspaceId, '');
        const categoryName = text(scope?.categoryName, '');
        const folderId = text(scope?.folderId, '');
        const exactRecords = toArray(snapshot.records).filter(function (record) {
            if (text(record?.type, '') !== 'bookmark' && text(record?.type, '') !== 'folder') return false;
            if (workspaceId && text(record?.workspaceId, '') !== workspaceId) return false;
            if (categoryName && text(record?.categoryName, '') !== categoryName) return false;
            return true;
        });

        let allowedFolderIds = null;
        if (folderId) {
            allowedFolderIds = collectExactFolderSubtree(folderId, buildExactFolderHierarchy(exactRecords));
            if (!allowedFolderIds.size) return [];
        }

        const linkIds = [];
        const seen = new Set();
        exactRecords.forEach(function (record) {
            if (text(record?.type, '') !== 'bookmark') return;
            if (allowedFolderIds && !allowedFolderIds.has(getExactRecordFolderId(record))) return;
            const linkId = getExactRecordLinkId(record);
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            linkIds.push(linkId);
        });

        return linkIds;
    }

    function getIndexedBookmarkRecordByLinkId(linkId) {
        const snapshot = state.snapshot;
        if (!snapshot || !hasUsableSnapshot()) return null;

        const normalizedLinkId = text(linkId, '');
        if (!normalizedLinkId) return null;

        return toArray(snapshot.records).find(function (record) {
            return text(record?.type, '') === 'bookmark'
                && getExactRecordLinkId(record) === normalizedLinkId;
        }) || null;
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
            lastMutationMeta: normalizeMutationMeta(state.lastMutationMeta)
        };
    }

    function hasUsableSnapshot() {
        return !!state.snapshot && !state.dirty && Number(state.snapshot?.builtAt || 0) > 0;
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
        markDirty(event?.detail?.source || 'state-mutated');
    });
    window.addEventListener('eve:library-link-updated', function () {
        markDirty('library-link-updated');
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
        hasUsableSnapshot,
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
