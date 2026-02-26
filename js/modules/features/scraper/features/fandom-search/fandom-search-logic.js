/**
 * Search Fandom Logic Module (Facade)
 * 
 * Delegates to:
 * - FSLCore: Main search orchestration
 * - FSLCache: Cache interaction (internal use)
 * - FSLLive: Live fetching (internal use)
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SearchFandomLogic = {
        version: '1.0.0',
        _initialized: false,

        init: function () {
            if (this._initialized) return this;
            console.log('SearchFandomLogic initializing...');

            if (window.FSLCore && typeof FSLCore.init === 'function') {
                FSLCore.init();
                FSLCore._initialized = true;
            }
            if (window.FSLCache && typeof FSLCache.init === 'function') {
                FSLCache.init();
                FSLCache._initialized = true;
            }
            if (window.FSLLive && typeof FSLLive.init === 'function') {
                FSLLive.init();
                FSLLive._initialized = true;
            }

            this._initialized = true;
            return this;
        },

        searchManagedFandom: async function (domains, query, options, showLoadingFn) {
            if (window.FSLCore) {
                return FSLCore.searchManagedFandom(domains, query, options, showLoadingFn);
            }
            console.error('SearchFandomLogic: FSLCore module not loaded');
            return [];
        }
    };

    window.SearchFandomLogic = SearchFandomLogic;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('SearchFandomLogic', SearchFandomLogic);
    }

    // Auto-init
    if (SearchFandomLogic.init) SearchFandomLogic.init();

    console.log('SearchFandomLogic module loaded');

})();
