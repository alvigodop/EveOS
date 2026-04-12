window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

    /**
     * Notify other modules (like Scraper UI) that search status/cache has changed.
     */
    ctx.notifyScraperStatusUpdate = function notifyScraperStatusUpdate() {
        if (window.WikiManager && typeof window.WikiManager.refreshCacheStores === 'function') {
            window.WikiManager.refreshCacheStores();
            if (typeof window.WikiManager.renderWikiEntryList === 'function') {
                window.WikiManager.renderWikiEntryList(true);
            }
            if (typeof window.WikiManager.renderFandomDomainList === 'function') {
                window.WikiManager.renderFandomDomainList(true);
            }
        }

        const currentCtx = window.currentCategoryCtx || window.StorageManager?.categoryContext || '';
        const unidexContainer = document.getElementById('unidex-scraper-panel-container');
        if (unidexContainer && unidexContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderUnidexPanelUI === 'function') {
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderUnidexPanelUI(unidexContainer, currentCtx, {
                filterQuery: searchInput ? searchInput.value : ''
            });
        }

        const apiContainer = document.getElementById('api-scraper-panel-container');
        if (apiContainer && apiContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderScraperPanelUI === 'function') {
            const providerKey = apiContainer.dataset.providerKey || null;
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderScraperPanelUI(apiContainer, currentCtx, {
                providerKey: providerKey,
                query: searchInput ? searchInput.value : ''
            });
        }

        if (typeof window.EveOS?.API?.Manager?.refreshSearchUnidexPool === 'function') {
            window.EveOS.API.Manager.refreshSearchUnidexPool();
        }
    };

    /**
     * Check if an API cache entry is "shallow" (needs discovery enrichment).
     */
    ctx.isShallowApiCache = function isShallowApiCache(cacheEntry) {
        if (!cacheEntry || !cacheEntry.sources) return true;

        const sources = cacheEntry.sources;
        const providerCount = Object.keys(sources).length;
        const totalResults = typeof ctx.countResults === 'function' ? ctx.countResults(sources) : 0;

        // If we have fewer than 3 providers (and not a single-provider search) OR zero results, it's shallow.
        return (providerCount < 3 && totalResults === 0) || (providerCount === 0);
    };

    /**
     * Check if a group matches a text filter.
     */
    ctx.matchesGroupFilter = function matchesGroupFilter(group, filterQuery) {
        const normalizedFilter = ctx.normalizeSourceIdentity(filterQuery);
        if (!normalizedFilter) return true;

        const values = [
            group?.title,
            group?.wikipediaEntry?.title,
            group?.wikipediaEntry?.subtitle,
            group?.wikipediaEntry?.key,
            group?.fandomEntry?.title,
            group?.fandomEntry?.subtitle,
            group?.fandomEntry?.key,
            ...(Array.isArray(group?.apiEntries) ? group.apiEntries.map(function (entry) {
                return entry?.query;
            }) : []),
            ...(group?.aliases ? Array.from(group.aliases) : [])
        ];

        Object.keys(ctx.summarizeApiGroupProviders(group?.apiEntries || {})).forEach(function (providerKey) {
            values.push(providerKey);
            values.push(ctx.getProviderLabel(providerKey));
        });

        return values.some(function (value) {
            const normalizedValue = ctx.normalizeSourceIdentity(value);
            return normalizedValue && normalizedValue.includes(normalizedFilter);
        });
    };

    /**
     * Get the latest cached query for a card/provider.
     */
    ctx.getLatestCachedQuery = async function getLatestCachedQuery(categoryName, providerKey = null) {
        const cacheEntries = api.Cache ? await api.Cache.listQueries(categoryName) : [];
        if (!providerKey || !ctx.isProviderSource(providerKey)) {
            return cacheEntries[0] || null;
        }
        return cacheEntries.find(function (entry) {
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) || null;
    };

    /**
     * High-level resolver for API search data (Cache -> Live Hybrid).
     */
    ctx.resolveApiSearchData = async function resolveApiSearchData(query, options = {}, loadingCallback = null) {
        if (!query) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
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
                const isFresh = activeCachedEntry.expiresAt > Date.now();
                // [MOD] If hybridSearch is active, do not return early with cached query.
                // This ensures we fall through to the merge phase where sources (like Wikipedia) can discover deep results.
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

                console.log(`API Orchestrator: Hybrid search active - proceeding to discovery enrichment despite fresh cache.`);
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

            // When live is on and we have cache, pass cached sources as skip hints so
            // collectLiveResults can avoid re-fetching providers that already have data.
            // When hybrid-only (not live), skip sources that already have cache entries.
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

    /**
     * Resolve Knowledge Search Data (Wikipedia/Fandom).
     */
    ctx.resolveKnowledgeSearchData = async function resolveKnowledgeSearchData(scope, query, options = {}, loadingCallback = null) {
        const normalizedScope = String(scope || '').trim().toLowerCase();
        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const normalizedQuery = String(query || '').trim();
        const shouldUseLive = await ctx.resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = await ctx.resolveHybridPreference(resolvedCategory, options.hybridResults);

        if (!normalizedQuery) {
            return {
                scope: normalizedScope,
                categoryName: resolvedCategory,
                results: [],
                sourceCount: 0,
                meta: { summary: { totalResults: 0 } }
            };
        }

        // Ensure Scraper Cache is synced with this card's context
        if (window.CacheManager && typeof CacheManager.init === 'function') {
            await CacheManager.init(resolvedCategory);
        }

        try {
            if (normalizedScope === 'wikipedia') {
                const entries = await ctx.normalizeSavedWikipediaEntries(resolvedCategory);
                if (!entries.length) return { scope: normalizedScope, categoryName: resolvedCategory, results: [], sourceCount: 0, meta: { summary: { totalResults: 0 } } };

                if (typeof loadingCallback === 'function') {
                    loadingCallback(true, 'wikipedia', `Searching Wikipedia: ${entries.length} sources...`, {
                        statusPhase: 'search',
                        totalWikis: entries.length,
                        wikisSearched: 0
                    });
                }


                if (!shouldUseLive && !shouldUseHybrid) {
                    let cacheResults = [];
                    if (window.WikipediaCache && typeof WikipediaCache.searchCachedEntryStore === 'function') {
                        cacheResults = WikipediaCache.searchCachedEntryStore(normalizedQuery, entries, { hidePersons: false });
                    }
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        sourceCount: entries.length,
                        results: ctx.sortKnowledgeResults(cacheResults),
                        meta: { fromCache: true, summary: { totalResults: Array.isArray(cacheResults) ? cacheResults.length : 0 } }
                    };
                }

                if (!window.SearchWikipedia?.searchManagedWikipedia) return { scope: normalizedScope, categoryName: resolvedCategory, results: [], sourceCount: entries.length, meta: { summary: { totalResults: 0 } } };

                const results = await window.SearchWikipedia.searchManagedWikipedia(entries, normalizedQuery, {
                    liveSearch: shouldUseLive,
                    hybridSearch: shouldUseHybrid,
                    hidePersons: false
                }, loadingCallback);

                return {
                    scope: normalizedScope,
                    categoryName: resolvedCategory,
                    sourceCount: entries.length,
                    results: ctx.sortKnowledgeResults(results),
                    meta: { summary: { totalResults: Array.isArray(results) ? results.length : 0 } }
                };
            }

            if (normalizedScope === 'fandom') {
                const domains = await ctx.normalizeSavedFandomDomains(resolvedCategory);
                if (!domains.length) return { scope: normalizedScope, categoryName: resolvedCategory, results: [], sourceCount: 0, meta: { summary: { totalResults: 0 } } };

                if (typeof loadingCallback === 'function') {
                    loadingCallback(true, 'fandom', `Searching Fandom: ${domains.length} sources...`, {
                        statusPhase: 'search',
                        totalWikis: domains.length,
                        wikisSearched: 0
                    });
                }


                if (!shouldUseLive && !shouldUseHybrid) {
                    let cacheResults = null;
                    if (window.FSLCache && typeof FSLCache.getCachedDomainStoreResults === 'function') {
                        cacheResults = FSLCache.getCachedDomainStoreResults(normalizedQuery, domains);
                    }
                    const resultsList = Array.isArray(cacheResults) ? cacheResults : [];
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        sourceCount: domains.length,
                        results: ctx.sortKnowledgeResults(resultsList),
                        meta: { fromCache: true, summary: { totalResults: resultsList.length } }
                    };
                }

                if (!window.SearchFandomLogic?.searchManagedFandom) return { scope: normalizedScope, categoryName: resolvedCategory, results: [], sourceCount: domains.length, meta: { summary: { totalResults: 0 } } };

                const results = await window.SearchFandomLogic.searchManagedFandom(domains, normalizedQuery, {
                    liveSearch: shouldUseLive,
                    hybridSearch: shouldUseHybrid
                }, loadingCallback);

                return {
                    scope: normalizedScope,
                    categoryName: resolvedCategory,
                    sourceCount: domains.length,
                    results: ctx.sortKnowledgeResults(results),
                    meta: { summary: { totalResults: Array.isArray(results) ? results.length : 0 } }
                };
            }
        } catch (error) {
            console.error(`Search Unidex ${normalizedScope} search error:`, error);
            const fallbackSources = normalizedScope === 'wikipedia'
                ? await ctx.normalizeSavedWikipediaEntries(resolvedCategory)
                : await ctx.normalizeSavedFandomDomains(resolvedCategory);
            return {
                scope: normalizedScope,
                categoryName: resolvedCategory,
                results: [],
                sourceCount: Array.isArray(fallbackSources) ? fallbackSources.length : 0,
                error,
                meta: { error, summary: { totalResults: 0 } }
            };
        } finally {
            if (typeof loadingCallback === 'function') {
                loadingCallback(false, normalizedScope, `${normalizedScope} search resolved`);
            }
        }

        return { scope: normalizedScope, categoryName: resolvedCategory, results: [], sourceCount: 0, meta: { summary: { totalResults: 0 } } };
    };


    /**
     * Core runner for Unified (Unidex) Search.
     */
    ctx.runUnifiedSearch = async function runUnifiedSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const normalizedQuery = String(query).trim();
        const requestId = options.requestId || ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: 'search-unidex'
        });

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching Search Unidex across API, Wikipedia, and Fandom...</div>`;
        ctx.updateResultsCount(0);

        let totalResultsFound = 0;
        let sourcesSearched = 0;
        const totalSourcesToSearch = 3;

        let activeSubSearches = 0;
        const monitorProgress = (isSearching, source, message, stats = {}) => {
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                // If we're tracking sub-searches, only signal completion (false) when ALL are done.
                // However, sub-searchers themselves signal completion when they finish.
                // We should keep the overall indicator "true" (searching) as long as we are inside the Promise.all.
                const shouldStayVisible = isSearching || activeSubSearches > 0;

                const combinedStats = {
                    ...stats,
                    wikisSearched: sourcesSearched,
                    totalWikis: totalSourcesToSearch,
                    resultsFound: totalResultsFound
                };
                options.loadingCallback(shouldStayVisible, resultsContainer.id, message, combinedStats);
            }
        };

        const handleSourceSearch = async (source, searchFn, callback) => {
            activeSubSearches++;
            try {
                const result = await searchFn();
                sourcesSearched++;
                if (callback) callback(result);
                return result;
            } catch (error) {
                console.error(`runUnifiedSearch: ${source} search failed`, error);
                sourcesSearched++;
                monitorProgress(true, source, `${source} search failed: ${error.message || 'Unknown error'}`);
                return null;
            } finally {
                activeSubSearches--;
            }
        };

        try {
            monitorProgress(true, 'init', `Starting Unidex search for "${normalizedQuery}"...`, { statusPhase: 'init' });

            const [apiResult, wikipediaResult, fandomResult] = await Promise.all([
                handleSourceSearch('api', () => ctx.resolveApiSearchData(normalizedQuery, {
                    categoryName: resolvedCategory,
                    ttlMs: options.ttlMs,
                    liveResults: options.liveResults,
                    hybridResults: options.hybridResults
                }, (show, elementId, msg, stats) => {
                    if (stats?.resultsFound !== undefined) {
                        // totalResultsFound is updated by the sub-loader logic usually, but we sync here if needed
                    }
                    monitorProgress(show, 'api', msg, stats);
                })),
                handleSourceSearch('wikipedia', () => ctx.resolveKnowledgeSearchData('wikipedia', normalizedQuery, {
                    categoryName: resolvedCategory,
                    liveResults: options.liveResults,
                    hybridResults: options.hybridResults
                }, (show, elementId, msg, stats) => {
                    monitorProgress(show, 'wikipedia', msg, stats);
                })),
                handleSourceSearch('fandom', () => ctx.resolveKnowledgeSearchData('fandom', normalizedQuery, {
                    categoryName: resolvedCategory,
                    liveResults: options.liveResults,
                    hybridResults: options.hybridResults
                }, (show, elementId, msg, stats) => {
                    monitorProgress(show, 'fandom', msg, stats);
                }))
            ]);

            if (!ctx.isClaimCurrent(resultsContainer, requestId)) return null;

            const payload = {
                categoryName: resolvedCategory,
                query: normalizedQuery,
                api: apiResult || { meta: { summary: { totalResults: 0 } }, allSources: {}, visibleSources: {} },
                wikipedia: wikipediaResult || { results: [], meta: { summary: { totalResults: 0 } } },
                fandom: fandomResult || { results: [], meta: { summary: { totalResults: 0 } } }
            };

            totalResultsFound = (payload.api.meta?.summary?.totalResults || 0) +
                                (payload.wikipedia.meta?.summary?.totalResults || 0) +
                                (payload.fandom.meta?.summary?.totalResults || 0);

            monitorProgress(true, 'process', `Rendering ${totalResultsFound} Unidex results...`, { statusPhase: 'process' });

            ctx.renderUnifiedSearchResults(payload, resultsContainer, onSelect);
            ctx.notifyScraperStatusUpdate();

            if (typeof options.onAfterRender === 'function') options.onAfterRender(payload);
            return payload;

        } catch (error) {
            console.error('runUnifiedSearch: Critical error', error);
            monitorProgress(false, 'error', `Search failed: ${error.message}`, { statusPhase: 'error' });
            throw error;
        } finally {
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                options.loadingCallback(false, resultsContainer.id, 'Search Unidex complete', {
                    totalWikis: totalSourcesToSearch,
                    wikisSearched: sourcesSearched,
                    resultsFound: totalResultsFound
                });
            }
        }
    };

    /**
     * Core runner for Provider-specific search.
     */
    ctx.runSearch = async function runSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const normalizedQuery = String(query).trim();
        const requestId = options.requestId || ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: providerKey || 'api'
        });

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching ${ctx.escapeHtml(providerKey ? ctx.getProviderLabel(providerKey) : 'API providers')}...</div>`;
        ctx.updateResultsCount(0);

        try {
            const resolved = await ctx.resolveApiSearchData(normalizedQuery, {
                categoryName: resolvedCategory,
                providerKey,
                ttlMs: options.ttlMs,
                liveResults: options.liveResults,
                hybridResults: options.hybridResults
            }, options.loadingCallback);

            if (!ctx.isClaimCurrent(resultsContainer, requestId) || !resolved) return null;

            if (resolved.meta?.cacheMiss) {
                ctx.renderCacheOnlyMessage(resultsContainer, normalizedQuery, providerKey);
                if (typeof options.onAfterRender === 'function') options.onAfterRender({ fromCache: false, cacheMiss: true, categoryName: resolvedCategory });
                return { sources: {}, meta: resolved.meta };
            }

            if (resolved.meta?.error && Number(resolved.meta?.summary?.totalResults || 0) < 1) {
                resultsContainer.innerHTML = 'An error occurred while searching.<br><pre style="text-align:left; font-size:12px; color:red;">' + ctx.escapeHtml(resolved.meta.error.stack || resolved.meta.error.message || resolved.meta.error) + '</pre>';
                return null;
            }

            const renderedSources = ctx.renderProviderResultsSubset(resolved.allSources, resultsContainer, onSelect, providerKey, !!resolved.meta?.fromCache);
            ctx.updateResultsCount(ctx.countResults(renderedSources));
            ctx.notifyScraperStatusUpdate();

            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({
                    fromCache: resolved.meta?.fromCache === true,
                    fallback: resolved.meta?.fallback === true,
                    entry: resolved.entry || null,
                    categoryName: resolvedCategory
                });
            }
            return { sources: renderedSources, meta: resolved.meta };

        } catch (error) {
            console.error('runSearch: Critical error', error);
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                options.loadingCallback(false, resultsContainer.id, `Search failed: ${error.message}`, { statusPhase: 'error' });
            }
            throw error;
        } finally {
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
                options.loadingCallback(false, resultsContainer.id, 'Search complete');
            }
        }
    };

    /**
     * Core runner for loading a cached query.
     */
    ctx.loadCachedQuery = async function loadCachedQuery(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer || !api.Cache) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const requestId = ctx.claimResultsView(resultsContainer, {
            query: query,
            source: providerKey || 'api-cache'
        });
        const cachedEntry = await api.Cache.getQuery(query, resolvedCategory);
        if (!cachedEntry?.sources) return null;
        if (ctx.countResults(ctx.filterSourcesByProvider(cachedEntry.sources, providerKey)) < 1) return null;
        if (!ctx.isClaimCurrent(resultsContainer, requestId)) return null;

        await api.Cache.touchQuery(query, resolvedCategory);
        const renderedSources = ctx.renderProviderResultsSubset(cachedEntry.sources, resultsContainer, onSelect, providerKey, true);
        ctx.updateResultsCount(ctx.countResults(renderedSources));
        ctx.notifyScraperStatusUpdate();

        if (typeof options.onAfterRender === 'function') options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        return { sources: cachedEntry, renderedSources };
    };

    /**
     * Listen for Wiki cache updates to refresh Unidex panel reactively.
     */
    if (window.WikiManager && typeof window.WikiManager.on === 'function') {
        window.WikiManager.on('wiki-cache-updated', function() {
            console.log('API Orchestrator: Wiki cache updated, triggering status update');
            ctx.notifyScraperStatusUpdate();
        });
    }

})(window.EveOS.API);
