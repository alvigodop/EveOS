/**
 * Search UI Renderer Loading Component
 * Handles the display of loading indicators.
 */
const SearchUIRendererLoading = {};

/**
 * Initialize the module
 */
SearchUIRendererLoading.init = function () {
    console.log('SearchUIRendererLoading initialized');
};

/**
 * Helper to show/hide a loading indicator.
 * @param {boolean} show - Whether to show or hide.
 * @param {string} elementId - The ID of the container where the loader might be.
 * @param {string} [message=''] - Message to display while loading.
 * @param {Object} [stats={}] - Optional stats to display.
 */
SearchUIRendererLoading.showLoading = function (show, elementId, message = '', stats = {}) {
    // Redirect to unified UI loading indicator
    if (window.UI && typeof UI.updateLoadingIndicatorEnhanced === 'function') {
        UI.updateLoadingIndicatorEnhanced(show, message, stats);
    } else if (window.UI && typeof UI.updateLoadingIndicator === 'function') {
        // Fallback for older UI versions
        UI.updateLoadingIndicator(show, 'loading-indicator', message);
    }

    // specific container handling (cleanup)
    const container = document.getElementById(elementId);
    if (container) {
        const oldLoader = container.querySelector('.search-manager-loader');
        if (oldLoader) oldLoader.remove();
    }
};

window.SearchUIRendererLoading = SearchUIRendererLoading;
