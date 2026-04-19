window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.orchestratorApiReady || !ctx.orchestratorSharedReady) return;

    ctx.resolveApiSearchData = async function resolveApiSearchData(query, options = {}, loadingCallback = null) {
        if (!query) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;

        if (api.Cache && typeof api.Cache.ensurePoolLoaded === 'function') {
            await api.Cache.ensurePoolLoaded(resolvedCategory);
        }
        const shouldUseLive = await ctx.resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = await ctx.resolveHybridPreference(resolvedCategory, options.hybridResults);
        const normalizedQuery = String(query).trim();

        if (typeof loadingCallback === 'function') {
            loadingCallback(true, 'api', `Checking cache for "${normalizedQuery}"...`, { statusPhase: 'cache' });
        }

        try {
            const exactCachedEntry = api.Cache ? await api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;
            const exactCachedVisibleSources = ctx.filterSourcesByProvider(exactCachedEntry?.sources || {}, providerKey);
            const exactCachedVisibleCount = ctx.countResults(exactCachedVisibleSources);
            const derivedCachedEntry = (!exactCachedVisibleCount && api.Cache && typeof api.Cache.searchCachedSources === 'function')
                ? await api.Cache.searchCachedSources(normalizedQuery, resolvedCategory, providerKey)
                : null;
            const activeCachedEntry = exactCachedVisibleCount > 0 ? exactCachedEntry : derivedCachedEntry;
            const cachedVisibleSources = ctx.filterSourcesByProvider(activeCachedEntry?.sources || {}, providerKey);
            const cachedVisibleCount = ctx.countResults(cachedVisibleSources);

            if (!shouldUseLive && activeCachedEntry?.sources && cachedVisibleCount > 0) {
                const freshnessMs = 24 * 60 * 60 * 1000;
                const isFresh = (activeCachedEntry.updatedAt || activeCachedEntry.createdAt || 0) > (Date.now() - freshnessMs);
                const isShallow = ctx.isShallowApiCache(activeCachedEntry);

                if (!shouldUseHybrid || !isShallow) {
                    if (api.Cache && exactCachedVisibleCount > 0) await api.Cache.touchQuery(normalizedQuery, resolvedCategory);

                    if (typeof loadingCallback === 'function') {
                        loadingCallback(true, 'api', `Using ${isFresh ? 'fresh ' : ''}cached results for "${normalizedQuery}"`, {
                            statusPhase: 'results',
                            resultsFound: cachedVisibleCount
                        });
                    }

                    return {
                        query: normalizedQuery,
                        categoryName: resolvedCategory,
                        providerKey,
                        allSources: activeCachedEntry.sources,
                        visibleSources: cachedVisibleSources,
                        entry: activeCachedEntry,
                        meta: {
                            fromCache: true,
                            cacheOrigin: activeCachedEntry?.cacheOrigin || 'query',
                            providerKey,
                            summary: api.Cache?.summarizeSources?.(cachedVisibleSources) || { totalResults: 0 }
                        }
                    };
                }

                console.log('API Orchestrator: Hybrid search active - proceeding to discovery enrichment despite fresh cache.');
                if (typeof loadingCallback === 'function') {
                    loadingCallback(true, 'api', `Cache found for "${normalizedQuery}", proceeding to discovery enrichment...`, {
                        statusPhase: 'live',
                        resultsFound: cachedVisibleCount
                    });
                }
            }

            if (!shouldUseLive && !shouldUseHybrid) {
                return {
                    query: normalizedQuery,
                    categoryName: resolvedCategory,
                    providerKey,
                    allSources: {},
                    visibleSources: {},
                    meta: {
                        fromCache: false,
                        cacheMiss: true,
                        cacheOnly: true,
                        providerKey,
                        summary: { totalResults: 0 }
                    }
                };
            }

            const skipSources = (activeCachedEntry?.sources && cachedVisibleCount > 0)
                ? activeCachedEntry.sources
                : null;

            if (typeof loadingCallback === 'function') {
                const label = providerKey ? ctx.getProviderLabel(providerKey) : 'API providers';
                loadingCallback(true, 'api', `Fetching live results from ${label}...`, { statusPhase: 'live' });
            }

            const liveSources = await ctx.collectLiveResults(normalizedQuery, providerKey, skipSources);
            const hasCacheToMerge = activeCachedEntry?.sources && ctx.countResults(activeCachedEntry.sources) > 0;
            const mergedSources = ctx.mergeSources(activeCachedEntry?.sources, liveSources);
            const visibleSources = ctx.filterSourcesByProvider(mergedSources, providerKey);
            const totalVisible = ctx.countResults(visibleSources);

            if (typeof loadingCallback === 'function') {
                loadingCallback(true, 'api', `API search complete: ${totalVisible} results`, {
                    statusPhase: 'results',
                    resultsFound: totalVisible
                });
            }

            const storedEntry = api.Cache ? await api.Cache.storeQuery(normalizedQuery, mergedSources, resolvedCategory, { ttlMs: options.ttlMs }) : null;

            return {
                query: normalizedQuery,
                categoryName: resolvedCategory,
                providerKey,
                allSources: mergedSources,
                visibleSources,
                entry: storedEntry,
                meta: {
                    fromCache: false,
                    hybridMatch: hasCacheToMerge,
                    providerKey,
                    summary: api.Cache?.summarizeSources?.(visibleSources) || { totalResults: 0 }
                }
            };
        } catch (error) {
            console.error('API search error:', error);
            const exactCachedEntry = api.Cache ? await api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;
            const cachedVisibleSources = ctx.filterSourcesByProvider(exactCachedEntry?.sources || {}, providerKey);
            const cachedVisibleCount = ctx.countResults(cachedVisibleSources);

            if (exactCachedEntry?.sources && cachedVisibleCount > 0) {
                if (api.Cache) await api.Cache.touchQuery(normalizedQuery, resolvedCategory);
                return {
                    query: normalizedQuery,
                    categoryName: resolvedCategory,
                    providerKey,
                    allSources: exactCachedEntry.sources,
                    visibleSources: cachedVisibleSources,
                    entry: exactCachedEntry,
                    error,
                    meta: {
                        fromCache: true,
                        fallback: true,
                        cacheOrigin: exactCachedEntry?.cacheOrigin || 'query',
                        providerKey,
                        summary: api.Cache?.summarizeSources?.(cachedVisibleSources) || { totalResults: 0 }
                    }
                };
            }

            return {
                query: normalizedQuery,
                categoryName: resolvedCategory,
                providerKey,
                allSources: {},
                visibleSources: {},
                error,
                meta: {
                    error,
                    providerKey,
                    summary: { totalResults: 0 }
                }
            };
        } finally {
            if (typeof loadingCallback === 'function') {
                loadingCallback(false, 'api', 'API search data resolved');
            }
        }
    };

    ctx.orchestratorApiReady = true;
})(window.EveOS.API);
