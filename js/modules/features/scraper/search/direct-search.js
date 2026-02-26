/**
 * Direct Search Module (Facade)
 * 
 * Provides direct search capabilities bypassing CORS proxies by delegating to
 * specialized sub-modules:
 * - DirectSearchCore: Initialization and connectivity
 * - DirectSearchWikipedia: Wikipedia search logic
 * - DirectSearchFandom: Fandom search logic
 * 
 * @version 1.1.0
 */

(function () {
    'use strict';

    // Create DirectSearch object if it doesn't exist
    if (!window.DirectSearch) {
        // Define the DirectSearch module
        const DirectSearch = {
            version: '1.1.0',
            _initialized: false,

            // Delegate property access to Core
            get _functional() { return window.DirectSearchCore ? window.DirectSearchCore._functional : true; },
            set _functional(val) { if (window.DirectSearchCore) window.DirectSearchCore._functional = val; },

            get _offlineMode() { return window.DirectSearchCore ? window.DirectSearchCore._offlineMode : false; },
            set _offlineMode(val) { if (window.DirectSearchCore) window.DirectSearchCore._offlineMode = val; },

            // Delegate property access to Fandom (for Bing fallback)
            get _useBingFallback() { return window.DirectSearchFandom ? window.DirectSearchFandom._useBingFallback : true; },
            set _useBingFallback(val) { if (window.DirectSearchFandom) window.DirectSearchFandom._useBingFallback = val; },

            /**
             * Initialize the module
             */
            init: function () {
                console.log('Initializing DirectSearch facade');

                // Initialize sub-modules if they exist
                if (window.DirectSearchCore && typeof DirectSearchCore.init === 'function') {
                    DirectSearchCore.init();
                }
                if (window.DirectSearchWikipedia && typeof DirectSearchWikipedia.init === 'function') {
                    DirectSearchWikipedia.init();
                }
                if (window.DirectSearchFandom && typeof DirectSearchFandom.init === 'function') {
                    DirectSearchFandom.init();
                }

                this.setupFallbackMethods();
                this._initialized = true;
                return this;
            },

            /**
             * Check if the module is functional
             */
            checkFunctionality: async function () {
                if (window.DirectSearchCore && typeof DirectSearchCore.checkFunctionality === 'function') {
                    return await DirectSearchCore.checkFunctionality();
                }
                return false;
            },

            /**
             * Test if we can access the required API endpoints
             */
            testEndpointAccess: async function () {
                if (window.DirectSearchCore && typeof DirectSearchCore.testEndpointAccess === 'function') {
                    return await DirectSearchCore.testEndpointAccess();
                }
                return false;
            },

            /**
             * Set up fallback methods if sub-modules are missing
             */
            setupFallbackMethods: function () {
                // If sub-modules are missing, we might want to attach emergency fallbacks here
                if (!window.DirectSearchWikipedia) {
                    console.warn('DirectSearchWikipedia module missing, using emergency fallback');
                    this.discoverWikipedia = async function (query) {
                        return [{
                            title: `Wikipedia search error for "${query}"`,
                            snippet: 'Search module missing. Please reload.',
                            error: true,
                            source: 'wikipedia',
                            type: 'error',
                            fallback: true
                        }];
                    };
                }

                if (!window.DirectSearchFandom) {
                    console.warn('DirectSearchFandom module missing, using emergency fallback');
                    this.searchFandom = async function (query) {
                        return [{
                            title: `Fandom search error for "${query}"`,
                            snippet: 'Search module missing. Please reload.',
                            error: true,
                            source: 'fandom',
                            type: 'error',
                            fallback: true
                        }];
                    };
                }
            },

            /**
             * Search Wikipedia directly
             */
            discoverWikipedia: async function (query) {
                if (window.DirectSearchWikipedia && typeof DirectSearchWikipedia.discoverWikipedia === 'function') {
                    return await DirectSearchWikipedia.discoverWikipedia(query);
                }
                // Fallback implementation if module missing (should be handled by setupFallbackMethods usually)
                console.error('DirectSearchWikipedia module missing');
                return [];
            },

            /**
             * Search Fandom directly
             */
            searchFandom: async function (query) {
                if (window.DirectSearchFandom && typeof DirectSearchFandom.searchFandom === 'function') {
                    return await DirectSearchFandom.searchFandom(query);
                }
                console.error('DirectSearchFandom module missing');
                return [];
            },

            /**
             * Filter Wikipedia search results
             */
            filterWikipediaResults: function (searchResults, query) {
                if (window.DirectSearchWikipedia && typeof DirectSearchWikipedia.filterWikipediaResults === 'function') {
                    return DirectSearchWikipedia.filterWikipediaResults(searchResults, query);
                }
                return searchResults;
            },

            /**
             * Execute a search query on the appropriate platform
             */
            executeSearch: async function (query, isWikipedia = true) {
                if (!query) {
                    console.error('Search query is empty');
                    return [];
                }

                console.log(`Executing ${isWikipedia ? 'Wikipedia' : 'Fandom'} search for: ${query}`);

                // Log the search to cache if available
                if (window.CacheManager && typeof CacheManager.logSearch === 'function') {
                    CacheManager.logSearch(query, isWikipedia ? 'wikipedia' : 'fandom');
                }

                try {
                    if (isWikipedia) {
                        return await this.discoverWikipedia(query);
                    } else {
                        return await this.searchFandom(query);
                    }
                } catch (error) {
                    console.error('Search execution error:', error);
                    return [{
                        title: `Search error for "${query}"`,
                        snippet: `An error occurred while searching. Please try again.`,
                        error: true,
                        source: isWikipedia ? 'wikipedia' : 'fandom',
                        type: 'error'
                    }];
                }
            },

            /**
             * Toggle Bing search fallback
             */
            toggleBingFallback: function (enabled) {
                if (window.DirectSearchFandom && typeof DirectSearchFandom.toggleBingFallback === 'function') {
                    return DirectSearchFandom.toggleBingFallback(enabled);
                }
                return false;
            },

            /**
             * Check if Bing fallback is enabled
             */
            isBingFallbackEnabled: function () {
                if (window.DirectSearchFandom && typeof DirectSearchFandom.isBingFallbackEnabled === 'function') {
                    return DirectSearchFandom.isBingFallbackEnabled();
                }
                return false;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
            ModuleRegistry.register('DirectSearch', DirectSearch);
        }

        // Make the module available globally
        window.DirectSearch = DirectSearch;

        // Auto-init if forced or if expected by system
        // The sub-modules might not be loaded yet if this script runs too early, 
        // but resource-loader should handle order.
        if (window.forceModuleInit) {
            DirectSearch.init();
        }

    }
})();