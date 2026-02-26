/**
 * Search Wikipedia Module (Facade)
 * 
 * Delegates to:
 * - SWOrchestrator: Main search orchestration
 * - WikipediaProcessor: Helper methods
 * 
 * @version 1.2.0-facade
 */

(function () {
    'use strict';

    // Create SearchWikipedia namespace
    const SearchWikipedia = window.SearchWikipedia = {
        version: '1.2.0-facade',
        _initialized: false
    };

    /**
     * Initialize the module
     */
    SearchWikipedia.init = function () {
        if (this._initialized) return this;
        console.log('[SearchWikipedia] Initializing (Facade)...');
        if (window.SWOrchestrator && typeof SWOrchestrator.init === 'function') {
            SWOrchestrator.init();
            SWOrchestrator._initialized = true;
        }
        this._initialized = true;
        return this;
    };

    /**
     * Remove diacritics from a string (Proxy to WikipediaProcessor)
     */
    SearchWikipedia.removeDiacritics = function (str) {
        if (window.WikipediaProcessor) {
            return WikipediaProcessor.removeDiacritics(str);
        }
        return str; // Fallback
    };

    /**
     * Search managed Wikipedia entries
     */
    SearchWikipedia.searchManagedWikipedia = async function (entries, query, options, showLoadingFn) {
        if (window.SWOrchestrator) {
            return SWOrchestrator.searchManagedWikipedia(entries, query, options, showLoadingFn);
        }
        console.error('SearchWikipedia: SWOrchestrator module not loaded');
        return [];
    };

    // Auto-initialize
    SearchWikipedia.init();

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('SearchWikipedia', SearchWikipedia);
    }

})();
