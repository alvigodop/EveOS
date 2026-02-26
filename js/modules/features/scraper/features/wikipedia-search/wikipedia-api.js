/**
 * Wikipedia API Module (Facade)
 * 
 * Delegates to:
 * - WAFetch: Single entry fetching
 * - WAEnrich: Batch enrichment
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    const WikipediaAPI = window.WikipediaAPI = window.WikipediaAPI || {
        version: '1.1.0-facade',
        _initialized: true,
        init: function () {
            if (window.WAFetch && typeof WAFetch.init === 'function') {
                WAFetch.init();
                WAFetch._initialized = true;
            }
            if (window.WAEnrich && typeof WAEnrich.init === 'function') {
                WAEnrich.init();
                WAEnrich._initialized = true;
            }
            this._initialized = true;
            return this;
        }
    };

    WikipediaAPI.fetchLiveEntry = async function (title) {
        if (window.WAFetch) {
            return WAFetch.fetchLiveEntry(title);
        }
        console.error('WikipediaAPI: WAFetch module not loaded');
        throw new Error('WAFetch missing');
    };

    WikipediaAPI.enrichResults = async function (results) {
        if (window.WAEnrich) {
            return WAEnrich.enrichResults(results);
        }
        console.warn('WikipediaAPI: WAEnrich module not loaded');
    };

    // Register with ModuleRegistry
    if (window.ModuleRegistry) {
        ModuleRegistry.register('WikipediaAPI', WikipediaAPI);
    }

    // Auto-initialize
    if (WikipediaAPI.init) WikipediaAPI.init();
})();
