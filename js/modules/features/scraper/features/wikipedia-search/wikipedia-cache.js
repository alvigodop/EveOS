/**
 * Wikipedia Cache Module
 * 
 * Handles caching logic for Wikipedia searches.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

    const WikipediaCache = window.WikipediaCache = {
        version: '1.0.0',
        _initialized: true
    };

    /**
     * Check if a query has cached results
     * @param {string} query 
     * @returns {Promise<Array|null>} Returns array of results or null if not found/stale
     */
    WikipediaCache.getCachedQuery = async function (query) {
        if (!window.CacheManager || typeof CacheManager.getGeneric !== 'function') return null;

        const queryCacheKey = `wikipedia_search_${query}`;
        try {
            const cachedQueryResults = await CacheManager.getGeneric(queryCacheKey);
            if (cachedQueryResults && cachedQueryResults.results) {
                const cacheAge = Date.now() - (cachedQueryResults.lastFetch || 0);

                if (cacheAge < CACHE_MAX_AGE_MS) {
                    return cachedQueryResults.results.map(r => ({
                        ...r,
                        fromCache: true
                    }));
                } else {
                    console.log(`Cache stale for query "${query}"`);
                }
            }
        } catch (cacheError) {
            console.warn(`Error reading query cache for "${query}":`, cacheError);
        }
        return null;
    };

    /**
     * Check cache for a specific entry
     * @param {string} title 
     * @returns {Promise<object|null>}
     */
    WikipediaCache.getCachedEntry = async function (title) {
        if (!window.CacheManager) return null;
        try {
            const cachedData = await CacheManager.getWikipediaEntryData(title);
            if (cachedData) {
                const cacheAge = Date.now() - (cachedData.lastFetch || 0);
                const hasCategories = cachedData.categories && Array.isArray(cachedData.categories) && cachedData.categories.length > 0;

                if (cacheAge < CACHE_MAX_AGE_MS && hasCategories) {
                    return { ...cachedData, source: 'wikipedia', entryDataFromCache: true };
                }
            }
        } catch (e) {
            console.warn(`Error reading entry cache for "${title}":`, e);
        }
        return null;
    };

    /**
     * Update cache for a specific entry
     * @param {string} title 
     * @param {object} liveData 
     */
    WikipediaCache.updateEntryCache = async function (title, liveData) {
        if (window.CacheManager && liveData) {
            await CacheManager.updateWikipediaEntryData(title, liveData);
        }
    };

    /**
     * Cache the results of a query
     * @param {string} query 
     * @param {Array} results 
     */
    WikipediaCache.cacheQueryResults = async function (query, results) {
        if (results.length > 0 && window.CacheManager && typeof CacheManager.updateGeneric === 'function') {
            const queryCacheKey = `wikipedia_search_${query}`;
            try {
                await CacheManager.updateGeneric(queryCacheKey, {
                    results: results,
                    lastFetch: Date.now()
                });
            } catch (e) {
                console.warn(`Error caching query results for "${query}":`, e);
            }
        }
    };

    /**
     * Update the global WikiCacheStore with individual results
     * @param {Array} results 
     */
    WikipediaCache.updateWikiCacheStore = function (results) {
        if (results.length > 0 && window.CacheManager && CacheManager.wikiCacheStore) {
            try {
                CacheManager.init();
                if (!CacheManager.wikiCacheStore.entryResults) {
                    CacheManager.wikiCacheStore.entryResults = {};
                }

                const resultsByEntry = {};
                for (const result of results) {
                    const entryKey = result.relatedTo || result.title;
                    if (!resultsByEntry[entryKey]) {
                        resultsByEntry[entryKey] = [];
                    }
                    resultsByEntry[entryKey].push(result);
                }

                for (const [entryTitle, results] of Object.entries(resultsByEntry)) {
                    if (!CacheManager.wikiCacheStore.entryResults[entryTitle]) {
                        CacheManager.wikiCacheStore.entryResults[entryTitle] = {};
                    }
                    if (!CacheManager.wikiCacheStore.entryResults[entryTitle].searchResults) {
                        CacheManager.wikiCacheStore.entryResults[entryTitle].searchResults = {};
                    }

                    for (const result of results) {
                        const key = result.title + (result.isTextMatch ? `_match_${result.matchNumber || 1}` : '');
                        CacheManager.wikiCacheStore.entryResults[entryTitle].searchResults[key] = {
                            title: result.title,
                            snippet: result.snippet,
                            url: result.url,
                            contentType: result.contentType,
                            categories: result.categories || [],
                            thumbnail: result.thumbnail,
                            isTextMatch: result.isTextMatch,
                            lastUpdate: new Date().toISOString()
                        };
                    }
                    CacheManager.wikiCacheStore.entryResults[entryTitle].lastUpdate = new Date().toISOString();
                }

                if (window.CacheCore && typeof CacheCore.saveWikiCacheStore === 'function') {
                    CacheCore.saveWikiCacheStore();
                } else {
                    localStorage.setItem('wikiCacheStore', JSON.stringify(CacheManager.wikiCacheStore));
                }
            } catch (mergeError) {
                console.warn(`Error merging Wikipedia results to cache:`, mergeError);
            }
        }
    };

    /**
     * Update query cache after enrichment
     */
    WikipediaCache.updateQueryCacheAfterEnrichment = async function (query, results) {
        const queryCacheKey = `wikipedia_search_${query}`;
        try {
            await CacheManager.updateGeneric(queryCacheKey, {
                results: results,
                lastFetch: Date.now()
            });
        } catch (e) {
            console.warn('Failed to update cache after enrichment:', e);
        }
    };

    // Register with ModuleRegistry
    if (window.ModuleRegistry) {
        ModuleRegistry.register('WikipediaCache', WikipediaCache);
    }

})();
