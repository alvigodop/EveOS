window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
(function (api) {
    const ctx = api.SearchInternals = api.SearchInternals || {};

ctx.fetchProviderResults = async function fetchProviderResults(query, providerKey) {
        switch (providerKey) {
            case 'mangadex':
                return api.MangaDex.searchMangaDex(query);
            case 'jikanManga':
                return api.Jikan.searchJikanManga(query);
            case 'jikanAnime':
                return api.Jikan.searchJikanAnime(query);
            case 'anilistManga':
                return api.AniList.searchAniListManga(query);
            case 'anilistAnime':
                return api.AniList.searchAniListAnime(query);
            case 'mangaupdates':
                return api.MangaUpdates.searchMangaUpdates(query);
            case 'kitsuAnime':
                return api.Kitsu.searchKitsuAnime(query);
            case 'kitsuManga':
                return api.Kitsu.searchKitsuManga(query);
            case 'tvmaze':
                return api.TVmaze.searchTVmaze(query);
            case 'itunes':
                return api.iTunes.searchiTunes(query);
            case 'wlnupdates':
                return api.WlnUpdates.searchWlnUpdates(query);
            case 'openlibrary':
                return api.OpenLibrary.searchOpenLibrary(query);
            case 'comick':
                return api.ComicK.searchComicK(query);
            default:
                throw new Error(`Unsupported API provider source: ${providerKey}`);
        }
    }

ctx.collectLiveResults = async function collectLiveResults(query, providerKey = null, skipSources = null) {
        const Core = api.Core;
        const MangaDex = api.MangaDex;
        const Jikan = api.Jikan;
        const AniList = api.AniList;
        const MangaUpdates = api.MangaUpdates;
        const Kitsu = api.Kitsu;
        const TVmaze = api.TVmaze;
        const iTunes = api.iTunes;
        const WlnUpdates = api.WlnUpdates;
        const OpenLibrary = api.OpenLibrary;
        const ComicK = api.ComicK;

        if (!Core || !MangaDex || !Jikan || !AniList || !MangaUpdates || !Kitsu || !TVmaze || !iTunes || !WlnUpdates || !OpenLibrary || !ComicK) {
            throw new Error('API modules are not fully loaded.');
        }

        if (providerKey && ctx.isProviderSource(providerKey)) {
            return {
                [providerKey]: await ctx.fetchProviderResults(query, providerKey)
            };
        }

        const pairs = await Promise.all(ctx.PROVIDER_KEYS.map(async function (key) {
            // Optimization: skip live fetch if we already have a valid cache hit for this specific provider in hybrid mode
            if (skipSources && skipSources[key]) {
                const list = ctx.getProviderList(skipSources, key);
                if (list.length > 0) {
                    console.log(`API Search: Skipping live fetch for [${key}] - using valid cache hit`);
                    return [key, skipSources[key]];
                }
            }

            try {
                const result = await ctx.fetchProviderResults(query, key);
                return [key, result];
            } catch (error) {
                console.error(`API Search: [${key}] fetch failed`, error);
                // Return empty placeholder instead of throwing, allowing other providers to succeed
                return [key, null];
            }
        }));

        return pairs.reduce(function (acc, pair) {
            if (pair[1] !== null) {
                acc[pair[0]] = pair[1];
            }
            return acc;
        }, {});
    }

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

        const ctx = window.currentCategoryCtx || window.StorageManager?.categoryContext || '';
        const unidexContainer = document.getElementById('unidex-scraper-panel-container');
        if (unidexContainer && unidexContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderUnidexPanelUI === 'function') {
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderUnidexPanelUI(unidexContainer, ctx, {
                filterQuery: searchInput ? searchInput.value : ''
            });
        }

        const apiContainer = document.getElementById('api-scraper-panel-container');
        if (apiContainer && apiContainer.innerHTML.trim() !== '' && typeof window.EveOS?.API?.Manager?.renderScraperPanelUI === 'function') {
            const providerKey = apiContainer.dataset.providerKey || null;
            const searchInput = document.getElementById('searchInput');
            window.EveOS.API.Manager.renderScraperPanelUI(apiContainer, ctx, {
                providerKey: providerKey,
                query: searchInput ? searchInput.value : ''
            });
        }

        if (typeof window.EveOS?.API?.Manager?.refreshSearchUnidexPool === 'function') {
            window.EveOS.API.Manager.refreshSearchUnidexPool();
        }
    }

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
    }

