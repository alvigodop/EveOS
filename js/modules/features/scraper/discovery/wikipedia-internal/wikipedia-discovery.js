/**
 * Wikipedia Discovery Module (Facade)
 * Orchestrates sub-modules: WDCore, WDSearch, WDMedia, WDEnhancer
 * 
 * @version 1.0.3
 */

// Use IIFE to avoid global namespace pollution
(function () {
    // Create the module if it doesn't exist
    if (typeof window.WikipediaDiscovery === 'undefined') {
        window.WikipediaDiscovery = {
            version: '1.0.3', // Keeping version same as it's a refactor
            initialized: false,

            /**
             * Initialize the module
             */
            init: function () {
                if (this.initialized) {
                    console.log('WikipediaDiscovery: Already initialized');
                    return this;
                }

                console.log('WikipediaDiscovery: Initializing module v' + this.version + ' (Facade)');

                // Initialize sub-modules
                if (window.WDCore) WDCore.init();
                if (window.WDSearch) WDSearch.init();
                if (window.WDMedia) WDMedia.init();
                if (window.WDEnhancer) WDEnhancer.init();

                this.initialized = true;
                this._initialized = true;

                // Register with ModuleRegistry if available
                if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
                    ModuleRegistry.register('WikipediaDiscovery', this);
                    console.log('WikipediaDiscovery: Registered with ModuleRegistry');
                }

                return this;
            },

            /**
             * Set the search mode
             * @param {string} mode - 'direct' or 'server'
             */
            setSearchMode: function (mode) {
                if (window.WDCore) {
                    WDCore.setSearchMode(mode);
                }
            },

            /**
             * Get current search mode
             * @returns {string} Current search mode
             */
            getSearchMode: function () {
                return window.WDCore ? WDCore.getSearchMode() : 'direct';
            },

            /**
             * Discover Wikipedia wikis based on query
             * @param {string} query - Search query
             * @param {Function} callback - Callback function for results
             */
            discover: function (query, callback) {
                if (window.WDSearch) {
                    WDSearch.discover(query, callback);
                } else {
                    console.warn('WikipediaDiscovery: WDSearch module missing');
                    if (callback) callback([]);
                }
            },

            /**
             * Fetch thumbnails for Wikipedia results
             * @param {Array} results - Array of result objects
             * @returns {Promise<Array>} - Enhanced results with thumbnails
             */
            fetchThumbnails: async function (results) {
                if (window.WDMedia) {
                    return await WDMedia.fetchThumbnails(results);
                } else {
                    console.warn('WikipediaDiscovery: WDMedia module missing');
                    return results;
                }
            },

            /**
             * Enhance results with web data (smart discovery)
             * @param {Array} results - Original results
             * @param {string} searchTerm - Original search term
             * @returns {Promise<Array>} - Expanded results array
             */
            enhanceResults: async function (results, searchTerm) {
                if (window.WDEnhancer) {
                    return await WDEnhancer.enhanceResults(results, searchTerm);
                } else {
                    console.warn('WikipediaDiscovery: WDEnhancer module missing');
                    return results;
                }
            }
        };

        // Auto-initialize if document is already loaded
        if (document.readyState === 'complete') {
            window.WikipediaDiscovery.init();
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                window.WikipediaDiscovery.init();
            });
        }
    } else {
        console.log('WikipediaDiscovery: Module already defined, skipping redefinition');
    }
})();

// Expose as module if exports are available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.WikipediaDiscovery;
}
