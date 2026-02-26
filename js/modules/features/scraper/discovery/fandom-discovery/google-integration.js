/**
 * Fandom Discovery Google Integration
 * 
 * Extends FandomDiscovery with Google Search capabilities.
 */

(function () {
    if (!window.FandomDiscovery) {
        console.error('FandomDiscovery core must be loaded before Google integration');
        return;
    }

    Object.assign(window.FandomDiscovery, {
        /**
         * Check if Google search should be prioritized
         * @returns {boolean} Whether Google search should be prioritized
         */
        shouldPrioritizeGoogleSearch: function () {
            // Check from GoogleSearchScraper if available
            if (window.GoogleSearchScraper && GoogleSearchScraper.searchOptions) {
                return GoogleSearchScraper.searchOptions.prioritizeGoogleSearch === true;
            }

            // Default to false if no setting available
            return false;
        },

        /**
         * Check if Google search is accessible
         * @returns {boolean} Whether Google search is accessible
         * @private
         */
        _isGoogleAccessible: function () {
            // Check if BrowserEmulator is available
            if (!window.BrowserEmulator) {
                console.warn('FandomDiscovery: BrowserEmulator module not found for Google search');
                return false;
            }

            // Check if BrowserEmulator has renderUrl function
            if (typeof BrowserEmulator.renderUrl !== 'function' && typeof BrowserEmulator.renderURL !== 'function') {
                console.warn('FandomDiscovery: BrowserEmulator.renderUrl/renderURL function not found');
                return false;
            }

            // If this module isn't ready, we can't check
            if (!this._initialized) {
                console.warn('FandomDiscovery: Module not initialized, assuming Google is accessible');
                return true;
            }

            // Check cached value if available
            if (this._googleAccessible !== null) {
                return this._googleAccessible;
            }

            // Default to true if we haven't explicitly tested
            return true;
        },

        /**
         * Check if Google search is available and working
         * @returns {Promise<boolean>} Whether Google search is accessible
         */
        isGoogleAccessible: async function () {
            console.log('FandomDiscovery: Checking Google search accessibility...');

            // First check if BrowserEmulator is available and ready
            const browserEmulatorReady = typeof window.BrowserEmulator !== 'undefined' &&
                typeof window.BrowserEmulator.renderUrl === 'function';

            if (!browserEmulatorReady) {
                console.warn('FandomDiscovery: BrowserEmulator not ready for Google search');
                return false;
            }

            // Only do the connectivity test if BrowserEmulator is ready
            try {
                const response = await fetch('https://www.google.com/favicon.ico', {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-cache'
                });

                console.log('FandomDiscovery: Google appears to be accessible');
                return true;
            } catch (error) {
                console.warn('FandomDiscovery: Google appears to be inaccessible', error);
                return false;
            }
        },

        /**
         * Search using Google Search Scraper
         * @param {string} query - Search query
         * @param {Object} options - Search options
         * @returns {Promise<Object>} Search results and metadata
         */
        searchWithGoogle: async function (query, options = {}) {
            console.log(`FandomDiscovery: Searching Google for "${query}"`);

            if (!window.GoogleSearchScraper) {
                console.error('FandomDiscovery: GoogleSearchScraper module not available');
                return {
                    results: [],
                    success: false,
                    error: 'GoogleSearchScraper module not available'
                };
            }

            try {
                // Use the scrapeGoogleForFandomWikis method if available
                if (typeof GoogleSearchScraper.scrapeGoogleForFandomWikis === 'function') {
                    const results = await GoogleSearchScraper.scrapeGoogleForFandomWikis(query, options);

                    if (Array.isArray(results)) {
                        return {
                            results: results,
                            success: results.length > 0,
                            timestamp: Date.now()
                        };
                    } else if (results && typeof results === 'object') {
                        // Handle case where result is already an object with metadata
                        return {
                            results: results.results || [],
                            success: results.success || false,
                            timestamp: results.timestamp || Date.now(),
                            error: results.error || null
                        };
                    }
                }
                // Use the _scrapeGoogle method directly if available
                else if (typeof GoogleSearchScraper._scrapeGoogle === 'function') {
                    return await GoogleSearchScraper._scrapeGoogle(query, options);
                }
                else {
                    console.error('FandomDiscovery: No valid Google search method available in GoogleSearchScraper');
                    return {
                        results: [],
                        success: false,
                        error: 'No valid Google search method available'
                    };
                }
            } catch (error) {
                console.error('FandomDiscovery: Error during Google search:', error);

                // Show error notification if available
                if (typeof window.ErrorNotifier !== 'undefined') {
                    window.ErrorNotifier.showGoogleSearchError({
                        message: `Error during Google search: ${error.message || 'Unknown error'}`
                    });
                }

                return {
                    results: [],
                    success: false,
                    error: error.message || 'Error during Google search'
                };
            }

            // Return empty results if execution reaches here
            return {
                results: [],
                success: false,
                error: 'Failed to execute Google search'
            };
        }
    });

    console.log('FandomDiscovery: Google integration loaded');
})();
