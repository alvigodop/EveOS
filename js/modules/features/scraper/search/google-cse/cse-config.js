/**
 * Google CSE Configuration Module
 * 
 * Handles loading and validation of Google CSE configuration.
 * 
 * @version 1.0.0
 */

const CSEConfig = (function () {
    // Private state
    let _config = {
        cseId: null,
        apiKey: null,
        containerIds: {
            searchBoxId: 'google-searchbox-container',
            resultsContainerId: 'google-results-container'
        },
        preventNavigation: true,
        retryCount: 3,
        timeout: 10000,
        safeMode: true
    };

    return {
        /**
         * Initialize configuration from SearchConfig and override options
         * @param {Object} options - Manual overrides
         * @returns {Object} The finalized configuration
         */
        initialize: function (options = {}) {
            console.log('CSEConfig: Initializing configuration...');

            try {
                // 1. Load from SearchConfig if available
                if (window.SearchConfig) {
                    console.log('CSEConfig: Using SearchConfig for settings.');

                    const cseConfig = typeof window.SearchConfig.getGoogleCSEConfig === 'function' ?
                        window.SearchConfig.getGoogleCSEConfig() : {};

                    _config.cseId = cseConfig.cseId || (typeof window.SearchConfig.getCseId === 'function' ? window.SearchConfig.getCseId() : null);
                    _config.apiKey = cseConfig.apiKey || (typeof window.SearchConfig.getApiKey === 'function' ? window.SearchConfig.getApiKey() : null);

                    if (cseConfig.containerIds) {
                        _config.containerIds = { ..._config.containerIds, ...cseConfig.containerIds };
                    }
                    if (cseConfig.preventNavigation !== undefined) _config.preventNavigation = cseConfig.preventNavigation;
                    if (cseConfig.retryCount !== undefined) _config.retryCount = cseConfig.retryCount;
                    if (cseConfig.timeout !== undefined) _config.timeout = cseConfig.timeout;
                    if (cseConfig.safeMode !== undefined) _config.safeMode = cseConfig.safeMode;
                } else {
                    console.warn('CSEConfig: SearchConfig not found. Using defaults.');
                }

                // 2. Apply manual overrides (highest priority)
                if (options.cseId) _config.cseId = options.cseId;
                if (options.apiKey) _config.apiKey = options.apiKey; // In case apiKey is passed
                if (options.containerIds) _config.containerIds = { ..._config.containerIds, ...options.containerIds };
                if (options.preventNavigation !== undefined) _config.preventNavigation = options.preventNavigation;
                if (options.retryCount !== undefined) _config.retryCount = options.retryCount;
                if (options.timeout !== undefined) _config.timeout = options.timeout;
                if (options.safeMode !== undefined) _config.safeMode = options.safeMode;

                // 3. Validation
                if (!_config.cseId) {
                    console.error('CSEConfig: CSE ID is missing!');
                } else {
                    console.log(`CSEConfig: Final configuration set. CSE ID: ${_config.cseId}`);
                }

                return Object.assign({}, _config);

            } catch (error) {
                console.error('CSEConfig: Error initializing config:', error);
                return _config;
            }
        },

        /**
         * Get current configuration
         */
        getConfig: function () {
            return Object.assign({}, _config);
        },

        /**
         * Check if configuration is valid
         */
        isValid: function () {
            return !!_config.cseId;
        }
    };
})();

// Register
if (typeof ModuleRegistry !== 'undefined') {
    ModuleRegistry.register('CSEConfig', CSEConfig);
}

// Global Export
window.CSEConfig = CSEConfig;
