window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};
    if (ctx.orchestratorKnowledgeReady || !ctx.orchestratorSharedReady || !ctx.orchestratorApiReady) return;

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

    ctx.runUnifiedSearch = async function runUnifiedSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const normalizedQuery = String(query).trim();
        const requestId = options.requestId || ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: 'search-unidex'
        });

        resultsContainer.innerHTML = '<div style="padding:10px;">Searching Search Unidex across API, Wikipedia, and Fandom...</div>';
        ctx.updateResultsCount(0);

        let totalResultsFound = 0;
        let sourcesSearched = 0;
        const totalSourcesToSearch = 3;
        let activeSubSearches = 0;

        const monitorProgress = function (isSearching, source, message, stats = {}) {
            if (typeof options.loadingCallback === 'function' && ctx.isClaimCurrent(resultsContainer, requestId)) {
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

        const handleSourceSearch = async function (source, searchFn, callback) {
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
                handleSourceSearch('api', function () {
                    return ctx.resolveApiSearchData(normalizedQuery, {
                        categoryName: resolvedCategory,
                        ttlMs: options.ttlMs,
                        liveResults: options.liveResults,
                        hybridResults: options.hybridResults
                    }, function (show, elementId, msg, stats) {
                        monitorProgress(show, 'api', msg, stats);
                    });
                }),
                handleSourceSearch('wikipedia', function () {
                    return ctx.resolveKnowledgeSearchData('wikipedia', normalizedQuery, {
                        categoryName: resolvedCategory,
                        liveResults: options.liveResults,
                        hybridResults: options.hybridResults
                    }, function (show, elementId, msg, stats) {
                        monitorProgress(show, 'wikipedia', msg, stats);
                    });
                }),
                handleSourceSearch('fandom', function () {
                    return ctx.resolveKnowledgeSearchData('fandom', normalizedQuery, {
                        categoryName: resolvedCategory,
                        liveResults: options.liveResults,
                        hybridResults: options.hybridResults
                    }, function (show, elementId, msg, stats) {
                        monitorProgress(show, 'fandom', msg, stats);
                    });
                })
            ]);

            if (!ctx.isClaimCurrent(resultsContainer, requestId)) return null;

            const payload = {
                categoryName: resolvedCategory,
                query: normalizedQuery,
                api: apiResult || { meta: { summary: { totalResults: 0 } }, allSources: {}, visibleSources: {} },
                wikipedia: wikipediaResult || { results: [], meta: { summary: { totalResults: 0 } } },
                fandom: fandomResult || { results: [], meta: { summary: { totalResults: 0 } } }
            };

            totalResultsFound = (payload.api.meta?.summary?.totalResults || 0)
                + (payload.wikipedia.meta?.summary?.totalResults || 0)
                + (payload.fandom.meta?.summary?.totalResults || 0);

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

    ctx.orchestratorKnowledgeReady = true;
})(window.EveOS.API);
