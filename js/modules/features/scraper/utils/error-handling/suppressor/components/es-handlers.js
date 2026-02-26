/**
 * Error Suppressor - Handlers Component
 * 
 * Sets up global error handlers and console interception.
 * 
 * @version 1.0.0
 */

const ESHandlers = {
    _originalConsole: null,

    /**
     * Set up error handlers to intercept errors
     * @param {Object} configComponent - Reference to ESConfig
     * @param {Object} loggerComponent - Reference to ESLogger
     * @param {Object} config - Active configuration
     */
    setupErrorHandling: function (configComponent, loggerComponent, config) {
        if (!configComponent || !loggerComponent) return;

        // Store original console methods
        this._originalConsole = {
            error: console.error,
            warn: console.warn,
            info: console.info,
            log: console.log
        };

        // Create a reference to this for use in event handlers
        const self = this;

        // Helper function to check if a message should be suppressed
        const shouldSuppress = (args) => {
            const msg = Array.from(args)
                .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
                .join(' ');

            return configComponent.shouldIgnore(msg, config);
        };

        // Intercept console.warn
        console.warn = function () {
            if (shouldSuppress(arguments)) {
                return; // Suppress
            }
            self._originalConsole.warn.apply(console, arguments);
        };

        // Intercept console.error
        console.error = function () {
            if (shouldSuppress(arguments)) {
                return; // Suppress
            }
            // Call the original console.error
            self._originalConsole.error.apply(console, arguments);
        };

        // Handle uncaught errors
        window.addEventListener('error', function (event) {
            // Check if we should ignore this error
            if (configComponent.shouldIgnore(event, config)) {
                // Don't prevent default completely here as browser might need to see it,
                // but we skip our reporting logic.
                // To fully suppress, one might use event.preventDefault() and return true
                return;
            }

            const message = event.message || 'Unknown error';
            const source = event.filename || 'Unknown source';

            loggerComponent.reportError(message, 'Error', source);
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', function (event) {
            // Check if we should ignore this error
            if (configComponent.shouldIgnore(event, config)) {
                return;
            }

            const message = event.reason ? (event.reason.message || String(event.reason)) : 'Promise rejected';

            loggerComponent.reportError(message, 'Promise');
        });
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ESHandlers', ESHandlers);
}

window.ESHandlers = ESHandlers;
