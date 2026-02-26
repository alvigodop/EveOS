/**
 * Fandom Discovery Search Coordinator
 * 
 * Orchestrates search operations across different strategies.
 */

(function () {
    if (!window.FandomDiscovery) {
        console.error('FandomDiscovery core must be loaded before search coordinator');
        return;
    }

    Object.assign(window.FandomDiscovery, {
        /**
         * Search Fandom communities with automatic discovery capability
         * @param {string} query - Search query
         * @param {Object} options - Search options
         * @returns {Promise<Object>} Search results and metadata
         */
        discoverFandomCommunities: async function (query, options = {}) {
            if (!query || query.trim() === '') {
                console.warn('FandomDiscovery: Empty search query');
                return {
                    results: [],
                    success: false,
                    error: 'Empty search query'
                };
            }

            console.log(`FandomDiscovery: Discovering Fandom communities for "${query}"`, options);

            // Clear previous results if prioritizing Google search
            if (options.prioritizeGoogleSearch) {
                // Clear result container if it exists
                const container = document.getElementById('discovery-results-container');
                if (container) {
                    container.innerHTML = '';
                }
            }

            // Check if Google is accessible
            const googleAccessible = options.useGoogleSearch && await this.isGoogleAccessible();
            console.log(`FandomDiscovery: Google search accessible: ${googleAccessible}`);

            let results = [];
            let searchMethod = null;

            // Logic for search order based on options
            if (options.prioritizeGoogleSearch && googleAccessible) {
                // Try Google search first if prioritized and accessible
                console.log('FandomDiscovery: Prioritizing Google search');
                const googleResult = await this.executeGoogleStrategy(query, options);

                if (googleResult.success) {
                    results = googleResult.results;
                    searchMethod = googleResult.method;
                } else {
                    console.log('FandomDiscovery: No Google results, falling back to direct methods');

                    // If Google search failed, try Fandom search if enabled
                    if (options.useFandomSearch) {
                        const fandomResult = await this.executeFandomStrategy(query, options, false);

                        if (fandomResult.success) {
                            results = fandomResult.results;
                            searchMethod = fandomResult.method;
                        }
                    }
                }
            } else {
                // Non-prioritized search logic
                // Try Fandom search first if enabled
                if (options.useFandomSearch) {
                    const fandomResult = await this.executeFandomStrategy(query, options, false);

                    if (fandomResult.success) {
                        results = fandomResult.results;
                        searchMethod = fandomResult.method;
                    }
                }

                // Try Google search if no results found or if Fandom search is disabled
                if ((results.length === 0 || !options.useFandomSearch) && options.useGoogleSearch && googleAccessible) {
                    const googleResult = await this.executeGoogleStrategy(query, options);

                    if (googleResult.success) {
                        results = googleResult.results;
                        searchMethod = googleResult.method;
                    }
                }
            }

            // Log final results
            console.log(`FandomDiscovery: Final results count: ${results.length}, search method: ${searchMethod || 'none'}`);

            // Check Google Compatibility
            if (this.checkGoogleCompatibility) {
                this.checkGoogleCompatibility(options);
            }

            // Cache results
            this._searchResults = results;
            this._lastSearchTerm = query;
            this._searchInProgress = false;

            return {
                results: results,
                searchMethod: searchMethod,
                success: results.length > 0,
                timestamp: Date.now()
            };
        },

        /**
         * Search for Fandom communities using specified method
         * Alternate entry point that provides more granular control
         * @param {string} query - The search query
         * @param {Object} options - Search options
         * @returns {Promise<Array>} Search results
         */
        searchFandom: async function (query, options = {}) {
            console.log(`FandomDiscovery: Searching for "${query}" with options:`, options);

            if (!query) {
                console.warn('FandomDiscovery: No query provided');
                return [];
            }

            this._lastQuery = query;

            const prioritizeGoogleSearch = options.prioritizeGoogleSearch !== undefined ?
                options.prioritizeGoogleSearch :
                this.shouldPrioritizeGoogleSearch();

            const useDirectFandom = options.useDirectFandom !== undefined ?
                options.useDirectFandom :
                this.shouldUseDirectFandom();

            // Set up options for discoverFandomCommunities
            const discoveryOptions = {
                useGoogleSearch: true, // Default to true if not specified
                useFandomSearch: useDirectFandom,
                prioritizeGoogleSearch: prioritizeGoogleSearch,
                ...options
            };

            // Reuse the main discovery logic
            // Note: searchFandom returns Array, discoverFandomCommunities returns Object
            const response = await this.discoverFandomCommunities(query, discoveryOptions);

            return response.results || [];
        },

        /**
         * Handle search results to ensure consistent format
         * @param {Array|Object} results - The search results to process
         * @param {string} source - Source of the results
         * @returns {Array} Formatted results array
         * @private
         */
        _handleSearchResults: function (results, source = 'unknown') {
            console.log(`FandomDiscovery: Handling search results from ${source}`);

            if (!results) return [];

            if (Array.isArray(results)) {
                return results.filter(item => item && typeof item === 'object' && item.url);
            }

            if (typeof results === 'object' && 'results' in results) {
                if (results.results && Array.isArray(results.results)) {
                    return results.results.filter(item => item && typeof item === 'object' && item.url);
                }
            }

            return [];
        }
    });

    console.log('FandomDiscovery: Search coordinator loaded');
})();
