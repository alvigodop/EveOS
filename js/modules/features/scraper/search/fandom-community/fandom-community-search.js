/**
 * Fandom Community Search Facade
 * 
 * Provides a unified interface for Fandom Community Search by delegating to specialized modules:
 * - FandomCSCore: State and Logic
 * - FandomCSUI: UI Handling
 * - FandomCSAPI: API Interactions
 * - FandomCSScraper: Fallback Scraping
 * 
 * @version 1.1.0
 */

(function () {
    'use strict';

    if (!window.FandomCommunitySearch) {
        const FandomCommunitySearch = {
            version: '1.1.0',
            _initialized: false,

            init: function () {
                console.log('Initializing FandomCommunitySearch facade');

                // Initialize sub-modules if not already done
                if (window.FandomCSCore && !FandomCSCore._initialized) FandomCSCore.init();
                if (window.FandomCSAPI && !FandomCSAPI._initialized) FandomCSAPI.init();
                if (window.FandomCSScraper && !FandomCSScraper._initialized) FandomCSScraper.init();

                // Initialize UI last as it needs Core and API ready
                if (window.FandomCSUI && !FandomCSUI._initialized) {
                    const uiSuccess = FandomCSUI.init();
                    if (uiSuccess) {
                        console.log('Fandom Community Search initialized successfully via facade.');
                    } else {
                        console.error('Fandom Community Search UI failed to initialize.');
                    }
                }

                this._initialized = true;
                return this;
            },

            // Legacy accessors/methods if needed by external scripts (unlikely, but safe)
            get currentPage() { return window.FandomCSCore ? FandomCSCore.state.currentPage : 1; },
            get isLoading() { return window.FandomCSCore ? FandomCSCore.state.isLoading : false; },

            // Expose main execution method merely for debug/external triggers
            fetchResults: function (page) {
                if (window.FandomCSAPI) FandomCSAPI.fetchResults(page);
            }
        };

        window.FandomCommunitySearch = FandomCommunitySearch;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('FandomCommunitySearch', FandomCommunitySearch);
        }
    }
})();