ctx.getLatestCachedQuery = async function getLatestCachedQuery(categoryName, providerKey = null) {
        const cacheEntries = api.Cache ? await api.Cache.listQueries(categoryName) : [];
        if (!providerKey || !ctx.isProviderSource(providerKey)) {
            return cacheEntries[0] || null;
        }
        return cacheEntries.find(function (entry) {
            return Number(entry.summary?.perSource?.[providerKey] || 0) > 0;
        }) || null;
    }

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

        const exactCachedEntry = api.Cache ? await api.Cache.getQuery(normalizedQuery, resolvedCategory) : null;
        const exactCachedVisibleSources = ctx.filterSourcesByProvider(exactCachedEntry?.sources || {}, providerKey);
        const exactCachedVisibleCount = ctx.countResults(exactCachedVisibleSources);
        const derivedCachedEntry = (!exactCachedVisibleCount && api.Cache && typeof api.Cache.searchCachedSources === 'function')
            ? await api.Cache.searchCachedSources(normalizedQuery, resolvedCategory, providerKey)
            : null;
        const activeCachedEntry = exactCachedVisibleCount > 0 ? exactCachedEntry : derivedCachedEntry;
        const cachedVisibleSources = ctx.filterSourcesByProvider(activeCachedEntry?.sources || {}, providerKey);
        const cachedVisibleCount = ctx.countResults(cachedVisibleSources);

        // Hybrid logic: if we have cache, only go live if specifically requested or if cache is stale.
        // If liveResults is NOT explicitly true, and we have cache, we should prefer it (Hybrid fallback).
        if (!shouldUseLive && activeCachedEntry?.sources && cachedVisibleCount > 0) {
            const isFresh = activeCachedEntry.expiresAt > Date.now();
            
            // If hybrid is ON, we only return immediate cache if it's fresh.
            // If hybrid is OFF, we return cache anyway if it exists.
            if (!shouldUseHybrid || isFresh) {
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

        try {
            // Optimization: if hybrid is enabled, tell ctx.collectLiveResults to skip providers already in cache
            const skipSources = (!shouldUseLive && shouldUseHybrid) ? activeCachedEntry?.sources : null;
            
            if (typeof loadingCallback === 'function') {
                const label = providerKey ? ctx.getProviderLabel(providerKey) : 'API providers';
                loadingCallback(true, 'api', `Fetching live results from ${label}...`, { statusPhase: 'live' });
            }

            const liveSources = await ctx.collectLiveResults(normalizedQuery, providerKey, skipSources);
            
            const hasCacheToMerge = activeCachedEntry?.sources && ctx.countResults(activeCachedEntry.sources) > 0;
            // Always merge to preserve other providers in Unidex mode
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

            if (activeCachedEntry?.sources && cachedVisibleCount > 0) {
                if (api.Cache && exactCachedVisibleCount > 0) await api.Cache.touchQuery(normalizedQuery, resolvedCategory);
                return {
                    query: normalizedQuery,
                    categoryName: resolvedCategory,
                    providerKey,
                    allSources: activeCachedEntry.sources,
                    visibleSources: cachedVisibleSources,
                    entry: activeCachedEntry,
                    error,
                    meta: {
                        fromCache: true,
                        fallback: true,
                        cacheOrigin: activeCachedEntry?.cacheOrigin || 'query',
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
        }
    }

ctx.resolveKnowledgeSearchData = async function resolveKnowledgeSearchData(scope, query, options = {}, loadingCallback = null) {
        const normalizedScope = String(scope || '').trim().toLowerCase();
        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const normalizedQuery = String(query || '').trim();
        const shouldUseLive = ctx.resolveLivePreference(resolvedCategory, options.liveResults);
        const shouldUseHybrid = ctx.resolveHybridPreference(resolvedCategory, options.hybridResults);

        if (!normalizedQuery) {
            return {
                scope: normalizedScope,
                categoryName: resolvedCategory,
                results: [],
                sourceCount: 0,
                meta: { summary: { totalResults: 0 } }
            };
        }

        try {
            if (normalizedScope === 'wikipedia') {
                const entries = ctx.normalizeSavedWikipediaEntries(resolvedCategory);
                if (!entries.length) {
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        results: [],
                        sourceCount: 0,
                        meta: { summary: { totalResults: 0 } }
                    };
                }

                if (typeof loadingCallback === 'function') {
                    loadingCallback(true, 'wikipedia', `Searching Wikipedia: ${entries.length} sources...`, { 
                        statusPhase: 'search',
                        totalWikis: entries.length,
                        wikisSearched: 0
                    });
                }

                // Cache-only fast path: search local entry store without orchestrator
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
                        meta: {
                            fromCache: true,
                            summary: { totalResults: Array.isArray(cacheResults) ? cacheResults.length : 0 }
                        }
                    };
                }

                if (!window.SearchWikipedia?.searchManagedWikipedia) {
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        results: [],
                        sourceCount: entries.length,
                        meta: { summary: { totalResults: 0 } }
                    };
                }

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
                    meta: {
                        summary: { totalResults: Array.isArray(results) ? results.length : 0 }
                    }
                };
            }

            if (normalizedScope === 'fandom') {
                const domains = ctx.normalizeSavedFandomDomains(resolvedCategory);
                if (!domains.length) {
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        results: [],
                        sourceCount: 0,
                        meta: { summary: { totalResults: 0 } }
                    };
                }

                if (typeof loadingCallback === 'function') {
                    loadingCallback(true, 'fandom', `Searching Fandom: ${domains.length} sources...`, { 
                        statusPhase: 'search',
                        totalWikis: domains.length,
                        wikisSearched: 0
                    });
                }

                // Cache-only fast path: search domain store without orchestrator
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
                        meta: {
                            fromCache: true,
                            summary: { totalResults: resultsList.length }
                        }
                    };
                }

                if (!window.SearchFandomLogic?.searchManagedFandom) {
                    return {
                        scope: normalizedScope,
                        categoryName: resolvedCategory,
                        results: [],
                        sourceCount: domains.length,
                        meta: { summary: { totalResults: 0 } }
                    };
                }

                const results = await window.SearchFandomLogic.searchManagedFandom(domains, normalizedQuery, {
                    liveSearch: shouldUseLive,
                    hybridSearch: shouldUseHybrid
                }, loadingCallback);

                return {
                    scope: normalizedScope,
                    categoryName: resolvedCategory,
                    sourceCount: domains.length,
                    results: ctx.sortKnowledgeResults(results),
                    meta: {
                        summary: { totalResults: Array.isArray(results) ? results.length : 0 }
                    }
                };
            }
        } catch (error) {
            console.error(`Search Unidex ${normalizedScope} search error:`, error);
            return {
                scope: normalizedScope,
                categoryName: resolvedCategory,
                results: [],
                sourceCount: normalizedScope === 'wikipedia'
                    ? ctx.normalizeSavedWikipediaEntries(resolvedCategory).length
                    : ctx.normalizeSavedFandomDomains(resolvedCategory).length,
                error,
                meta: {
                    error,
                    summary: { totalResults: 0 }
                }
            };
        }

        return {
            scope: normalizedScope,
            categoryName: resolvedCategory,
            results: [],
            sourceCount: 0,
            meta: { summary: { totalResults: 0 } }
        };
    }

