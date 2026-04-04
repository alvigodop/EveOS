window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const CACHE_KEY = 'apiSearchCachePool';
    const PREFS_KEY = 'apiSearchPrefs';
    const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
    const MAX_QUERIES = 12;

    function normalizeText(value) {
        return String(value || '').trim();
    }

    function normalizeQuery(query) {
        return normalizeText(query).toLowerCase();
    }

    function normalizeCategoryName(categoryName) {
        return normalizeText(categoryName || window.currentCategoryCtx || window.StorageManager?.categoryContext || 'global')
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    function fallbackStorageKey(key, categoryName) {
        return `api_${normalizeCategoryName(categoryName)}_${key}`;
    }

    function withScopedContext(categoryName, callback) {
        const manager = window.StorageManager;
        if (!manager || typeof manager.setCategoryContext !== 'function') {
            return callback(null);
        }

        const previousContext = manager.categoryContext;
        const nextContext = normalizeText(categoryName);
        if (nextContext) {
            manager.setCategoryContext(nextContext);
        }

        try {
            return callback(manager);
        } finally {
            manager.setCategoryContext(previousContext || null);
        }
    }

    function loadScopedValue(key, defaultValue, categoryName) {
        return withScopedContext(categoryName, function (manager) {
            if (manager && typeof manager.loadData === 'function') {
                return manager.loadData(key, defaultValue);
            }

            try {
                const raw = localStorage.getItem(fallbackStorageKey(key, categoryName));
                return raw ? JSON.parse(raw) : defaultValue;
            } catch (error) {
                console.warn('API Cache: Failed to load scoped value', key, error);
                return defaultValue;
            }
        });
    }

    function saveScopedValue(key, value, categoryName) {
        return withScopedContext(categoryName, function (manager) {
            if (manager && typeof manager.saveData === 'function') {
                return manager.saveData(key, value);
            }

            try {
                localStorage.setItem(fallbackStorageKey(key, categoryName), JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn('API Cache: Failed to save scoped value', key, error);
                return false;
            }
        });
    }

    function deleteScopedValue(key, categoryName) {
        return withScopedContext(categoryName, function (manager) {
            if (manager && typeof manager.deleteData === 'function') {
                return manager.deleteData(key);
            }

            try {
                localStorage.removeItem(fallbackStorageKey(key, categoryName));
                return true;
            } catch (error) {
                console.warn('API Cache: Failed to delete scoped value', key, error);
                return false;
            }
        });
    }

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function summarizeSources(sources) {
        const summary = {
            totalResults: 0,
            perSource: {}
        };

        const mapping = {
            mangadex: sources?.mangadex?.data,
            jikanManga: sources?.jikanManga?.data,
            jikanAnime: sources?.jikanAnime?.data,
            anilistManga: sources?.anilistManga?.data?.Page?.media,
            anilistAnime: sources?.anilistAnime?.data?.Page?.media,
            mangaupdates: sources?.mangaupdates?.results,
            kitsuAnime: sources?.kitsuAnime?.data,
            kitsuManga: sources?.kitsuManga?.data,
            tvmaze: sources?.tvmaze,
            itunes: sources?.itunes?.results,
            wlnupdates: sources?.wlnupdates?.data,
            openlibrary: sources?.openlibrary?.docs,
            comick: sources?.comick
        };

        Object.entries(mapping).forEach(function ([name, list]) {
            const count = toArray(list).length;
            summary.perSource[name] = count;
            summary.totalResults += count;
        });

        return summary;
    }

    function ensurePoolShape(pool) {
        const nextPool = pool && typeof pool === 'object' ? pool : {};
        nextPool.queries = nextPool.queries && typeof nextPool.queries === 'object' ? nextPool.queries : {};
        nextPool.order = Array.isArray(nextPool.order) ? nextPool.order : [];
        return nextPool;
    }

    function prunePool(pool) {
        const now = Date.now();
        const seen = new Set();
        const prunedOrder = [];

        Object.keys(pool.queries).forEach(function (queryKey) {
            const entry = pool.queries[queryKey];
            if (!entry || (entry.expiresAt && entry.expiresAt <= now)) {
                delete pool.queries[queryKey];
            }
        });

        pool.order.forEach(function (queryKey) {
            if (!pool.queries[queryKey] || seen.has(queryKey)) return;
            seen.add(queryKey);
            prunedOrder.push(queryKey);
        });

        Object.keys(pool.queries)
            .sort(function (left, right) {
                const leftTime = Number(pool.queries[left]?.lastUsedAt || pool.queries[left]?.updatedAt || 0);
                const rightTime = Number(pool.queries[right]?.lastUsedAt || pool.queries[right]?.updatedAt || 0);
                return rightTime - leftTime;
            })
            .forEach(function (queryKey) {
                if (seen.has(queryKey)) return;
                seen.add(queryKey);
                prunedOrder.push(queryKey);
            });

        while (prunedOrder.length > MAX_QUERIES) {
            const removedKey = prunedOrder.pop();
            delete pool.queries[removedKey];
        }

        pool.order = prunedOrder;
        return pool;
    }

    function loadPool(categoryName) {
        const pool = ensurePoolShape(loadScopedValue(CACHE_KEY, { queries: {}, order: [] }, categoryName));
        prunePool(pool);
        return pool;
    }

    function savePool(pool, categoryName) {
        const nextPool = prunePool(ensurePoolShape(pool));
        return saveScopedValue(CACHE_KEY, nextPool, categoryName);
    }

    function loadPrefs(categoryName) {
        const stored = loadScopedValue(PREFS_KEY, {}, categoryName);
        return {
            liveResults: stored?.liveResults === true,
            hybridResults: stored?.hybridResults !== false,
            ttlMs: Number(stored?.ttlMs) > 0 ? Number(stored.ttlMs) : DEFAULT_TTL_MS,
            openMode: stored?.openMode === 'newtab' ? 'newtab' : 'popup'
        };
    }

    function savePrefs(nextPrefs, categoryName) {
        const currentPrefs = loadPrefs(categoryName);
        const incomingPrefs = nextPrefs && typeof nextPrefs === 'object' ? { ...nextPrefs } : {};
        if (typeof incomingPrefs.hybridSearch === 'boolean' && typeof incomingPrefs.hybridResults !== 'boolean') {
            incomingPrefs.hybridResults = incomingPrefs.hybridSearch;
        }
        const merged = {
            ...currentPrefs,
            ...incomingPrefs
        };
        if (!(Number(merged.ttlMs) > 0)) {
            merged.ttlMs = DEFAULT_TTL_MS;
        }
        merged.liveResults = merged.liveResults === true;
        merged.hybridResults = merged.hybridResults !== false;
        merged.openMode = merged.openMode === 'newtab' ? 'newtab' : 'popup';
        return saveScopedValue(PREFS_KEY, merged, categoryName);
    }

    function getQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return null;

        const pool = loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) return null;

        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            delete pool.queries[queryKey];
            pool.order = pool.order.filter(function (value) { return value !== queryKey; });
            savePool(pool, categoryName);
            return null;
        }

        return entry;
    }

    function touchQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return null;

        const pool = loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) return null;

        entry.lastUsedAt = Date.now();
        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        savePool(pool, categoryName);
        return entry;
    }

    function storeQueryEntry(query, sources, categoryName, options = {}) {
        const queryKey = normalizeQuery(query);
        const queryLabel = normalizeText(query);
        if (!queryKey || !queryLabel) return null;

        const prefs = loadPrefs(categoryName);
        const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : prefs.ttlMs;
        const now = Date.now();
        const pool = loadPool(categoryName);
        const previous = pool.queries[queryKey] || {};

        pool.queries[queryKey] = {
            key: queryKey,
            query: queryLabel,
            sources: sources || {},
            summary: summarizeSources(sources || {}),
            createdAt: previous.createdAt || now,
            updatedAt: now,
            lastUsedAt: now,
            expiresAt: now + ttlMs
        };

        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        savePool(pool, categoryName);
        return pool.queries[queryKey];
    }

    function deleteQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return false;

        const pool = loadPool(categoryName);
        if (!pool.queries[queryKey]) return false;

        delete pool.queries[queryKey];
        pool.order = pool.order.filter(function (value) { return value !== queryKey; });
        return savePool(pool, categoryName);
    }

    function listQueryEntries(categoryName) {
        const pool = loadPool(categoryName);
        return pool.order
            .map(function (queryKey) { return pool.queries[queryKey]; })
            .filter(Boolean)
            .sort(function (left, right) {
                const leftTime = Number(left.lastUsedAt || left.updatedAt || left.createdAt || 0);
                const rightTime = Number(right.lastUsedAt || right.updatedAt || right.createdAt || 0);
                return rightTime - leftTime;
            });
    }

    function clearAll(categoryName) {
        deleteScopedValue(CACHE_KEY, categoryName);
        deleteScopedValue(PREFS_KEY, categoryName);
        return true;
    }

    api.Cache = {
        CACHE_KEY,
        PREFS_KEY,
        DEFAULT_TTL_MS,
        MAX_QUERIES,
        normalizeQuery,
        normalizeCategoryName,
        summarizeSources,
        loadPool,
        savePool,
        loadPrefs,
        savePrefs,
        getQuery: getQueryEntry,
        touchQuery: touchQueryEntry,
        storeQuery: storeQueryEntry,
        deleteQuery: deleteQueryEntry,
        listQueries: listQueryEntries,
        clearAll
    };
})(window.EveOS.API);
