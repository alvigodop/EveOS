/**
 * Search Wikipedia - Orchestrator
 * 
 * Orchestrates Wikipedia search logic.
 * 
 * @version 1.0.1
 */

(function () {
    'use strict';

    const SWOrchestrator = {
        version: '1.0.1',

        /**
         * Check if entry data is considered "shallow" (missing deep content)
         */
        isShallowEntryData: function (data) {
            if (!data || typeof data !== 'object') return true;
            const hasLinks = Array.isArray(data.links) && data.links.length > 0;
            const hasExtract = typeof data.extract === 'string' && data.extract.trim().length > 0;
            const hasSections = Array.isArray(data.sections) && data.sections.length > 0;
            return !hasLinks && !hasExtract && !hasSections;
        },

        init: function () {
            console.log('SWOrchestrator initialized');
            return this;
        },

        /**
         * Search managed Wikipedia entries
         */
        searchManagedWikipedia: async function (entries, query, options, showLoadingFn) {
            console.log(`SWOrchestrator: Searching ${entries.length} entries for "${query}"`, options);

            // Dependency Checks
            if (!window.WikipediaProcessor) {
                console.error("SWOrchestrator: WikipediaProcessor missing");
                return [];
            }

            const normalizedQuery = WikipediaProcessor.removeDiacritics(query.toLowerCase().trim());
            const shouldUseCache = options.liveSearch !== true;
            const shouldFetchLive = options.liveSearch === true || options.hybridSearch !== false;

            try {
                // --- 1. Global Query Cache Check ---
                if (shouldUseCache && window.WikipediaCache) {
                    const cachedResults = await WikipediaCache.getCachedQuery(normalizedQuery);
                    if (cachedResults) {

                        // Filter cached results against active entries to prevent "ghost" results from deleted entries
                        // This fixes the issue where results persist even after an entry is removed from the category
                        const activeTitles = new Set(entries.map(e => e.title.toLowerCase()));
                        const validResults = cachedResults.filter(r => {
                            // If result has no relation info (rare/legacy), default to keep, otherwise check
                            if (!r.relatedTo) return true;
                            return activeTitles.has(r.relatedTo.toLowerCase());
                        });

                        if (validResults.length > 0) {
                            // Check if enrichment needed
                            const needsEnrichment = validResults.some(r => !r.categories || !r.extractedData);
                            if (needsEnrichment && window.WikipediaAPI) {
                                console.log(`SWOrchestrator: Cached results have missing categories, triggering enrichment for query "${query}"...`);
                                await WikipediaAPI.enrichResults(validResults);
                                // Note: We might update the cache here with filtered results, effectively cleaning it
                                await WikipediaCache.updateQueryCacheAfterEnrichment(normalizedQuery, validResults);
                            } else {
                                console.log(`SWOrchestrator: Using cached search results for query "${query}" (${validResults.length} valid / ${cachedResults.length} total)`);
                            }
                            // Refresh entries tab and re-render so "CACHED" badge stays in sync (even when serving from cache)
                            if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                                WikiManager.refreshCacheStores();
                            }
                            if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                                WikiManager.renderWikiEntryList(true);
                            }
                            
                            // [MOD] If hybridSearch is active, do not return early with cached query. 
                            // Proceed to discovery loop so we can enrich with link/content discovery.
                            if (options.hybridSearch !== true) {
                                console.log(`SWOrchestrator: Returning early with exact cached query results (hybridSearch disabled)`);
                                return validResults.map(function (r) {
                                    return { ...r, fromCache: true };
                                });
                            }
                            
                            console.log(`SWOrchestrator: Exact cached query found but continuing to discovery loop (Hybrid Mode enrichment)`);
                        }
                    }
                }

                // --- 1.5. Local Entry Store Fallback (Similar Word Matching) ---
                if (shouldUseCache && window.WikipediaCache && typeof WikipediaCache.searchCachedEntryStore === 'function') {
                    const fallbackResults = WikipediaCache.searchCachedEntryStore(normalizedQuery, entries, { hidePersons: false });
                    if (fallbackResults && fallbackResults.length > 0) {
                        console.log(`SWOrchestrator: Found ${fallbackResults.length} partial match results in local entry store for "${query}"`);
                        
                        // Refresh entries tab and re-render so "CACHED" badge stays in sync
                        if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                            WikiManager.refreshCacheStores();
                        }
                        if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                            WikiManager.renderWikiEntryList(true);
                        }
                        
                        // [MOD] If hybridSearch is active, do not return early here. 
                        // Proceed to the full discovery loop so we find all links/snippets/sections
                        if (options.hybridSearch !== true) {
                            console.log(`SWOrchestrator: Returning early with shallow results (hybridSearch disabled)`);
                            return fallbackResults.map(function (r) {
                                return { ...r, fromCache: true };
                            });
                        }
                        
                        console.log(`SWOrchestrator: Found shallow matches but continuing to discovery loop (Hybrid Mode)`);
                    }
                }

                console.log(`SWOrchestrator: No cached results or partial matches found for query "${query}", fetching fresh results`);

                const allResults = [];
                const processedUrls = new Set();
                let searchedEntries = 0;
                const totalEntries = entries.length;

                for (const entry of entries) {
                    if (!entry || !entry.title) continue;

                    searchedEntries++;
                    if (showLoadingFn) {
                        showLoadingFn(true, 'results', `Checking Wikipedia entry ${searchedEntries}/${totalEntries}: ${entry.name || entry.title}`, {
                            wikisSearched: searchedEntries,
                            totalWikis: totalEntries,
                            resultsFound: allResults.length,
                            currentResult: entry.name || entry.title,
                            statusPhase: 'init'
                        });
                    }

                    let entryData = null;
                    let isEntryFromCache = false;

                    // --- 2. Entry-Level Cache ---
                    if (shouldUseCache && window.WikipediaCache) {
                        entryData = await WikipediaCache.getCachedEntry(entry.title);
                        if (entryData) {
                            isEntryFromCache = true;
                            console.log(`SWOrchestrator: Using fresh cache for Wikipedia entry "${entry.title}"`);
                            if (showLoadingFn) {
                                showLoadingFn(true, 'results', `Checking Wikipedia entry ${searchedEntries}/${totalEntries}: ${entry.name || entry.title}`, {
                                    wikisSearched: searchedEntries,
                                    totalWikis: totalEntries,
                                    resultsFound: allResults.length,
                                    currentResult: entry.title,
                                    statusPhase: 'cache'
                                });
                            }
                        }
                    }

                    // --- 3. Live Fetch (if no cache OR shallow cache in Hybrid mode) ---
                    const isShallow = this.isShallowEntryData(entryData);
                    if ((!entryData || (options.hybridSearch && isShallow)) && shouldFetchLive && window.WikipediaAPI) {
                        if (entryData && isShallow) {
                            console.log(`SWOrchestrator: Cache for "${entry.title}" is shallow. Triggering Hybrid Discovery...`);
                            if (showLoadingFn) {
                                showLoadingFn(true, 'results', `Discovering related articles for "${entry.title}"...`, {
                                    wikisSearched: searchedEntries,
                                    totalWikis: totalEntries,
                                    resultsFound: allResults.length,
                                    currentResult: entry.title,
                                    statusPhase: 'live'
                                });
                            }
                        } else {
                            console.log(`SWOrchestrator: Fetching live data for Wikipedia entry "${entry.title}"`);
                            if (showLoadingFn) {
                                showLoadingFn(true, 'results', `Fetching live Wikipedia data for "${entry.title}"...`, {
                                    wikisSearched: searchedEntries,
                                    totalWikis: totalEntries,
                                    resultsFound: allResults.length,
                                    currentResult: entry.title,
                                    statusPhase: 'live'
                                });
                            }
                        }
                        try {
                            const liveData = await WikipediaAPI.fetchLiveEntry(entry.title);
                            if (liveData) {
                                liveData.source = 'wikipedia';
                                isEntryFromCache = false;
                                // Update Entry Cache
                                if (window.CacheManager && window.WikipediaCache) {
                                    await WikipediaCache.updateEntryCache(entry.title, liveData);
                                }
                                entryData = liveData;

                                // Check if live data matches early (optimization)
                                const isMatch = WikipediaProcessor.isMatch(liveData, normalizedQuery);
                                if (isMatch) {
                                    if (showLoadingFn) {
                                        showLoadingFn(true, 'results', `Searching Wikipedia entry ${searchedEntries}/${totalEntries}: ${entry.name || entry.title}`, {
                                            wikisSearched: searchedEntries,
                                            totalWikis: totalEntries,
                                            resultsFound: allResults.length,
                                            currentResult: liveData.title,
                                            statusPhase: 'found'
                                        });
                                    }
                                }
                            } else {
                                console.log(`SWOrchestrator: No live data returned for "${entry.title}"`);
                            }
                        } catch (fetchError) {
                            console.error(`SWOrchestrator: Error fetching live data for "${entry.title}":`, fetchError);
                        }
                    }

                    // --- 4. Process Data & Generate Results ---
                    if (entryData) {
                        const resultFlags = {
                            fromCache: isEntryFromCache,
                            entryDataFromCache: isEntryFromCache
                        };

                        // A. Main Entry Match
                        const mainResultRaw = WikipediaProcessor.createMainEntryResult(entry, entryData, normalizedQuery, options);
                        if (mainResultRaw) {
                            const mainResult = { ...mainResultRaw, ...resultFlags };
                            if (!processedUrls.has(mainResult.url)) {
                                allResults.push(mainResult);
                                processedUrls.add(mainResult.url);
                                if (showLoadingFn) {
                                    showLoadingFn(true, 'results', `Searching Wikipedia entry ${searchedEntries}/${totalEntries}: ${entry.name || entry.title}`, {
                                        wikisSearched: searchedEntries,
                                        totalWikis: totalEntries,
                                        resultsFound: allResults.length,
                                        currentResult: entry.title,
                                        statusPhase: 'found'
                                    });
                                }
                            }
                        }

                        // B. Content Matches (Snippet Search)
                        const contentMatches = WikipediaProcessor.findContentMatches(entry, entryData, normalizedQuery, options, processedUrls);
                        contentMatches.forEach(resultRaw => {
                            const result = { ...resultRaw, ...resultFlags };
                            if (!processedUrls.has(result.url)) {
                                allResults.push(result);
                                processedUrls.add(result.url);
                            }
                        });

                        // C. Linked Article Matches
                        const linkedMatches = WikipediaProcessor.findLinkedMatches(entry, entryData, normalizedQuery, options, processedUrls);
                        linkedMatches.forEach(resultRaw => {
                            const result = { ...resultRaw, ...resultFlags };
                            if (!processedUrls.has(result.url)) {
                                allResults.push(result);
                                processedUrls.add(result.url);
                                if (showLoadingFn) {
                                    showLoadingFn(true, 'results', `Searching Wikipedia entry ${searchedEntries}/${totalEntries}: ${entry.name || entry.title}`, {
                                        wikisSearched: searchedEntries,
                                        totalWikis: totalEntries,
                                        resultsFound: allResults.length,
                                        currentResult: result.title,
                                        statusPhase: 'links'
                                    });
                                }
                            }
                        });
                    }
                }

                // --- 5. Enrichment & Storage ---
                if (allResults.length > 0) {
                    if (window.WikipediaAPI) {
                        await WikipediaAPI.enrichResults(allResults);
                    }

                    // Update Caches
                    if (window.WikipediaCache) {
                        WikipediaCache.updateWikiCacheStore(allResults);
                        await WikipediaCache.cacheQueryResults(normalizedQuery, allResults);
                    }

                    // Refresh entries tab cache store and re-render so "CACHED" badge updates
                    if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                        WikiManager.refreshCacheStores();
                    }
                    if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                        WikiManager.renderWikiEntryList(true);
                    }

                    console.log(`SWOrchestrator: Aggregated ${allResults.length} potential results.`);
                }

                return allResults;
            } finally {
                if (showLoadingFn) {
                    showLoadingFn(false, 'results', 'Wikipedia search complete');
                }
            }
        }
    };

    // Expose globally
    window.SWOrchestrator = SWOrchestrator;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SWOrchestrator', SWOrchestrator);
    }
})();
