window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CacheRuntime = api.CacheRuntime || {};
    if (rt.queryReady || !rt.sharedReady || !rt.storageReady) return;

    async function findCachedSourceMatches(query, categoryName, providerKey) {
        const normalizedQuery = rt.normalizeQuery(query);
        if (!normalizedQuery) {
            return null;
        }

        const pool = await rt.loadPool(categoryName);
        console.log(`findCachedSourceMatches pool for [${categoryName}] has ${Object.keys(pool.queries || {}).length} queries.`);
        const matchedSources = {};
        const matchedQueryKeys = [];
        const allowedProviders = providerKey ? [providerKey] : rt.getSearchableProviderKeys();

        (pool.order || []).forEach(function (queryKey) {
            const entry = pool.queries[queryKey];
            if (!entry?.sources) return;

            let matchedThisQuery = false;
            allowedProviders.forEach(function (nextProviderKey) {
                const items = rt.getProviderList(entry.sources, nextProviderKey);
                if (!items.length) return;

                const matchedItems = items.filter(function (item) {
                    return rt.matchesSearchText(normalizedQuery, JSON.stringify(item));
                });
                if (!matchedItems.length) return;

                const existingItems = rt.getProviderList(matchedSources, nextProviderKey);
                const seen = new Set(existingItems.map(function (item) {
                    return rt.normalizeSearchText(JSON.stringify(item));
                }));

                matchedItems.forEach(function (item) {
                    const dedupeKey = rt.normalizeSearchText(JSON.stringify(item));
                    if (!dedupeKey || seen.has(dedupeKey)) return;
                    seen.add(dedupeKey);
                    existingItems.push(rt.cloneValue(item));
                });

                if (existingItems.length) {
                    rt.setProviderList(matchedSources, nextProviderKey, existingItems);
                    matchedThisQuery = true;
                }
            });

            if (matchedThisQuery) {
                matchedQueryKeys.push(queryKey);
            }
        });

        const summary = rt.summarizeSources(matchedSources);
        console.log(`findCachedSourceMatches matched items: ${summary.totalResults}`);
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
            await rt.savePool(pool, categoryName);
        }

        return {
            query: rt.normalizeText(query),
            key: normalizedQuery,
            sources: matchedSources,
            summary,
            cacheOrigin: 'pool-search',
            matchedQueries: matchedQueryKeys.slice()
        };
    }

    async function getQueryEntry(query, categoryName) {
        const queryKey = rt.normalizeQuery(query);
        if (!queryKey) return null;

        const pool = await rt.loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) return null;

        if (entry.expiresAt && entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
            delete pool.queries[queryKey];
            pool.order = pool.order.filter(function (value) { return value !== queryKey; });
            await rt.savePool(pool, categoryName);
            return null;
        }

        return entry;
    }

    async function touchQueryEntry(query, categoryName) {
        const queryKey = rt.normalizeQuery(query);
        if (!queryKey) return null;

        const pool = await rt.loadPool(categoryName);
        const entry = pool.queries[queryKey];
        if (!entry) {
            console.log(`API Cache: Miss for query [${query}] in context [${categoryName}]`);
            return null;
        }

        console.log(`API Cache: Hit for query [${query}] in context [${categoryName}]`);
        entry.lastUsedAt = Date.now();
        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        await rt.savePool(pool, categoryName);
        return entry;
    }

    async function storeQueryEntry(query, sources, categoryName, options = {}) {
        const queryKey = rt.normalizeQuery(query);
        const queryLabel = rt.normalizeText(query);
        if (!queryKey || !queryLabel) return null;

        const prefs = await rt.loadPrefs(categoryName);
        const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : prefs.ttlMs;
        const now = Date.now();
        const pool = await rt.loadPool(categoryName);
        const previous = pool.queries[queryKey] || {};

        const mergedSources = {
            ...(previous.sources || {}),
            ...(sources || {})
        };

        pool.queries[queryKey] = {
            key: queryKey,
            query: queryLabel,
            sources: mergedSources,
            summary: rt.summarizeSources(mergedSources),
            createdAt: previous.createdAt || now,
            updatedAt: now,
            lastUsedAt: now,
            expiresAt: ttlMs > 0 ? (now + ttlMs) : 0
        };

        pool.order = [queryKey].concat(pool.order.filter(function (value) { return value !== queryKey; }));
        await rt.savePool(pool, categoryName);
        console.log(`API Cache: Stored query [${queryLabel}] in [${categoryName}] (${Object.keys(mergedSources).length} sources)`);
        return pool.queries[queryKey];
    }

    async function deleteQueryEntry(query, categoryName) {
        const queryKey = rt.normalizeQuery(query);
        if (!queryKey) return false;

        const pool = await rt.loadPool(categoryName);
        if (!pool.queries[queryKey]) return false;

        delete pool.queries[queryKey];
        pool.order = pool.order.filter(function (value) { return value !== queryKey; });
        return await rt.savePool(pool, categoryName);
    }

    async function listQueryEntries(categoryName) {
        const pool = await rt.loadPool(categoryName);
        return pool.order
            .map(function (queryKey) { return pool.queries[queryKey]; })
            .filter(Boolean)
            .sort(function (left, right) {
                const leftTime = Number(left.lastUsedAt || left.updatedAt || left.createdAt || 0);
                const rightTime = Number(right.lastUsedAt || right.updatedAt || right.createdAt || 0);
                return rightTime - leftTime;
            });
    }

    Object.assign(rt, {
        findCachedSourceMatches,
        getQueryEntry,
        touchQueryEntry,
        storeQueryEntry,
        deleteQueryEntry,
        listQueryEntries
    });

    rt.queryReady = true;
})(window.EveOS.API);
