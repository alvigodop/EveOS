window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const CACHE_KEY = 'apiSearchCachePool';
    const PREFS_KEY = 'apiSearchPrefs';
    const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
    const MAX_QUERIES = 50; 

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
        return `${normalizeCategoryName(categoryName)}_${key}`;
    }

    const _memoryPools = {};

    async function withScopedContext(categoryName, callback) {
        const manager = window.StorageManager;
        if (!manager || typeof manager.setCategoryContext !== 'function') {
            return await callback(null);
        }

        const previousContext = manager.categoryContext;
        const nextContext = normalizeText(categoryName);
        if (nextContext) {
            manager.setCategoryContext(nextContext);
        }

        try {
            return await callback(manager);
        } finally {
            manager.setCategoryContext(previousContext || null);
        }
    }

    async function loadScopedValue(key, defaultValue, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            if (manager && typeof manager.loadHeavyData === 'function' && key === CACHE_KEY) {
                return await manager.loadHeavyData(key, defaultValue);
            }
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

    async function saveScopedValue(key, value, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            if (manager && typeof manager.saveHeavyData === 'function' && key === CACHE_KEY) {
                return await manager.saveHeavyData(key, value);
            }
            if (manager && typeof manager.saveData === 'function') {
                return await manager.saveData(key, value);
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

    async function deleteScopedValue(key, categoryName) {
        return await withScopedContext(categoryName, async function (manager) {
            if (manager && typeof manager.deleteHeavyData === 'function' && key === CACHE_KEY) {
                return await manager.deleteHeavyData(key);
            }
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

    function cloneValue(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function normalizeSearchText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function matchesSearchText(query, value) {
        const normalizedQuery = normalizeSearchText(query);
        if (!normalizedQuery) return false;

        const haystack = normalizeSearchText(value);
        if (!haystack) return false;
        if (haystack.includes(normalizedQuery)) return true;

        const tokens = normalizedQuery.split(/[^a-z0-9]+/i).filter(Boolean);
        if (!tokens.length) return false;
        return tokens.every(function (token) {
            return haystack.includes(token);
        });
    }

    function getProviderList(sources, providerKey) {
        switch (providerKey) {
            case 'mangadex':
                return toArray(sources?.mangadex?.data);
            case 'jikanManga':
                return toArray(sources?.jikanManga?.data);
            case 'jikanAnime':
                return toArray(sources?.jikanAnime?.data);
            case 'anilistManga':
                return toArray(sources?.anilistManga?.data?.Page?.media);
            case 'anilistAnime':
                return toArray(sources?.anilistAnime?.data?.Page?.media);
            case 'mangaupdates':
                return toArray(sources?.mangaupdates?.results);
            case 'kitsuAnime':
                return toArray(sources?.kitsuAnime?.data);
            case 'kitsuManga':
                return toArray(sources?.kitsuManga?.data);
            case 'tvmaze':
                return toArray(sources?.tvmaze);
            case 'itunes':
                return toArray(sources?.itunes?.results);
            case 'wlnupdates':
                return toArray(sources?.wlnupdates?.data);
            case 'openlibrary':
                return toArray(sources?.openlibrary?.docs);
            case 'comick':
                return toArray(sources?.comick);
            default:
                return [];
        }
    }

    function setProviderList(target, providerKey, items) {
        const list = toArray(items).map(cloneValue);
        switch (providerKey) {
            case 'mangadex':
                target.mangadex = { data: list };
                break;
            case 'jikanManga':
                target.jikanManga = { data: list };
                break;
            case 'jikanAnime':
                target.jikanAnime = { data: list };
                break;
            case 'anilistManga':
                target.anilistManga = { data: { Page: { media: list } } };
                break;
            case 'anilistAnime':
                target.anilistAnime = { data: { Page: { media: list } } };
                break;
            case 'mangaupdates':
                target.mangaupdates = { results: list };
                break;
            case 'kitsuAnime':
                target.kitsuAnime = { data: list };
                break;
            case 'kitsuManga':
                target.kitsuManga = { data: list };
                break;
            case 'tvmaze':
                target.tvmaze = list;
                break;
            case 'itunes':
                target.itunes = { results: list };
                break;
            case 'wlnupdates':
                target.wlnupdates = { data: list };
                break;
            case 'openlibrary':
                target.openlibrary = { docs: list };
                break;
            case 'comick':
                target.comick = list;
                break;
        }
    }

    function getSearchableProviderKeys() {
        return [
            'mangadex',
            'jikanManga',
            'jikanAnime',
            'anilistManga',
            'anilistAnime',
            'mangaupdates',
            'kitsuAnime',
            'kitsuManga',
            'tvmaze',
            'itunes',
            'wlnupdates',
            'openlibrary',
            'comick'
        ];
    }

    async function findCachedSourceMatches(query, categoryName, providerKey) {
        const normalizedQuery = normalizeQuery(query);
        if (!normalizedQuery) {
            return null;
        }

        const pool = await loadPool(categoryName);
        const matchedSources = {};
        const matchedQueryKeys = [];
        const allowedProviders = providerKey ? [providerKey] : getSearchableProviderKeys();

        (pool.order || []).forEach(function (queryKey) {
            const entry = pool.queries[queryKey];
            if (!entry?.sources) return;

            let matchedThisQuery = false;
            allowedProviders.forEach(function (nextProviderKey) {
                const items = getProviderList(entry.sources, nextProviderKey);
                if (!items.length) return;

                const matchedItems = items.filter(function (item) {
                    return matchesSearchText(normalizedQuery, JSON.stringify(item));
                });
                if (!matchedItems.length) return;

                const existingItems = getProviderList(matchedSources, nextProviderKey);
                const seen = new Set(existingItems.map(function (item) {
                    return normalizeSearchText(JSON.stringify(item));
                }));

                matchedItems.forEach(function (item) {
                    const dedupeKey = normalizeSearchText(JSON.stringify(item));
                    if (!dedupeKey || seen.has(dedupeKey)) return;
                    seen.add(dedupeKey);
                    existingItems.push(cloneValue(item));
                });

                if (existingItems.length) {
                    setProviderList(matchedSources, nextProviderKey, existingItems);
                    matchedThisQuery = true;
                }
            });

            if (matchedThisQuery) {
                matchedQueryKeys.push(queryKey);
            }
        });

        const summary = summarizeSources(matchedSources);
        if (!(summary.totalResults > 0)) {
            return null;
        }

        matchedQueryKeys.forEach(function (queryKey) {
            const entry = pool.queries[queryKey];
            if (entry) {
                entry.lastUsedAt = Date.now();
            }
        });
        if (matchedQueryKeys.length) {
            await savePool(pool, categoryName);
        }

        return {
            query: normalizeText(query),
            key: normalizedQuery,
            sources: matchedSources,
            summary,
            cacheOrigin: 'pool-search',
            matchedQueries: matchedQueryKeys.slice()
        };
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

        (pool.order || []).forEach(function (queryKey) {
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

    async function loadPool(categoryName) {
        const normalized = normalizeCategoryName(categoryName);
        if (_memoryPools[normalized]) {
            const pool = _memoryPools[normalized];
            prunePool(pool);
            return pool;
        }

        const pool = ensurePoolShape(await loadScopedValue(CACHE_KEY, { queries: {}, order: [] }, categoryName));
        prunePool(pool);
        
        _memoryPools[normalized] = pool;
        return pool;
    }

    async function savePool(pool, categoryName) {
        const normalized = normalizeCategoryName(categoryName);
        const nextPool = prunePool(ensurePoolShape(pool));
        _memoryPools[normalized] = nextPool;
        return await saveScopedValue(CACHE_KEY, nextPool, categoryName);
    }

    async function loadPrefs(categoryName) {
        const stored = await loadScopedValue(PREFS_KEY, {}, categoryName);
        return {
            liveResults: stored?.liveResults === true,
            hybridResults: stored?.hybridResults !== false,
            ttlMs: Number(stored?.ttlMs) > 0 ? Number(stored.ttlMs) : DEFAULT_TTL_MS,
            openMode: stored?.openMode === 'newtab' ? 'newtab' : 'popup'
        };
    }

    async function savePrefs(nextPrefs, categoryName) {
        const currentPrefs = await loadPrefs(categoryName);
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
        return await saveScopedValue(PREFS_KEY, merged, categoryName);
    }

    async function getQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return null;

        const pool = await loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) return null;

        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            delete pool.queries[queryKey];
            pool.order = pool.order.filter(function (value) { return value !== queryKey; });
            await savePool(pool, categoryName);
            return null;
        }

        return entry;
    }

    async function touchQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return null;

        const pool = await loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) {
            console.log(`API Cache: Miss for query [${query}] in context [${categoryName}]`);
            return null;
        }

        console.log(`API Cache: Hit for query [${query}] in context [${categoryName}]`);
        entry.lastUsedAt = Date.now();
        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        await savePool(pool, categoryName);
        return entry;
    }

    async function storeQueryEntry(query, sources, categoryName, options = {}) {
        const queryKey = normalizeQuery(query);
        const queryLabel = normalizeText(query);
        if (!queryKey || !queryLabel) return null;

        const prefs = await loadPrefs(categoryName);
        const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : prefs.ttlMs;
        const now = Date.now();
        const pool = await loadPool(categoryName);
        const previous = pool.queries[queryKey] || {};

        // Merge sources to prevent overwriting results from different providers
        const mergedSources = {
            ...(previous.sources || {}),
            ...(sources || {})
        };

        // --- RUTHLESS TRIMMING ---
        // Slice massive API arrays down to the top 15 display items
        // This effectively cuts the localStorage payload size by up to 80%
        getSearchableProviderKeys().forEach(function(providerKey) {
            const list = getProviderList(mergedSources, providerKey);
            if (list && list.length > 15) {
                setProviderList(mergedSources, providerKey, list.slice(0, 15));
            }
        });
        // -------------------------

        pool.queries[queryKey] = {
            key: queryKey,
            query: queryLabel,
            sources: mergedSources,
            summary: summarizeSources(mergedSources),
            createdAt: previous.createdAt || now,
            updatedAt: now,
            lastUsedAt: now,
            expiresAt: now + ttlMs
        };

        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        await savePool(pool, categoryName);
        console.log(`API Cache: Stored query [${queryLabel}] in context [${categoryName}] (${Object.keys(mergedSources).length} sources)`);
        return pool.queries[queryKey];
    }

    async function deleteQueryEntry(query, categoryName) {
        const queryKey = normalizeQuery(query);
        if (!queryKey) return false;

        const pool = await loadPool(categoryName);
        if (!pool.queries[queryKey]) return false;

        delete pool.queries[queryKey];
        pool.order = pool.order.filter(function (value) { return value !== queryKey; });
        return await savePool(pool, categoryName);
    }

    async function listQueryEntries(categoryName) {
        const pool = await loadPool(categoryName);
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
        searchCachedSources: findCachedSourceMatches,
        clearAll
    };
})(window.EveOS.API);
