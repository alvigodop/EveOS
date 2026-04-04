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

    function cloneCachedResult(result, overrides = {}) {
        const source = result && typeof result === 'object' ? result : {};
        return {
            ...source,
            categories: Array.isArray(source.categories) ? source.categories.slice() : [],
            tags: Array.isArray(source.tags) ? source.tags.slice() : [],
            genres: Array.isArray(source.genres) ? source.genres.slice() : [],
            names: Array.isArray(source.names) ? source.names.slice() : [],
            aliases: Array.isArray(source.aliases) ? source.aliases.slice() : [],
            ...overrides
        };
    }

    function resolveWikiCacheStore() {
        if (window.CacheCore && !CacheCore._initialized) CacheCore.init();
        return window.CacheCore ? (CacheCore.wikiCacheStore || {}) : {};
    }

    function getCachedEntryRecord(title) {
        const wikiCacheStore = resolveWikiCacheStore();
        const rootEntry = wikiCacheStore ? wikiCacheStore[title] : null;
        const entryResults = wikiCacheStore?.entryResults?.[title];
        return {
            rootEntry: rootEntry && typeof rootEntry === 'object' ? rootEntry : null,
            entryResults: entryResults && typeof entryResults === 'object' ? entryResults : null
        };
    }

    function resolveCachedTimestamp(data) {
        const lastFetch = Number(data?.lastFetch || 0);
        if (lastFetch > 0) return lastFetch;

        const lastUpdate = data?.lastUpdate;
        if (typeof lastUpdate === 'number' && Number.isFinite(lastUpdate) && lastUpdate > 0) {
            return lastUpdate;
        }
        if (typeof lastUpdate === 'string') {
            const parsed = Date.parse(lastUpdate);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 0;
    }

    function hasUsableCachedEntryData(data) {
        if (!data || typeof data !== 'object') return false;
        return Boolean(
            String(data.title || '').trim()
            || String(data.extract || '').trim()
            || String(data.content || '').trim()
            || (Array.isArray(data.links) && data.links.length)
            || (Array.isArray(data.categories) && data.categories.length)
            || (Array.isArray(data.tags) && data.tags.length)
            || (Array.isArray(data.names) && data.names.length)
            || (Array.isArray(data.aliases) && data.aliases.length)
            || (data.searchResults && typeof data.searchResults === 'object' && Object.keys(data.searchResults).length)
        );
    }

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
                    return cachedQueryResults.results.map(r => cloneCachedResult(r, {
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
            const entryRecord = getCachedEntryRecord(title);
            const mainEntryData = entryRecord.entryResults?.main && typeof entryRecord.entryResults.main === 'object'
                ? entryRecord.entryResults.main
                : null;
            const entryData = (cachedData && typeof cachedData === 'object') ? cachedData : mainEntryData;

            if (entryData && hasUsableCachedEntryData(entryData)) {
                const cacheTimestamp = resolveCachedTimestamp(entryData) || resolveCachedTimestamp(entryRecord.entryResults) || resolveCachedTimestamp(entryRecord.rootEntry);
                const isFresh = cacheTimestamp <= 0 || (Date.now() - cacheTimestamp) < CACHE_MAX_AGE_MS;
                if (isFresh) {
                    return {
                        ...entryData,
                        source: 'wikipedia',
                        entryDataFromCache: true,
                        lastFetch: cacheTimestamp || entryData.lastFetch || 0
                    };
                }
            }
        } catch (e) {
            console.warn(`Error reading entry cache for "${title}":`, e);
        }
        return null;
    };

    WikipediaCache.searchCachedEntryStore = function (query, entries, options = {}) {
        const normalizedQuery = window.WikipediaProcessor?.removeDiacritics?.(String(query || '').toLowerCase().trim()) || String(query || '').toLowerCase().trim();
        if (!normalizedQuery || !Array.isArray(entries) || !entries.length || !window.WikipediaProcessor) {
            return [];
        }

        const results = [];
        const processedUrls = new Set();

        entries.forEach((entry) => {
            if (!entry?.title) return;
            const entryRecord = getCachedEntryRecord(entry.title);
            const baseEntryData = entryRecord.rootEntry || entryRecord.entryResults?.main;
            if (baseEntryData && hasUsableCachedEntryData(baseEntryData)) {
                const cachedEntryData = {
                    ...baseEntryData,
                    source: 'wikipedia',
                    entryDataFromCache: true
                };

                const mainResult = window.WikipediaProcessor.createMainEntryResult(entry, cachedEntryData, normalizedQuery, options);
                if (mainResult && !processedUrls.has(mainResult.url)) {
                    results.push(cloneCachedResult(mainResult, {
                        fromCache: true,
                        entryDataFromCache: true
                    }));
                    processedUrls.add(mainResult.url);
                }

                window.WikipediaProcessor.findContentMatches(entry, cachedEntryData, normalizedQuery, options, processedUrls).forEach((result) => {
                    if (processedUrls.has(result.url)) return;
                    results.push(cloneCachedResult(result, {
                        fromCache: true,
                        entryDataFromCache: true
                    }));
                    processedUrls.add(result.url);
                });

                window.WikipediaProcessor.findLinkedMatches(entry, cachedEntryData, normalizedQuery, options, processedUrls).forEach((result) => {
                    if (processedUrls.has(result.url)) return;
                    results.push(cloneCachedResult(result, {
                        fromCache: true,
                        entryDataFromCache: true
                    }));
                    processedUrls.add(result.url);
                });
            }

            const searchResults = entryRecord.entryResults?.searchResults;
            Object.values(searchResults || {}).forEach((value) => {
                if (!value || typeof value !== 'object') return;
                const haystack = window.WikipediaProcessor.removeDiacritics(
                    JSON.stringify(value).toLowerCase()
                );
                if (!haystack.includes(normalizedQuery)) return;

                const url = String(value.url || '').trim();
                const dedupeKey = url || `${entry.title}:${value.title || ''}:${value.snippet || ''}`;
                if (!dedupeKey || processedUrls.has(dedupeKey)) return;
                processedUrls.add(dedupeKey);
                results.push(cloneCachedResult(value, {
                    source: 'wikipedia',
                    fromCache: true,
                    entryDataFromCache: true,
                    relatedTo: value.relatedTo || entry.title
                }));
            });
        });

        return results;
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
                const clonedResults = results.map(result => cloneCachedResult(result));
                await CacheManager.updateGeneric(queryCacheKey, {
                    query: String(query || '').trim(),
                    results: clonedResults,
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
                        CacheManager.wikiCacheStore.entryResults[entryTitle].searchResults[key] = cloneCachedResult(result, {
                            title: result.title,
                            snippet: result.snippet,
                            url: result.url,
                            contentType: result.contentType,
                            categories: result.categories || [],
                            thumbnail: result.thumbnail,
                            isTextMatch: result.isTextMatch,
                            lastUpdate: new Date().toISOString()
                        });
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
            const clonedResults = results.map(result => cloneCachedResult(result));
            await CacheManager.updateGeneric(queryCacheKey, {
                query: String(query || '').trim(),
                results: clonedResults,
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
