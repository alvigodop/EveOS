/**
 * Module Error Interceptor - Global Handler Component
 * 
 * Handles window.onerror global error interception.
 */

(function () {
    'use strict';

    if (!window.ModuleErrorInterceptor) window.ModuleErrorInterceptor = {};
    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Install a global error handler specifically for module registration errors
     */
    ModuleErrorInterceptor.installGlobalHandler = function () {
        // Save original handler if it exists
        if (!this._originalOnError) {
            this._originalOnError = window.onerror;
        }

        const self = this;

        // Override the global error handler
        window.onerror = function (message, source, lineno, colno, error) {
            // Check if this is a module registration error
            if (message && typeof message === 'string') {
                // List of module registration error patterns to intercept
                const patterns = [
                    'Error during module registration',
                    'modules.forEach is not a function',
                    'Cannot read properties of undefined',
                    'modules.forEach',
                    'is not a function',
                    'undefined is not iterable'
                ];

                // Check if the message matches any of our patterns
                const shouldIntercept = patterns.some(pattern => message.includes(pattern));

                if (shouldIntercept) {
                    self._interceptedErrors++;
                    self._lastErrorMessage = message;
                    console.warn('ModuleErrorInterceptor: Intercepted module error:', message);

                    // Start active interception to catch dialog elements
                    self._activeInterception = true;

                    // Schedule end of active interception after a delay
                    setTimeout(() => {
                        self._activeInterception = false;
                    }, 500);

                    // Show error in the enhanced Search Monitor
                    if (window.UI && typeof UI.showErrorInMonitor === 'function') {
                        UI.showErrorInMonitor(message);
                    } else {
                        console.warn('UI.showErrorInMonitor not available, cannot display error in monitor');
                    }

                    // Hide any existing error dialogs
                    if (typeof self.hideErrorDialogs === 'function') {
                        self.hideErrorDialogs();
                    }

                    // Make sure any blocking error display is hidden
                    const errorDisplay = document.getElementById('errorDisplay');
                    if (errorDisplay) {
                        errorDisplay.style.display = 'none';
                        errorDisplay.textContent = '';
                    }

                    // Hide the "This page says" dialog in Chrome/Firefox
                    if (typeof self.blockNativeErrorDialogs === 'function') {
                        self.blockNativeErrorDialogs();
                    }

                    // Force a small UI refresh to clear any pending dialogs
                    if (document.body) {
                        document.body.style.opacity = '0.99';
                        setTimeout(() => { document.body.style.opacity = '1'; }, 10);
                    }

                    return true; // Indicate we've handled this error
                }
            }

            // For other errors, pass to original handler if available
            if (typeof self._originalOnError === 'function') {
                return self._originalOnError(message, source, lineno, colno, error);
            }

            // Otherwise, allow default handling
            return false;
        };
    };

    // Register submodule
    ModuleErrorInterceptor.globalHandler = true;
    console.log('Module Error Interceptor - Global Handler loaded');

})();
