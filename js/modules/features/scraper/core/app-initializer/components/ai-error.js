/**
 * App Initializer - Error Handling
 * Handles initialization error UI and retry logic
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const AIError = {
        version: '1.0.0',

        init: function () {
            console.log('AIError initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Show initialization error with retry option
         * @param {string} message - The error message
         * @param {Function} retryCallback - Callback to retry initialization
         */
        showInitializationError: function (message, retryCallback) {
            // Hide loading UI if it exists
            const loading = document.getElementById('loading');
            if (loading) {
                const loadingText = loading.querySelector('p');
                if (loadingText) {
                    loadingText.textContent = `Error: ${message}`;
                    loadingText.style.color = 'red';
                }
            }

            // Create and show error message
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.innerHTML = `
                <h2>Initialization Error</h2>
                <p>${message}</p>
                <button id="retryInit">Retry</button>
            `;

            // Append error message to the container
            const container = document.querySelector('.container');
            if (container) {
                container.appendChild(errorMessage);

                // Add retry button handler
                const retryButton = document.getElementById('retryInit');
                if (retryButton) {
                    retryButton.addEventListener('click', () => {
                        // Remove error message
                        errorMessage.remove();

                        // Reset loading text
                        if (loading && loading.querySelector('p')) {
                            loading.querySelector('p').textContent = 'Loading...';
                            loading.querySelector('p').style.color = '';
                        }

                        // Retry initialization
                        if (typeof retryCallback === 'function') {
                            setTimeout(() => retryCallback(), 500);
                        }
                    });
                }
            }
        },

        /**
         * Clear any existing error UI
         */
        clearError: function () {
            const errorMessage = document.querySelector('.error-message');
            if (errorMessage) {
                errorMessage.remove();
            }

            // Reset loading text
            const loading = document.getElementById('loading');
            if (loading && loading.querySelector('p')) {
                loading.querySelector('p').textContent = 'Loading...';
                loading.querySelector('p').style.color = '';
            }
        }
    };

    // Expose globally
    window.AIError = AIError;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('AIError', AIError);
    }
})();
