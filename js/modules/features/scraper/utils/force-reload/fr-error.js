/**
 * Force Reload - Error Handling Module
 * 
 * Handles error interception and suppression of known non-critical errors.
 */

(function () {
    'use strict';

    // Create ForceReload object if it doesn't exist
    window.ForceReload = window.ForceReload || {};

    /**
     * Setup error interception for known errors
     * This prevents errors from bubbling up to the browser's error handling
     */
    ForceReload.setupErrorInterception = function () {
        // Save the original error event handler
        const originalErrorHandler = window.onerror;

        // Create a new error handler that intercepts known errors
        window.onerror = function (message, source, lineno, colno, error) {
            // List of error patterns to suppress
            const suppressPatterns = [
                'modules.forEach is not a function',
                'modules.forEach',
                'is not a function',
                'module registration',
                'Cannot read properties of undefined',
                'undefined is not iterable'
            ];

            // Check if the error message contains any of the patterns to suppress
            let shouldSuppress = false;
            if (message) {
                for (let i = 0; i < suppressPatterns.length; i++) {
                    if (message.toString().indexOf(suppressPatterns[i]) !== -1) {
                        shouldSuppress = true;
                        console.warn('Suppressed error:', message);
                        break;
                    }
                }
            }

            // If we should suppress this error, return true to indicate it's handled
            if (shouldSuppress) {
                return true;
            }

            // Otherwise, pass it to the original handler if it exists
            if (typeof originalErrorHandler === 'function') {
                return originalErrorHandler(message, source, lineno, colno, error);
            }

            // If no original handler, return false to allow default browser handling
            return false;
        };

        console.log('ForceReload: Error interception setup complete');
        return this;
    };

    console.log('ForceReload: Error module loaded');
})();
