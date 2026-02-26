/**
 * Search Coordinator Flow Component
 * Handles the high-level search workflow and orchestration.
 */
const SearchCoordinatorFlow = {};

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

    // Delegate to UI Renderer for loading
    if (window.SearchUIRenderer) {
        SearchUIRenderer.showLoading(true, resultsContainerId, `Searching ${source} content...`);
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

    // 2. Get Managed List
    let managedList = [];
    if (source === 'wikipedia' && window.WikiManager && WikiManager.wikiEntries) {
        managedList = WikiManager.wikiEntries;
    } else if (source === 'fandom' && window.WikiManager && WikiManager.fandomDomains) {
        managedList = WikiManager.fandomDomains;
    }

    if (!window.WikiManager) {
        console.error('SearchCoordinatorFlow: WikiManager not available');
        if (window.SearchUIRenderer) SearchUIRenderer.showError('WikiManager module is not loaded.', resultsContainerId);
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
        if (window.SearchUIRenderer) SearchUIRenderer.showLoading(false, resultsContainerId);
        const container = document.getElementById(resultsContainerId);
        if (container) {
            container.innerHTML = `
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
            if (window.SearchUIRenderer) SearchUIRenderer.showLoading(false, resultsContainerId);

            // 6. Lazy load thumbnails for Fandom
            if (source === 'fandom') {
                setTimeout(() => {
                    if (window.ThumbnailLoader && typeof ThumbnailLoader.loadFandomThumbnails === 'function') {
                        ThumbnailLoader.loadFandomThumbnails(finalResults, containerSelector);
                    }
                }, 100);
            }
        } else {
            console.error('ResultDisplay module missing');
            if (window.SearchUIRenderer) SearchUIRenderer.showError('ResultDisplay module missing.', resultsContainerId);
        }

    } catch (error) {
        console.error('SearchCoordinatorFlow: Error during content search', error);
        if (window.SearchUIRenderer) SearchUIRenderer.showError(`Error searching ${source}: ${error.message}`, resultsContainerId);
    } finally {
        if (window.SearchUIRenderer) SearchUIRenderer.showLoading(false, resultsContainerId);
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
