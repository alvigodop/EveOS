/**
 * Error Suppressor Module (Facade)
 * 
 * Intercepts non-critical errors and warnings and redirects them to the 
 * unified Search Monitor UI.
 * 
 * Delegates to:
 * - ESConfig: Configuration and pattern matching
 * - ESHandlers: Global error interception
 * - ESLogger: Reporting to UI
 * 
 * @version 2.0.2 (Modularized)
 */

// IIFE to prevent global scope pollution and redeclaration errors
(function () {
    // If already loaded manually (e.g. via blocking script tag), don't reload
    if (window.ErrorSuppressor && window.ErrorSuppressor._initialized) {

        return;
    }

    const ErrorSuppressor = {
        version: '2.0.2',
        _initialized: false,
        _config: {},

        // Check for submodules
        _checkComponents: function () {
            if (!window.ESConfig) console.warn('ErrorSuppressor: ESConfig not found');
            if (!window.ESHandlers) console.warn('ErrorSuppressor: ESHandlers not found');
            if (!window.ESLogger) console.warn('ErrorSuppressor: ESLogger not found');
        },

        /**
         * Initialize the Error Suppressor
         * @param {Object} config - Configuration options
         * @returns {boolean} - Whether initialization was successful
         */
        init: function (config = {}) {


            if (this._initialized) {
                // console.warn('ErrorSuppressor already initialized');
                return true;
            }

            // Load default config
            if (window.ESConfig) {
                this._config = { ...ESConfig.defaults, ...config };
            } else {
                this._config = config;
            }

            this._setupErrorHandling();

            this._initialized = true;
            // Initialization complete
            return true;
        },

        /**
         * Set up error handlers to intercept errors
         * @private
         */
        _setupErrorHandling: function () {
            this._checkComponents();

            if (window.ESHandlers && window.ESConfig && window.ESLogger) {
                ESHandlers.setupErrorHandling(window.ESConfig, window.ESLogger, this._config);
            } else {
                console.error('ErrorSuppressor: Components missing, cannot setup handlers');
            }
        },



        _shouldIgnoreError: function (event) {
            if (window.ESConfig) {
                return ESConfig.shouldIgnore(event, this._config);
            }
            return false;
        }
    };

    // Initialize the module immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ErrorSuppressor.init());
    } else {
        ErrorSuppressor.init();
    }

    // Make the module globally available
    window.ErrorSuppressor = ErrorSuppressor;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('ErrorSuppressor', ErrorSuppressor);
    } else {
        // Fallback registration
        window.modules = window.modules || [];
        window.modules.push(ErrorSuppressor);
    }

})();