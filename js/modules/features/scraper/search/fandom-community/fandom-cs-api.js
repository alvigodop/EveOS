/**
 * Fandom Community Search API Module (Facade)
 * 
 * Handles Google Custom Search API interactions for Fandom Community Search.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - FCSAFetch: API interaction and scraper delegation.
 * - FCSAProcess: Result scoring and deduplication.
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.FandomCSAPI) {
        const FandomCSAPI = {
            version: '1.1.0-facade',
            _initialized: false,

            init: function () {
                console.log('Initializing FandomCSAPI');
                this._initialized = true;
                return this;
            },

            /**
             * Fetch search results based on current state
             * Delegates to FCSAFetch
             */
            fetchResults: function (page) {
                if (window.FCSAFetch) {
                    FCSAFetch.fetchResults(page);
                } else {
                    console.error('FandomCSAPI: FCSAFetch module not loaded');
                }
            }
        };

        window.FandomCSAPI = FandomCSAPI;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('FandomCSAPI', FandomCSAPI);
        }
    }
})();
