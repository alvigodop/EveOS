window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

(function (api) {
    const rt = api.CacheRuntime = api.CacheRuntime || {};
    if (!rt.sharedReady || !rt.storageReady || !rt.queryReady) {
        console.warn('API Cache: runtime modules missing');
        return;
    }

    api.Cache = {
        CACHE_KEY: rt.CACHE_KEY,
        PREFS_KEY: rt.PREFS_KEY,
        DEFAULT_TTL_MS: rt.DEFAULT_TTL_MS,
        FRESHNESS_MS: rt.FRESHNESS_MS,
        MAX_QUERIES: rt.MAX_QUERIES,
        normalizeQuery: rt.normalizeQuery,
        normalizeCategoryName: rt.normalizeCategoryName,
        summarizeSources: rt.summarizeSources,
        loadPool: rt.loadPool,
        savePool: rt.savePool,
        ensurePoolLoaded: rt.ensurePoolLoaded,
        loadPrefs: rt.loadPrefs,
        savePrefs: rt.savePrefs,
        getQuery: rt.getQueryEntry,
        touchQuery: rt.touchQueryEntry,
        storeQuery: rt.storeQueryEntry,
        deleteQuery: rt.deleteQueryEntry,
        listQueries: rt.listQueryEntries,
        searchCachedSources: rt.findCachedSourceMatches,
        clearAll: rt.clearAll
    };
})(window.EveOS.API);
