/**
 * SearchConfig Module - Manages search configuration settings
 * @version 1.0.0
 */
const SearchConfig = (function () {
    // Private configuration
    const _config = {
        googleCSE: {
            cseId: '646ca4244f3524a8e',  // Default CSE ID used for Google searches
            apiKey: '',  // Resolved at runtime from the user's Settings (config.expandedSearch.apiKey) — never hardcode a key here
            containerIds: {
                searchBoxId: 'google-searchbox-container',
                resultsContainerId: 'google-results-container'
            },
            preventNavigation: true,      // Prevent navigation away from page
            retryCount: 3,                // Number of times to retry loading CSE
            timeout: 10000,               // Timeout for loading CSE in milliseconds
            safeMode: true,               // Enable safe mode for error handling
            enableSamePageResults: true,  // Use embedded results
            maxRetries: 3,                // Retries if CSE fails to load
            retryDelay: 1000              // Delay between retries in ms
        },
        wikipedia: {
            apiEndpoint: 'https://en.wikipedia.org/w/api.php',
            searchLimit: 10,
            contentLength: 'medium'       // 'short', 'medium', 'full'
        },
        general: {
            logLevel: 'info',             // 'debug', 'info', 'warn', 'error', 'none'
            disableFallbackSearch: false, // Disable fallback search when primary search fails
            enableCaching: true,          // Enable search result caching
            cacheExpiry: 3600000          // Cache expiry time in milliseconds (1 hour)
        },
        searchResultLimit: 10,
        defaultSearchLanguage: 'en'
    };

    // Public API
    return {
        /**
         * Get Google CSE configuration
         * @returns {Object} Google CSE configuration
         */
        getGoogleCSEConfig: function () {
            return Object.assign({}, _config.googleCSE);
        },

        /**
         * Get Wikipedia search configuration
         * @returns {Object} Wikipedia search configuration
         */
        getWikipediaConfig: function () {
            return Object.assign({}, _config.wikipedia);
        },

        /**
         * Get general search configuration
         * @returns {Object} General search configuration
         */
        getGeneralConfig: function () {
            return Object.assign({}, _config.general);
        },

        /**
         * Get all search configurations
         * @returns {Object} All search configurations
         */
        getAllConfig: function () {
            return {
                googleCSE: this.getGoogleCSEConfig(),
                wikipedia: this.getWikipediaConfig(),
                general: this.getGeneralConfig()
            };
        },

        /**
         * Get CSE ID for Google Custom Search
         * @returns {string} CSE ID
         */
        getCseId: function () {
            return _config.googleCSE.cseId;
        },

        /**
         * Set CSE ID for Google Custom Search
         * @param {string} id - The CSE ID to set
         */
        setCseId: function (id) {
            if (id && typeof id === 'string') {
                _config.googleCSE.cseId = id;
                console.log(`SearchConfig: CSE ID updated to ${id}`);
            } else {
                console.warn('SearchConfig: Invalid CSE ID provided, using default');
            }
        },

        /**
         * Get API Key for Google Custom Search
         * @returns {string} API Key
         */
        getApiKey: function () {
            // The key lives in the user's Settings (config.expandedSearch.apiKey), populated
            // through the Integrations panel — resolve it at call time so nothing is hardcoded.
            return _config.googleCSE.apiKey
                || (typeof window !== 'undefined' && window.config?.expandedSearch?.apiKey)
                || '';
        },

        /**
         * Set API Key for Google Custom Search
         * @param {string} key - The API Key to set
         */
        setApiKey: function (key) {
            if (key && typeof key === 'string') {
                _config.googleCSE.apiKey = key;
                console.log(`SearchConfig: API Key updated`);
            } else {
                console.warn('SearchConfig: Invalid API Key provided, using default');
            }
        },

        /**
         * Get search result limit
         * @returns {number} Search result limit
         */
        getSearchResultLimit: function () {
            return _config.searchResultLimit;
        },

        /**
         * Set search result limit
         * @param {number} limit - The search result limit to set
         */
        setSearchResultLimit: function (limit) {
            if (typeof limit === 'number' && limit > 0) {
                _config.searchResultLimit = limit;
                console.log(`SearchConfig: Search result limit updated to ${limit}`);
            } else {
                console.warn('SearchConfig: Invalid search result limit provided, using default');
            }
        },

        /**
         * Get default search language
         * @returns {string} Default search language
         */
        getDefaultSearchLanguage: function () {
            return _config.defaultSearchLanguage;
        },

        /**
         * Set default search language
         * @param {string} language - The default search language to set
         */
        setDefaultSearchLanguage: function (language) {
            if (typeof language === 'string' && language.length === 2) {
                _config.defaultSearchLanguage = language;
                console.log(`SearchConfig: Default search language updated to ${language}`);
            } else {
                console.warn('SearchConfig: Invalid default search language provided, using default');
            }
        }
    };
})();

// Register module if ModuleRegistry exists
if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('SearchConfig', SearchConfig);
    console.log('SearchConfig module registered successfully.');
}

// Explicitly assign to window for global access (const doesn't auto-assign to window in strict mode)
window.SearchConfig = SearchConfig; 