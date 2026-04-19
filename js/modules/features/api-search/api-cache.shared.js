window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CacheRuntime = api.CacheRuntime || {};
    if (rt.sharedReady) return;

    rt.CACHE_KEY = 'apiSearchCachePool';
    rt.PREFS_KEY = 'apiSearchPrefs';
    rt.DEFAULT_TTL_MS = 0;
    rt.FRESHNESS_MS = 24 * 60 * 60 * 1000;
    rt.MAX_QUERIES = 500;

    rt._memoryPools = rt._memoryPools || {};
    rt._poolLoadPromises = rt._poolLoadPromises || {};
    rt._prefsWrites = rt._prefsWrites || {};

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

        const tokens = normalizedQuery.split(/[^a-z0-9]+/i).filter(function (token) {
            return String(token).length > 2;
        });
        if (!tokens.length) return false;

        const matchCount = tokens.filter(function (token) {
            return haystack.includes(token);
        }).length;

        return matchCount > 0 && (matchCount / tokens.length) >= 0.55;
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

        if (!nextPool._migrated_v2) {
            const now = Date.now();
            Object.keys(nextPool.queries).forEach(function (queryKey) {
                const entry = nextPool.queries[queryKey];
                if (entry && entry.expiresAt && entry.expiresAt > 0 && entry.expiresAt <= now) {
                    entry.expiresAt = 0;
                }
            });
            nextPool._migrated_v2 = true;
        }

        return nextPool;
    }

    function prunePool(pool) {
        const now = Date.now();
        const seen = new Set();
        const prunedOrder = [];

        Object.keys(pool.queries).forEach(function (queryKey) {
            const entry = pool.queries[queryKey];
            if (!entry || (entry.expiresAt && entry.expiresAt > 0 && entry.expiresAt <= now)) {
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

        while (prunedOrder.length > rt.MAX_QUERIES) {
            const removedKey = prunedOrder.pop();
            delete pool.queries[removedKey];
        }

        pool.order = prunedOrder;
        return pool;
    }

    Object.assign(rt, {
        normalizeText,
        normalizeQuery,
        normalizeCategoryName,
        fallbackStorageKey,
        toArray,
        cloneValue,
        normalizeSearchText,
        matchesSearchText,
        getProviderList,
        setProviderList,
        getSearchableProviderKeys,
        summarizeSources,
        ensurePoolShape,
        prunePool
    });

    rt.sharedReady = true;
})(window.EveOS.API);
