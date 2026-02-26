/**
 * Search UI Renderer Error Component
 * Handles the display of error messages and empty states.
 */
const SearchUIRendererError = {};

/**
 * Initialize the module
 */
SearchUIRendererError.init = function () {
    console.log('SearchUIRendererError initialized');
};

/**
 * Helper to display an error message in a specific container.
 * @param {string} message - The error message.
 * @param {string} elementId - The ID of the container.
 * @param {Function} loadingCallback - Optional callback to hide loading.
 */
SearchUIRendererError.showError = function (message, elementId, loadingCallback) {
    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = `<p class="error">${message}</p>`;
    } else {
        console.error(`Error container #${elementId} not found. Error: ${message}`);
        if (window.ErrorNotifier) ErrorNotifier.showError(message);
    }

    // Ensure loader is hidden using helper if provided, otherwise assume caller handles it
    if (loadingCallback) loadingCallback(false, elementId);
    // If no callback, we can try to find the fallback
    else if (window.SearchUIRendererLoading) SearchUIRendererLoading.showLoading(false, elementId);
};

/**
 * Display no results message
 * @param {string} searchTerm - The search term
 * @param {string} error - Optional error message
 */
SearchUIRendererError.displayNoResults = function (searchTerm, error) {
    if (window.SearchDisplay && typeof SearchDisplay.displayNoResults === 'function') {
        SearchDisplay.displayNoResults(searchTerm, error);
    } else {
        // Basic fallback
        const container = document.getElementById('discovery-results-container') || document.getElementById('search-results');
        if (container) {
            container.innerHTML = `
                <div class="no-results">
                    <h3>No results found</h3>
                    <p>No matches found for "${searchTerm}".</p>
                    ${error ? `<p class="error-details">${error}</p>` : ''}
                </div>`;
        }
    }
};

/**
 * Display error message with retry capability
 * @param {string} searchTerm - The search term
 * @param {Error} error - The error object
 * @param {Function} retryCallback - Function to call on retry
 */
SearchUIRendererError.displayError = function (searchTerm, error, retryCallback) {
    if (window.SearchDisplay && typeof SearchDisplay.displayError === 'function') {
        // SearchDisplay.displayError signature might need the container ID or callback
        // Based on analysis, it takes specific args. We'll pass standard ones.
        SearchDisplay.displayError(searchTerm, error, 'discovery-results-container', retryCallback);
    } else {
        const container = document.getElementById('discovery-results-container') || document.getElementById('search-results');
        if (container) {
            container.innerHTML = `
                <div class="error">
                    <h3>Search Error</h3>
                    <p>${error.message || 'An unknown error occurred.'}</p>
                    ${retryCallback ? '<button id="retry-search-btn">Retry</button>' : ''}
                </div>
             `;
            if (retryCallback) {
                const btn = container.querySelector('#retry-search-btn');
                if (btn) btn.onclick = retryCallback;
            }
        }
    }
};

window.SearchUIRendererError = SearchUIRendererError;
