/**
 * Fandom Discovery Core Module
 * 
 * Defines the main FandomDiscovery object, initialization logic, and basic utilities.
 * 
 * @version 1.0.1
 */

const FandomDiscovery = {
    version: '1.0.1',
    _initialized: false,
    _searchInProgress: false,
    _lastSearchTerm: '',
    _searchResults: [],
    _lastResults: [],
    _lastError: null,
    _lastQuery: '',
    _googleAccessible: null, // Cache for google accessibility

    /**
     * Initialize the Fandom Discovery module
     */
    init: function () {
        console.log('Initializing FandomDiscovery module v1.0.1');

        // Check for dependencies
        if (!window.FandomSearch) {
            console.warn('FandomDiscovery: FandomSearch module not found, creating compatibility layer');
            this._createFandomSearchCompat();
        }

        // Extend FandomSearch with Discovery capabilities if it exists
        if (window.FandomSearch) {
            this._extendFandomSearch();
        }

        // Check for Google search capability
        if (window.GoogleSearchScraper) {
            console.log('FandomDiscovery: GoogleSearchScraper found, will use for extended discovery');

            // Read Google search toggle state
            if (GoogleSearchScraper.searchOptions) {
                console.log('FandomDiscovery: Reading initial search options from GoogleSearchScraper');
                console.log('Google search:', GoogleSearchScraper.searchOptions.googleSearchEnabled !== false ? 'enabled' : 'disabled');
                console.log('Fandom search:', GoogleSearchScraper.searchOptions.fandomSearchEnabled === true ? 'enabled' : 'disabled');
            } else {
                // Try to read from local storage directly if GoogleSearchScraper.searchOptions is not yet initialized
                console.log('FandomDiscovery: GoogleSearchScraper options not initialized, checking localStorage');
                try {
                    const googleSearchEnabled = localStorage.getItem('googleSearchEnabled') !== 'false'; // Default to true
                    const fandomSearchEnabled = localStorage.getItem('fandomSearchEnabled') === 'true';  // Default to false

                    console.log('FandomDiscovery: Initial search settings - Google:', googleSearchEnabled, 'Fandom:', fandomSearchEnabled);
                } catch (e) {
                    console.warn('FandomDiscovery: Could not read search settings from localStorage');
                }
            }
        } else {
            // GoogleSearchScraper loads later - will be used when available
        }

        // Initialize event listeners
        this._initEventListeners();

        // Mark as initialized
        this._initialized = true;

        // Return true to indicate successful initialization
        return true;
    },

    /**
     * Create a compatibility layer if FandomSearch is not available
     * @private
     */
    _createFandomSearchCompat: function () {
        window.FandomSearch = {
            searchFandomWikis: async function (searchTerm) {
                console.log('FandomSearch compatibility layer called for term:', searchTerm);
                // Just pass through to FandomDiscovery
                return FandomDiscovery.discoverFandomCommunities(searchTerm);
            },
            init: function () {
                console.log('FandomSearch compatibility layer initialized');
                return true;
            }
        };
    },

    /**
     * Extend the FandomSearch module with Discovery capabilities
     * @private
     */
    _extendFandomSearch: function () {
        // Check if FandomSearch.searchFandomWikis already exists
        if (typeof FandomSearch.searchFandomWikis !== 'function') {
            console.warn('FandomDiscovery: FandomSearch.searchFandomWikis does not exist, creating method');

            // Create the method if it doesn't exist
            FandomSearch.searchFandomWikis = async function (searchTerm, options) {
                console.log('FandomSearch.searchFandomWikis created by FandomDiscovery called with:', searchTerm);
                return FandomDiscovery.discoverFandomCommunities(searchTerm, options);
            };

            console.log('FandomDiscovery: Created searchFandomWikis method on FandomSearch');
            return;
        }

        // Store the original method safely
        const originalMethod = FandomSearch.searchFandomWikis;

        // Extend search method with discovery capabilities
        FandomSearch.searchFandomWikis = async function (searchTerm, options) {
            console.log('Extended FandomSearch.searchFandomWikis called with:', searchTerm);

            try {
                // First try the original search method
                let results = [];

                // Only call the original if it exists and is a function
                if (originalMethod && typeof originalMethod === 'function') {
                    try {
                        // Call the original method safely
                        results = await originalMethod.apply(FandomSearch, [searchTerm, options]);
                    } catch (error) {
                        console.warn('FandomDiscovery: Error calling original searchFandomWikis, using fallback:', error);
                        // Continue with empty results array
                    }
                }

                // If no results or explicitly requested, enhance with discovery
                if ((results.length === 0 || (options && options.useDiscovery)) && FandomDiscovery) {
                    console.log('FandomSearch: No results from basic search, using FandomDiscovery');
                    const discoveryResults = await FandomDiscovery.discoverFandomCommunities(searchTerm, options);

                    // Merge results, avoiding duplicates
                    if (discoveryResults && discoveryResults.length > 0) {
                        discoveryResults.forEach(result => {
                            // Check if this URL already exists in results
                            if (!results.some(r => r.url === result.url)) {
                                results.push(result);
                            }
                        });
                    }
                }

                return results;
            } catch (error) {
                console.error('FandomDiscovery: Error in extended searchFandomWikis:', error);
                // Return empty array as fallback
                return [];
            }
        };

        console.log('FandomDiscovery: Successfully extended FandomSearch with discovery capabilities');
    },

    /**
     * Initialize event listeners
     * @private
     */
    _initEventListeners: function () {
        // Register for search events if EventBus is available
        if (window.EventBus) {
            EventBus.subscribe('fandom-search-initiated', this._handleSearchEvent.bind(this));
        }
    },

    /**
     * Handle search events from EventBus
     * @private
     */
    _handleSearchEvent: function (data) {
        if (data && data.searchTerm) {
            console.log('FandomDiscovery: Handling search event for term:', data.searchTerm);

            // Get search options from GoogleSearchScraper if available
            const options = data.options || {};
            if (window.GoogleSearchScraper && GoogleSearchScraper.searchOptions) {
                options.useGoogleSearch = GoogleSearchScraper.searchOptions.googleSearchEnabled !== false;
                options.useFandomSearch = GoogleSearchScraper.searchOptions.fandomSearchEnabled === true;
                options.prioritizeGoogleSearch = GoogleSearchScraper.searchOptions.prioritizeGoogleSearch === true;
            }

            this.discoverFandomCommunities(data.searchTerm, options);
        }
    },

    /**
     * Get the results from the last search
     * @returns {Array} - Array of search results
     */
    getLastSearchResults: function () {
        return this._searchResults;
    },

    /**
     * Check if a search is currently in progress
     * @returns {boolean} - True if a search is in progress
     */
    isSearchInProgress: function () {
        return this._searchInProgress;
    },

    /**
     * Get the last search term used
     * @returns {string} - The last search term
     */
    getLastSearchTerm: function () {
        return this._lastSearchTerm;
    },

    /**
     * Format a search term into a wiki name
     * @param {string} query - Search query
     * @returns {string} Formatted wiki name
     * @private
     */
    _formatWikiName: function (query) {
        if (!query) return 'Wiki';

        // Capitalize first letter of each word
        return query.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ') + ' Wiki';
    },

    /**
     * Check if the Wikipedia Discovery module exists and is loaded
     * @returns {boolean} True if WikipediaDiscovery is available
     * @private
     */
    _isWikipediaDiscoveryAvailable: function () {
        return typeof window.WikipediaDiscovery !== 'undefined' &&
            window.WikipediaDiscovery.initialized === true;
    },

    /**
     * Safe wrapper for calling WikipediaDiscovery to prevent errors
     * @param {string} query - Search query
     * @param {Function} callback - Callback for results
     * @private
     */
    _safeCallWikipediaDiscovery: function (query, callback) {
        if (this._isWikipediaDiscoveryAvailable()) {
            try {
                return window.WikipediaDiscovery.discover(query, callback);
            } catch (error) {
                console.error('FandomDiscovery: Error calling WikipediaDiscovery', error);
                callback && callback([]);
            }
        } else {
            console.warn('FandomDiscovery: WikipediaDiscovery module not available');
            callback && callback([]);
        }
    }
};

// Make globally available
window.FandomDiscovery = FandomDiscovery;

// Auto-initialize if enabled
if (typeof FandomDiscovery.init === 'function') {
    console.log('FandomDiscovery Core: Auto-initializing module');
    FandomDiscovery.init();
}

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('FandomDiscovery', FandomDiscovery);
    console.log('Registering FandomDiscovery with ModuleRegistry');
}

// Export the module if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FandomDiscovery;
}
