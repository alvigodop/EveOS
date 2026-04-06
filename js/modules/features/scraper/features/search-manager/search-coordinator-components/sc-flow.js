/**
 * Search Coordinator Flow Component
 * Handles the high-level search workflow and orchestration.
 */
const SearchCoordinatorFlow = {};

function claimResultsRequest(resultsContainer, source, query) {
    if (!resultsContainer) return '';
    if (!resultsContainer.dataset) {
        resultsContainer.dataset = {};
    }
    const requestId = `scraper-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    resultsContainer.dataset.eveSearchRequestId = requestId;
    resultsContainer.dataset.eveSearchSource = String(source || '').trim();
    resultsContainer.dataset.eveSearchQuery = String(query || '').trim();
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'block';
    const resultCount = document.getElementById('resultCount');
    if (resultCount) {
        resultCount.textContent = '0';
    }
    return requestId;
}

function isActiveResultsRequest(resultsContainer, requestId) {
    if (!resultsContainer || !requestId) return true;
    return resultsContainer.dataset.eveSearchRequestId === requestId;
}

/**
 * Initialize the module
 */
SearchCoordinatorFlow.init = function () {
    console.log('SearchCoordinatorFlow initialized');
};

/**
 * Perform search across managed content (Wikis/Entries)
 */
SearchCoordinatorFlow.performContentSearch = async function (query, source, options = null, redisplayOnly = false) {
    console.log(`SearchCoordinatorFlow: Performing content search. Query: "${query}", Source: ${source}, Redisplay: ${redisplayOnly}`);

    const resultsContainerId = 'results';
    const resultsContainer = document.getElementById(resultsContainerId);
    const requestId = claimResultsRequest(resultsContainer, source, query);
    const apiManager = window.EveOS?.API?.Manager;
    const isApiProviderSource = !!apiManager?.isProviderSource?.(source);
    const isApiSource = source === 'api' || isApiProviderSource;
    const isUnidexSource = source === 'unidex';
    const loadingLabel = isApiProviderSource && apiManager?.getProviderLabel
        ? `${apiManager.getProviderLabel(source)} API`
        : source;

    // Delegate to UI Renderer for loading
    if (window.SearchUIRenderer) {
        SearchUIRenderer.showLoading(true, resultsContainerId, `Searching ${loadingLabel} content...`);
    }

    if (!redisplayOnly) {
        if (window.SearchManager) {
            SearchManager._lastQueryOptions = { query, source };
        }
    }

    // 1. Get Search Options
    let searchOptions = options;
    if (!searchOptions) {
        if (window.SearchOptions && typeof SearchOptions.getOptions === 'function') {
            searchOptions = SearchOptions.getOptions(source);
        } else {
            console.warn("SearchCoordinatorFlow: SearchOptions module not loaded, using minimal defaults");
            searchOptions = { layout: 'grid', liveSearch: false };
        }
    }

    if (window.SearchManager) {
        SearchManager._lastQueryOptions.options = searchOptions;
    }

    if (isUnidexSource) {
        try {
            const unidexPanelContainer = document.getElementById('unidex-scraper-panel-container');
            if (!window.EveOS?.API?.Manager?.runUnifiedSearch || !resultsContainer) {
                throw new Error('Search Unidex is not available.');
            }

            // Also refresh the Unidex panel UI if it's visible to show matching source cards
            if (unidexPanelContainer && window.EveOS?.API?.Manager?.renderUnidexPanelUI) {
                window.EveOS.API.Manager.renderUnidexPanelUI(unidexPanelContainer, window.currentCategoryCtx || window.StorageManager?.categoryContext || '', {
                    filterQuery: query
                });
            }

            const unifiedResult = await window.EveOS.API.Manager.runUnifiedSearch(query, resultsContainer, null, {
                categoryName: window.currentCategoryCtx || window.StorageManager?.categoryContext || '',
                liveResults: searchOptions.liveSearch === true,
                hybridResults: searchOptions.hybridSearch !== false,
                loadingCallback: (show, elementId, msg, stats) => {
                    if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                        SearchUIRenderer.showLoading(show, resultsContainerId, msg, stats);
                    }
                }
            });

            if (!isActiveResultsRequest(resultsContainer, requestId)) {
                return;
            }

            if (window.SearchManager) {
                SearchManager._lastSearchResults = unifiedResult;
            }
        } catch (error) {
            console.error('SearchCoordinatorFlow: Error during Unidex search', error);
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showError(`Error loading Unidex: ${error.message}`, resultsContainerId);
            }
        } finally {
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showLoading(false, resultsContainerId);
            }
        }
        return;
    }

    if (isApiSource) {
        try {
            const apiResultsContainer = document.getElementById(resultsContainerId);
            const apiPanelContainer = document.getElementById('api-scraper-panel-container');
            if (!window.EveOS?.API?.Manager?.runSearch || !apiResultsContainer) {
                throw new Error('API Manager is not available.');
            }

            const apiSearchResult = await window.EveOS.API.Manager.runSearch(query, apiResultsContainer, null, {
                categoryName: window.currentCategoryCtx || window.StorageManager?.categoryContext || '',
                providerKey: isApiProviderSource ? source : null,
                liveResults: searchOptions.liveSearch === true,
                hybridResults: searchOptions.hybridSearch !== false,
                loadingCallback: (show, elementId, msg, stats) => {
                    if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                        SearchUIRenderer.showLoading(show, resultsContainerId, msg, stats);
                    }
                },
                onAfterRender: function () {
                    if (apiPanelContainer && window.EveOS?.API?.Manager?.renderScraperPanelUI) {
                        window.EveOS.API.Manager.renderScraperPanelUI(apiPanelContainer, window.currentCategoryCtx || window.StorageManager?.categoryContext || '', {
                            providerKey: isApiProviderSource ? source : null
                        });
                    }
                }
            });

            if (!isActiveResultsRequest(resultsContainer, requestId)) {
                return;
            }
            if (window.SearchManager) {
                SearchManager._lastSearchResults = apiSearchResult?.sources || {};
            }
        } catch (error) {
            console.error('SearchCoordinatorFlow: Error during API search', error);
            const apiErrorLabel = isApiProviderSource && apiManager?.getProviderLabel
                ? apiManager.getProviderLabel(source)
                : 'API providers';
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showError(`Error searching ${apiErrorLabel}: ${error.message}`, resultsContainerId);
            }
        } finally {
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showLoading(false, resultsContainerId);
            }
        }
        return;
    }

    // 2. Get Managed List
    let managedList = [];
    if (source === 'wikipedia' && window.WikiManager && WikiManager.wikiEntries) {
        managedList = WikiManager.wikiEntries;
    } else if (source === 'fandom' && window.WikiManager && WikiManager.fandomDomains) {
        managedList = WikiManager.fandomDomains;
    }

    if (!window.WikiManager) {
        console.error('SearchCoordinatorFlow: WikiManager not available');
        if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
            SearchUIRenderer.showError('WikiManager module is not loaded.', resultsContainerId);
        }
        return;
    }

    // Fallback: Check localStorage
    if (managedList.length === 0) {
        try {
            const storageKey = source === 'wikipedia' ? 'wikiEntries' : 'fandomDomains';
            const storedData = localStorage.getItem(storageKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    managedList = parsedData;
                    // Sync back
                    if (source === 'wikipedia') WikiManager.wikiEntries = parsedData;
                    else WikiManager.fandomDomains = parsedData;
                }
            }
        } catch (e) {
            console.error('SearchCoordinatorFlow: Error reading localStorage fallback', e);
        }
    }

    if (managedList.length === 0) {
        if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
            SearchUIRenderer.showLoading(false, resultsContainerId);
        }
        if (resultsContainer && isActiveResultsRequest(resultsContainer, requestId)) {
            resultsContainer.innerHTML = `
                <div class="info-message">
                    <h3>No ${source === 'wikipedia' ? 'Wikipedia entries' : 'Fandom domains'} found.</h3>
                    <p>The "View Search Results" section acts as your <strong>personal library search</strong>.</p>
                    <p>To see results here, you must first add content using the <strong>"${source === 'wikipedia' ? 'Discover Wikipedia Articles' : 'Discover Fandom Communities'}"</strong> section on the right.</p>
                </div>
            `;
        }
        return;
    }

    try {
        let finalResults = [];

        if (redisplayOnly && window.SearchManager && SearchManager._lastSearchResults) {
            finalResults = SearchManager._lastSearchResults;
        } else {
            // 3. Fetch and Process Data (Delegate to Managed Component)
            if (window.SearchCoordinatorManaged) {
                if (source === 'wikipedia') {
                    finalResults = await SearchCoordinatorManaged.searchManagedWikipedia(managedList, query, searchOptions);

                    // Enhancements
                    if (window.WikipediaDiscovery) {
                        if (typeof WikipediaDiscovery.enhanceResults === 'function') {
                            finalResults = await WikipediaDiscovery.enhanceResults(finalResults, query);
                        }
                        if (typeof WikipediaDiscovery.fetchThumbnails === 'function') {
                            finalResults = await WikipediaDiscovery.fetchThumbnails(finalResults);
                        }
                    }
                } else {
                    finalResults = await SearchCoordinatorManaged.searchManagedFandom(managedList, query, searchOptions);
                }
            } else {
                throw new Error('SearchCoordinatorManaged module missing');
            }

            if (window.SearchManager) {
                SearchManager._lastSearchResults = finalResults;
            }
        }

        if (!isActiveResultsRequest(resultsContainer, requestId)) {
            return;
        }

        // 4. Apply Final Processing
        if (window.ResultProcessor && typeof ResultProcessor.process === 'function') {
            const processOptions = { ...searchOptions, query: query, searchTerm: query };
            finalResults = ResultProcessor.process(finalResults, processOptions);
        }

        // Apply Content Filtering
        if (window.ModuleUtilities && typeof ModuleUtilities.filterResults === 'function') {
            finalResults = ModuleUtilities.filterResults(finalResults, searchOptions.mangaFilter, searchOptions.webNovelFilter);
        }

        // 5. Display Results
        if (window.ResultDisplay) {
            const containerSelector = '#' + resultsContainerId;
            ResultDisplay.displayResults(finalResults, containerSelector, searchOptions);
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showLoading(false, resultsContainerId);
            }

            // 6. Lazy load thumbnails for Fandom
            if (source === 'fandom') {
                setTimeout(() => {
                    if (!isActiveResultsRequest(resultsContainer, requestId)) return;
                    if (window.ThumbnailLoader && typeof ThumbnailLoader.loadFandomThumbnails === 'function') {
                        ThumbnailLoader.loadFandomThumbnails(finalResults, containerSelector);
                    }
                }, 100);
            }
        } else {
            console.error('ResultDisplay module missing');
            if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
                SearchUIRenderer.showError('ResultDisplay module missing.', resultsContainerId);
            }
        }

    } catch (error) {
        console.error('SearchCoordinatorFlow: Error during content search', error);
        if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
            SearchUIRenderer.showError(`Error searching ${source}: ${error.message}`, resultsContainerId);
        }
    } finally {
        if (window.SearchUIRenderer && isActiveResultsRequest(resultsContainer, requestId)) {
            SearchUIRenderer.showLoading(false, resultsContainerId);
        }

        // Fix: Auto-refresh cache status UI (e.g. 'Not Cached' -> 'Cached') for active Scraper panels
        if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
            WikiManager.refreshCacheStores();
            if (typeof WikiManager.renderWikiEntryList === 'function') {
                WikiManager.renderWikiEntryList(true);
            }
            if (typeof WikiManager.renderFandomDomainList === 'function') {
                WikiManager.renderFandomDomainList(true);
            }
        }
    }
};

/**
 * Retry last search
 */
SearchCoordinatorFlow.retryLastSearch = function (forceLive = false) {
    if (!window.SearchManager || !SearchManager._lastQueryOptions || !SearchManager._lastQueryOptions.query) {
        if (window.WikiManager && typeof WikiManager._notify === 'function') {
            WikiManager._notify('No previous search to retry.', 'warning');
        }
        return null;
    }

    const { query, source, options } = SearchManager._lastQueryOptions;
    const retryOptions = forceLive ? { ...options, liveSearch: true, useCache: false } : options;

    if (window.WikiManager && typeof WikiManager._notify === 'function') {
        WikiManager._notify(`Retrying search: "${query}"...`, 'info');
    }

    return this.performContentSearch(query, source, retryOptions, false);
};

window.SearchCoordinatorFlow = SearchCoordinatorFlow;
