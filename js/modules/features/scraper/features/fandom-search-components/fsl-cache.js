/**
 * Fandom Search Logic - Cache
 * 
 * Handles cache interactions for Fandom search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const FSLCache = {
        version: '1.0.0',

        init: function () {
            console.log('FSLCache initialized');
            return this;
        },

        /**
         * Try to get results from generic cache
         */
        getCachedResults: async function (domain, query, cacheKey) {
            if (window.CacheManager && typeof CacheManager.getGeneric === 'function') {
                try {
                    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day
                    const cachedData = await CacheManager.getGeneric(cacheKey);

                    if (cachedData) {
                        const cacheAge = Date.now() - (cachedData.lastFetch || 0);
                        if (cacheAge < CACHE_MAX_AGE_MS) {
                            const results = cachedData.results || [];
                            if (results.length > 0) {
                                console.log(`FSLCache: Using fresh cache for ${domain} query "${query}" (${results.length} results)`);
                                return results;
                            } else {
                                console.log(`FSLCache: Cache empty for ${domain} query "${query}"`);
                            }
                        } else {
                            console.log(`FSLCache: Cache stale for ${domain} query "${query}"`);
                        }
                    }
                } catch (cacheError) {
                    console.warn(`FSLCache: Error reading cache for ${domain} query "${query}":`, cacheError);
                }
            }
            return null;
        },

        /**
         * Update generic cache with fresh results
         */
        updateGenericCache: async function (cacheKey, results) {
            if (window.CacheManager && typeof CacheManager.updateGeneric === 'function') {
                try {
                    await CacheManager.updateGeneric(cacheKey, { results: results, lastFetch: Date.now() });
                } catch (cacheWriteError) {
                    console.warn(`FSLCache: Error writing cache:`, cacheWriteError);
                }
            }
        },

        /**
         * Update the main WikiDataStore cache for "View Cache" functionality
         */
        updateDomainStore: function (domain, results) {
            if (results.length > 0 && window.CacheManager && CacheManager.wikiDataStore) {
                try {
                    CacheManager.init();
                    if (!CacheManager.wikiDataStore.searchResults) {
                        CacheManager.wikiDataStore.searchResults = {};
                    }
                    if (!CacheManager.wikiDataStore.searchResults[domain]) {
                        CacheManager.wikiDataStore.searchResults[domain] = { lastUpdate: null };
                    }

                    for (const result of results) {
                        const key = result.title;
                        CacheManager.wikiDataStore.searchResults[domain][key] = {
                            title: result.title,
                            content: result.snippet,
                            snippet: result.snippet,
                            categories: result.categories || [],
                            contentType: result.contentType,
                            thumbnail: result.thumbnail,
                            lastUpdate: new Date().toISOString()
                        };
                    }
                    CacheManager.wikiDataStore.searchResults[domain].lastUpdate = new Date().toISOString();

                    if (window.CacheCore && typeof CacheCore.saveWikiDataStore === 'function') {
                        CacheCore.saveWikiDataStore();
                    } else {
                        localStorage.setItem('wikiDataStore', JSON.stringify(CacheManager.wikiDataStore));
                    }
                } catch (mergeError) {
                    console.warn(`FSLCache: Error merging results to domain cache:`, mergeError);
                }
            }
        }
    };

    // Expose globally
    window.FSLCache = FSLCache;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('FSLCache', FSLCache);
    }
})();
