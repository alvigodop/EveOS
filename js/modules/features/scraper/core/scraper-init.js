/**
 * Scraper Feature Initialization
 * 
 * Orchestrates initialization of all scraper sub-modules.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ScraperInit = {
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize all scraper modules
         */
        init: function () {
            console.log('ScraperInit: Initializing scraper feature...');

            try {
                // Initialize storage modules
                if (window.CCMaintenance && !CCMaintenance._initialized) {
                    CCMaintenance.init();
                }
                if (window.CacheCore && !CacheCore._initialized) {
                    CacheCore.init();
                }
                if (window.CacheManager && !CacheManager._initialized) {
                    CacheManager.init();
                }
                if (window.StorageManager && !StorageManager._initialized) {
                    StorageManager.init();
                }

                // Initialize search modules
                if (window.DirectSearch && !DirectSearch._initialized) {
                    DirectSearch.init();
                }

                // Initialize wiki manager
                if (window.WikiManager && !WikiManager._initialized) {
                    WikiManager.init();
                }

                // Initialize discovery modules
                if (window.WikipediaDiscovery && !WikipediaDiscovery._initialized) {
                    WikipediaDiscovery.init();
                }
                if (window.FandomDiscovery && !FandomDiscovery._initialized) {
                    FandomDiscovery.init();
                }

                // Initialize UI modules
                if (window.PopupManager && !PopupManager._initialized) {
                    PopupManager.init();
                }
                if (window.ResultDisplay && !ResultDisplay._initialized) {
                    ResultDisplay.init();
                }
                if (window.CategoryScraperPanel && !CategoryScraperPanel._initialized) {
                    CategoryScraperPanel.init();
                }

                this._initialized = true;
                console.log('ScraperInit: All scraper modules initialized successfully');
            } catch (error) {
                console.error('ScraperInit: Error during initialization:', error);
            }

            return this;
        }
    };

    // Expose globally
    window.ScraperInit = ScraperInit;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('ScraperInit', ScraperInit);
    }
})();
