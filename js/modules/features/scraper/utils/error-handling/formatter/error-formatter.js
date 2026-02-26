/**
 * Error Formatter Utility (Facade)
 * Formats error objects to prevent [object Object] display issues
 * Delegates to sub-modules: Formatters, Overrides, DOM
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    // Create the ErrorFormatter namespace
    window.ErrorFormatter = {
        version: '1.0.0',
        _initialized: true,

        /**
         * Initialize the error formatter
         */
        init: function () {
            console.log('Initializing ErrorFormatter (Facade)');

            // Initialize Sub-modules if present
            if (window.ErrorFormatters && typeof ErrorFormatters.init === 'function') {
                ErrorFormatters.init();
            }
            if (window.ErrorOverrides && typeof ErrorOverrides.init === 'function') {
                ErrorOverrides.init();
            }
            if (window.ErrorDOM && typeof ErrorDOM.init === 'function') {
                ErrorDOM.init();
            }

            this.ensureErrorArrays();
            this.fixDisplayedErrors();
            this.setupErrorArrayMethods();

            return this;
        },

        /**
         * Ensure all error arrays have proper methods
         */
        ensureErrorArrays: function () {
            // Initialize the loading errors array if not already present
            if (!window.moduleLoadingErrors) {
                window.moduleLoadingErrors = [];
            }

            // Format existing errors in moduleLoadingErrors
            window.moduleLoadingErrors = this.formatErrorArray(window.moduleLoadingErrors);

            // Add toString method to avoid [object Object] display
            this.addToStringMethod(window.moduleLoadingErrors);

            console.log('Error arrays initialized');
        },

        /**
         * Format an array of errors for proper display
         */
        formatErrorArray: function (errorArray) {
            if (window.ErrorFormatters) {
                return ErrorFormatters.formatErrorArray(errorArray);
            }
            // Fallback if submodule not loaded
            return Array.isArray(errorArray) ? errorArray : [];
        },

        /**
         * Add toString method to an array to prevent [object Object] in display
         */
        addToStringMethod: function (array) {
            if (window.ErrorOverrides) {
                ErrorOverrides.addToStringMethod(array);
            }
        },

        /**
         * Fix any errors displayed in the UI
         */
        fixDisplayedErrors: function () {
            if (window.ErrorDOM) {
                ErrorDOM.fixDisplayedErrors();
            }
        },

        /**
         * Set up methods on error arrays to prevent [object Object] display
         */
        setupErrorArrayMethods: function () {
            if (window.ErrorOverrides) {
                ErrorOverrides.setupErrorArrayMethods();
            }
        },

        /**
         * Set up a monitoring interval to continuously check and fix error displays
         */
        setupMonitoringInterval: function () {
            // Managed by ErrorDOM.init() usually, but kept for compatibility
            if (window.ErrorDOM) {
                ErrorDOM.setupMonitoringInterval();
            }
        },

        /**
         * Format a specific error object for display
         */
        formatError: function (error) {
            if (window.ErrorFormatters) {
                return ErrorFormatters.formatError(error);
            }
            // Fallback
            return String(error);
        },

        /**
         * Format all error displays in the application
         */
        formatAllErrorDisplays: function () {
            // Format the moduleLoadingErrors array
            this.ensureErrorArrays();

            // Fix any elements displaying [object Object]
            this.fixDisplayedErrors();

            console.log('All error displays formatted');
        }
    };

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('ErrorFormatter', window.ErrorFormatter);
    }

    // Initialize the error formatter
    window.ErrorFormatter.init();

    // Immediately format any existing errors with extra safeguards
    try {
        if (window.moduleLoadingErrors && Array.isArray(window.moduleLoadingErrors)) {
            console.log('Formatting existing moduleLoadingErrors on load');

            // Process ModuleRegistry errors specifically
            window.moduleLoadingErrors = window.moduleLoadingErrors.map(error => {
                if (typeof error !== 'object' || error === null) {
                    return { message: String(error), module: 'unknown' };
                }

                // Identify module registry errors (Specific logic kept in facade or could move to formatters)
                // For now, simplifed delegation or basic object check to avoid huge file size again. 
                // Detailed parsing logic usually belongs in Formatters, but for immediate compat:

                if (window.ErrorFormatters) {
                    return ErrorFormatters.formatError(error);
                }

                return error;
            });

            // Add toString method to the array
            if (window.ErrorOverrides) {
                ErrorOverrides.addToStringMethod(window.moduleLoadingErrors);
            }

            // Log the result to verify they're properly formatted
            if (window.moduleLoadingErrors.toString) {
                console.log('Formatted errors:', window.moduleLoadingErrors.toString());
            }
        }
    } catch (e) {
        console.error('Critical error in error formatter:', e);
    }

    console.log('ErrorFormatter loaded');
})();