ctx.runUnifiedSearch = async function runUnifiedSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const normalizedQuery = String(query).trim();
        const requestId = ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: 'search-unidex'
        });

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching Search Unidex across API, Wikipedia, and Fandom...</div>`;
        ctx.updateResultsCount(0);

        // Progress tracking for Search Monitor
        let totalResultsFound = 0;
        let sourcesSearched = 0;
        const totalSourcesToSearch = 3; // API, Wikipedia, Fandom

        const monitorProgress = (isSearching, source, message, stats = {}) => {
            if (!isSearching) return;
            if (typeof options.loadingCallback === 'function') {
                const combinedStats = {
                    ...stats,
                    wikisSearched: sourcesSearched,
                    totalWikis: totalSourcesToSearch,
                    resultsFound: totalResultsFound
                };
                options.loadingCallback(true, resultsContainer.id, message, combinedStats);
            }
        };

        const handleSourceSearch = async (source, searchFn, callback) => {
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
            }
        };

        const [apiResult, wikipediaResult, fandomResult] = await Promise.all([
            handleSourceSearch('api', () => ctx.resolveApiSearchData(normalizedQuery, {
                categoryName: resolvedCategory,
                ttlMs: options.ttlMs,
                liveResults: options.liveResults,
                hybridResults: options.hybridResults
            }, (show, elementId, msg, stats) => {
                if (stats?.resultsFound !== undefined) totalResultsFound += stats.resultsFound;
                monitorProgress(show, 'api', msg, stats);
            })),
            handleSourceSearch('wikipedia', () => ctx.resolveKnowledgeSearchData('wikipedia', normalizedQuery, {
                categoryName: resolvedCategory,
                liveResults: options.liveResults,
                hybridResults: options.hybridResults
            }, (show, elementId, msg, stats) => {
                if (stats?.resultsFound !== undefined) totalResultsFound += stats.resultsFound;
                monitorProgress(show, 'wikipedia', msg, stats);
            }), (res) => {
                if (res?.results?.length) totalResultsFound += res.results.length;
            }),
            handleSourceSearch('fandom', () => ctx.resolveKnowledgeSearchData('fandom', normalizedQuery, {
                categoryName: resolvedCategory,
                liveResults: options.liveResults,
                hybridResults: options.hybridResults
            }, (show, elementId, msg, stats) => {
                if (stats?.resultsFound !== undefined) totalResultsFound += stats.resultsFound;
                monitorProgress(show, 'fandom', msg, stats);
            }), (res) => {
                if (res?.results?.length) totalResultsFound += res.results.length;
            })
        ]);

        if (!ctx.isClaimCurrent(resultsContainer, requestId)) {
            return null;
        }

        const payload = {
            categoryName: resolvedCategory,
            query: normalizedQuery,
            api: apiResult || { meta: { summary: { totalResults: 0 } }, allSources: {}, visibleSources: {} },
            wikipedia: wikipediaResult || { results: [], meta: { summary: { totalResults: 0 } } },
            fandom: fandomResult || { results: [], meta: { summary: { totalResults: 0 } } }
        };

        ctx.renderUnifiedSearchResults(payload, resultsContainer, onSelect);
        ctx.notifyScraperStatusUpdate();

        // Ensure we send a final "Done" message to the Search Monitor with the final tallies
        if (typeof options.loadingCallback === 'function') {
            options.loadingCallback(false, resultsContainer.id, 'Search Unidex complete', {
                totalWikis: totalSourcesToSearch,
                wikisSearched: totalSourcesToSearch,
                resultsFound: totalResultsFound
            });
        }

        if (typeof options.onAfterRender === 'function') {
            options.onAfterRender(payload);
        }

        return payload;
    }

ctx.runSearch = async function runSearch(query, resultsContainer, onSelect, options = {}) {
        if (!query || !resultsContainer) return null;

        const resolvedCategory = ctx.ensureCategoryContext(options.categoryName);
        const providerKey = ctx.isProviderSource(options.providerKey) ? options.providerKey : null;
        const normalizedQuery = String(query).trim();
        const requestId = ctx.claimResultsView(resultsContainer, {
            query: normalizedQuery,
            source: providerKey || 'api'
        });

        resultsContainer.innerHTML = `<div style="padding:10px;">Searching ${ctx.escapeHtml(providerKey ? ctx.getProviderLabel(providerKey) : 'API providers')}...</div>`;
        ctx.updateResultsCount(0);

        const resolved = await ctx.resolveApiSearchData(normalizedQuery, {
            categoryName: resolvedCategory,
            providerKey,
            ttlMs: options.ttlMs,
            liveResults: options.liveResults,
            hybridResults: options.hybridResults
        }, options.loadingCallback);
        if (!ctx.isClaimCurrent(resultsContainer, requestId) || !resolved) {
            return null;
        }

        if (resolved.meta?.cacheMiss) {
            ctx.renderCacheOnlyMessage(resultsContainer, normalizedQuery, providerKey);
            if (typeof options.onAfterRender === 'function') {
                options.onAfterRender({
                    fromCache: false,
                    cacheMiss: true,
                    categoryName: resolvedCategory
                });
            }
            return {
                sources: {},
                meta: resolved.meta
            };
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
        return {
            sources: renderedSources,
            meta: resolved.meta
        };
    }

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

        if (typeof options.onAfterRender === 'function') {
            options.onAfterRender({ fromCache: true, entry: cachedEntry, categoryName: resolvedCategory });
        }
        return {
            sources: cachedEntry,
            renderedSources
        };
    }
})(window.EveOS.API);