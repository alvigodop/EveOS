/**
 * Fandom Search Module
 * Handles searching for Fandom communities (wikis) separately.
 * 
 * [REFACTORED]
 * This module now acts as a facade, coordinating specific components located in:
 * js/modules/discovery/fandom-search-components/
 */
(function () {
    'use strict';

    // Ensure namespace exists (properties are populated by submodules)
    window.FandomSearch = window.FandomSearch || {};
    const FandomSearch = window.FandomSearch;

    // Add version information
    FandomSearch.version = '1.3.0';

    /**
     * Initialization function for FandomSearch module
     */
    FandomSearch.init = function () {
        console.log('Initializing FandomSearch module (Facade)');
        if (window.SearchFandomLogic && typeof SearchFandomLogic.init === 'function') {
            SearchFandomLogic.init();
            SearchFandomLogic._initialized = true;
        }
        // Set up global directSearchFandom function for compatibility
        window.directSearchFandom = function (query) {
            console.log('Global directSearchFandom calling FandomSearch');
            // search is now provided by logic.js component
            if (typeof FandomSearch.search === 'function') {
                return FandomSearch.search(query);
            } else {
                console.error('FandomSearch.search is not available');
                return Promise.resolve([]);
            }
        };

        // Bind dropdown listener for CSE
        const fandomEngineSelect = document.getElementById('fandom-search-engine');
        if (fandomEngineSelect) {
            fandomEngineSelect.addEventListener('change', function () {
                if (this.value === 'google-cse') {
                    if (window.setCSEMode) window.setCSEMode('google-cse', 'fandom');
                } else {
                    if (window.setCSEMode) window.setCSEMode('default', 'fandom');
                }
            });
        }

        this._initialized = true;
        return this;
    };

    /**
     * Compatibility function for FandomDiscovery.searchFandom
     */
    FandomSearch.searchFandom = function (query) {
        console.log('FandomSearch.searchFandom compatibility function called');
        return FandomSearch.search(query);
    };

    /**
     * Search managed Fandom domains (delegates to Logic)
     */
    FandomSearch.searchManagedFandom = function (domains, query, options, showLoadingFn) {
        if (window.SearchFandomLogic && typeof SearchFandomLogic.searchManagedFandom === 'function') {
            return SearchFandomLogic.searchManagedFandom(domains, query, options, showLoadingFn);
        }
        console.error('FandomSearch: SearchFandomLogic.searchManagedFandom not available');
        return [];
    };

    /**
     * Compatibility function for FandomDiscovery.searchOnlineFandomCommunities
     */
    FandomSearch.searchOnlineFandomCommunities = async function (query) {
        console.log('FandomSearch.searchOnlineFandomCommunities compatibility function called');
        // Try Discovery module if available
        if (window.Discovery && typeof Discovery.searchForRealFandomWikis === 'function') {
            return Discovery.searchForRealFandomWikis(query);
        }
        // Fallback to direct search (provided by api.js component)
        return FandomSearch.directSearchFandom(query);
    };

    /**
     * Compatibility function for FandomDiscovery.handleSearch
     */
    FandomSearch.handleSearch = function () {
        console.log('FandomSearch.handleSearch called');
        const input = document.getElementById('search-input');
        if (!input) {
            console.error('Search input not found');
            return;
        }

        const query = input.value.trim();
        if (!query) {
            alert('Please enter a search term');
            return;
        }

        console.log(`FandomSearch: Handling search for "${query}"`);

        // Show loading state if possible
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
        }

        // Use direct search method for local API
        FandomSearch.directSearchFandom(query)
            .then(results => {
                console.log(`FandomSearch: Search complete, found ${results.length} results`);

                // Display results (provided by ui.js component)
                if (resultsContainer) {
                    FandomSearch.displayResults(results, query, resultsContainer);
                }
            })
            .catch(error => {
                console.error('Error in Fandom search:', error);
                // Show error message
                if (resultsContainer) {
                    resultsContainer.innerHTML = `<div class="error-message">Search failed: ${error.message}</div>`;
                }
            });
    };

    // Register FandomSearch with ModuleLoader if available
    if (window.ModuleLoader) {
        ModuleLoader.registerModule('FandomSearch', FandomSearch);

        // Replace init function with wrapped version
        FandomSearch.init = ModuleLoader.createInitFunction('FandomSearch', FandomSearch.init);
    } else {
        // Fall back to direct registration
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('FandomSearch', FandomSearch);
        }

        // Make globally available -> Already done by assignment above, but ensuring strictly
        window.FandomSearch = FandomSearch;

        // Add compatibility layer for FandomDiscovery
        window.FandomDiscovery = FandomSearch;

        // Dispatch module loaded event if helper exists
        if (typeof window.dispatchModuleLoadedEvent === 'function') {
            window.dispatchModuleLoadedEvent('FandomSearch');
        }
    }

    console.log('FandomSearch module loaded (Facade with compatibility)');

})();
