/**
 * ErrorDOM Module
 * Handles DOM updates for fixing error displays.
 */
const ErrorDOM = {};

ErrorDOM.init = function () {
    console.log('ErrorDOM initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('ErrorDOM', ErrorDOM);
    }
    this.setupMonitoringInterval();
};

/**
 * Fix any errors displayed in the UI
 */
ErrorDOM.fixDisplayedErrors = function () {
    try {
        // Find and fix any elements displaying [object Object]
        const errorElements = document.querySelectorAll('.error-display, .log-display, .module-error, .loading-errors');

        errorElements.forEach(element => {
            if (element.textContent && element.textContent.includes('[object Object]')) {
                // Try to get any data attributes that might contain error info
                const errorData = element.dataset.error;

                // Replace [object Object] with better formatted error message
                let content = element.textContent;

                if (errorData) {
                    try {
                        const parsedError = JSON.parse(errorData);
                        content = `Error in ${parsedError.module || 'unknown'}: ${parsedError.message || 'Unknown error'}`;
                    } catch (e) {
                        // Just use the data attribute as is
                        content = errorData;
                    }
                } else {
                    // Just replace [object Object] with a better message
                    content = content.replace(/\[object Object\]/g, '(Error details hidden)');
                }

                element.textContent = content;
            }
        });

        // Special handling for the loading errors array display
        const loadingErrorsDisplay = document.getElementById('loadingErrors');
        if (loadingErrorsDisplay && window.moduleLoadingErrors) {
            let content = '';

            if (window.moduleLoadingErrors.length === 0) {
                content = 'No loading errors';
            } else {
                content = window.moduleLoadingErrors.toString();
            }

            loadingErrorsDisplay.textContent = content;
        }
    } catch (e) {
        console.error('Error fixing displayed errors:', e);
    }
};

/**
 * Set up a monitoring interval to continuously check and fix error displays
 */
ErrorDOM.setupMonitoringInterval = function () {
    // Run every 2 seconds to fix any newly displayed errors
    setInterval(() => {
        this.fixDisplayedErrors();
    }, 2000);

    console.log('Error monitoring interval set up');
};

// Export method for manual triggering
window.ErrorDOM = ErrorDOM;
