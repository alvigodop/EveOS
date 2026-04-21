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
        state,
        now,
        text,
        normalizeText,
        toArray,
        computeFreshness
    } = shared;
    const { buildSnapshot } = sources;
    const {
        matchesScope,
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

    function markDirty(reason) {
        state.dirty = true;
        state.lastReason = text(reason, 'state-mutated');
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
            if (shouldTrackStorageKey(key)) markDirty('scoped-storage:' + key);
        });

        const cacheApi = window.EveOS?.API?.Cache;
        wrapMutationMethod(cacheApi || {}, 'storeQuery', function () {
            markDirty('cache-store-query');
        });
        wrapMutationMethod(cacheApi || {}, 'storePool', function () {
            markDirty('cache-store-pool');
        });

        const storageManager = window.StorageManager;
        wrapMutationMethod(storageManager || {}, 'saveDataAsync', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) markDirty('storage-save:' + key);
        });
        wrapMutationMethod(storageManager || {}, 'saveData', function (args) {
            const key = text(args?.[0], '');
            if (shouldTrackStorageKey(key)) markDirty('storage-save:' + key);
        });
    }

    async function ensureFresh(options) {
        await loadPersistedSnapshot();
        const force = !!options?.force;
        const snapshotAge = state.snapshot ? (now() - Number(state.snapshot.builtAt || 0)) : Number.POSITIVE_INFINITY;
        if (!force && state.snapshot && !state.dirty && snapshotAge < SNAPSHOT_MAX_AGE_MS) {
            return state.snapshot;
        }
        return rebuild(options);
    }

    async function rebuild(options) {
        if (state.buildPromise) return state.buildPromise;
        const reason = text(options?.reason || state.lastReason, 'manual');
        state.buildPromise = buildSnapshot(reason)
            .then(async function (snapshot) {
                state.snapshot = snapshot;
                state.dirty = false;
                state.lastReason = reason;
                await persistSnapshot(snapshot);
                return snapshot;
            })
            .finally(function () {
                state.buildPromise = null;
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

    async function search(query, scope, settings) {
        const snapshot = await ensureFresh();
        const q = normalizeText(query);
        if (!q) return { records: [], facets: {}, stats: {}, snapshot: snapshot };

        const allowedTypes = new Set();
        const vectors = settings?.activeVectors || {};
        if (vectors.bookmarks) {
            allowedTypes.add('bookmark');
            allowedTypes.add('card');
            allowedTypes.add('library');
        }
        if (vectors.knowledge) allowedTypes.add('knowledge');
        if (vectors.cachedResults) allowedTypes.add('cached');

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

        records.sort(function (left, right) {
            return Number(right.score || 0) - Number(left.score || 0)
                || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
                || text(left.title, '').localeCompare(text(right.title, ''));
        });

        return {
            records: records,
            facets: buildFacets(records),
            stats: snapshot.stats || {},
            snapshot: snapshot
        };
    }

    async function buildGraphProjection(options) {
        const snapshot = options?.snapshot || await ensureFresh();
        const scope = options?.scope || null;
        const records = toArray(snapshot?.records).filter(function (record) {
            return matchesScope(record, scope);
        });
        const nodes = [];
        const edges = [];
        const nodeById = new Map();

        function ensureNode(id, payload) {
            if (nodeById.has(id)) return nodeById.get(id);
            const node = Object.assign({ id: id }, payload || {});
            nodeById.set(id, node);
            nodes.push(node);
            return node;
        }

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;

            const workspaceNode = ensureNode('workspace::' + workspaceId, {
                kind: 'workspace',
                label: text(record?.path?.workspaceLabel, workspaceId),
                workspaceId: workspaceId
            });
            const cardNode = ensureNode('card::' + workspaceId + '::' + categoryName, {
                kind: 'card',
                label: categoryName,
                workspaceId: workspaceId,
                categoryName: categoryName
            });

            edges.push({ source: workspaceNode.id, target: cardNode.id, type: 'hierarchy' });

            if (record.type === 'card') return;

            const detailNode = ensureNode(record.id, {
                kind: record.type,
                label: text(record.title, 'Untitled'),
                workspaceId: workspaceId,
                categoryName: categoryName,
                folderId: text(record?.path?.folderId, ''),
                healthState: text(record?.healthState || record?.baseHealth?.state, 'healthy'),
                visibilityState: text(record?.visibilityState, 'visible'),
                orphaned: !!record?.provenance?.orphaned
            });
            edges.push({ source: cardNode.id, target: detailNode.id, type: 'membership' });
        });

        return {
            builtAt: snapshot?.builtAt || 0,
            scope: scope || null,
            nodes: nodes,
            edges: edges
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

    ns.Index = {
        ensureFresh,
        rebuild,
        search,
        getStats,
        getSnapshot,
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

    window.EveConstellationMap = window.EveConstellationMap || {};
    window.EveConstellationMap.getNexusGraphProjection = function (scope) {
        return ns.Index.buildGraphProjection({ scope: scope || null });
    };
})();
