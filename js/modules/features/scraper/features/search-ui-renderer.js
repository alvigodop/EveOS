/**
 * Search UI Renderer Module (Facade)
 * 
 * Handles rendering of search results, loading states, and error messages.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - SearchUIRendererLoading: Loading indicators
 * - SearchUIRendererError: Error handling
 * - SearchUIRendererWiki: Wikipedia rendering
 * - SearchUIRendererFandom: Fandom rendering
 * 
 * @version 1.1.0-facade
 */

const SearchUIRenderer = {};

/**
 * Initialize the renderer
 */
SearchUIRenderer.init = function () {
    console.log('SearchUIRenderer initializing...');

    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('SearchUIRenderer', SearchUIRenderer);
    }

    // Initialize sub-modules
    if (window.SearchUIRendererLoading && typeof SearchUIRendererLoading.init === 'function') {
        SearchUIRendererLoading.init();
    }
    if (window.SearchUIRendererError && typeof SearchUIRendererError.init === 'function') {
        SearchUIRendererError.init();
    }
    if (window.SearchUIRendererWiki && typeof SearchUIRendererWiki.init === 'function') {
        SearchUIRendererWiki.init();
    }
    if (window.SearchUIRendererFandom && typeof SearchUIRendererFandom.init === 'function') {
        SearchUIRendererFandom.init();
    }
};

/**
 * Helper to show/hide a loading indicator.
 */
SearchUIRenderer.showLoading = function (show, elementId, message = '', stats = {}) {
    if (window.SearchUIRendererLoading) {
        SearchUIRendererLoading.showLoading(show, elementId, message, stats);
    }
};

/**
 * Helper to display an error message in a specific container.
 */
SearchUIRenderer.showError = function (message, elementId) {
    if (window.SearchUIRendererError) {
        SearchUIRendererError.showError(message, elementId, this.showLoading.bind(this));
    }
};

/**
 * Display search results in the results container
 */
SearchUIRenderer.displaySearchResults = function (results, searchTerm, searchMethod, containerSelector) {
    if (window.SearchDisplay && typeof SearchDisplay.displaySearchResults === 'function') {
        SearchDisplay.displaySearchResults(results, searchTerm, searchMethod);
    } else if (window.ResultDisplay && typeof ResultDisplay.displayResults === 'function') {
        // Fallback or alternative if SearchDisplay isn't the primary
        ResultDisplay.displayResults(results, containerSelector || '#search-results', {
            query: searchTerm,
            layout: 'grid',
            mode: 'discovery'
        });
    } else {
        console.warn('SearchUIRenderer: No display module available to render results.');
    }
};

/**
 * Display no results message
 */
SearchUIRenderer.displayNoResults = function (searchTerm, error) {
    if (window.SearchUIRendererError) {
        SearchUIRendererError.displayNoResults(searchTerm, error);
    }
};

/**
 * Display error message with retry capability
 */
SearchUIRenderer.displayError = function (searchTerm, error, retryCallback) {
    if (window.SearchUIRendererError) {
        SearchUIRendererError.displayError(searchTerm, error, retryCallback);
    }
};

/**
 * Render Wikipedia discovery results
 */
SearchUIRenderer.renderWikipediaDiscoveryResults = function (results, listElement, handlers = {}) {
    if (window.SearchUIRendererWiki) {
        SearchUIRendererWiki.renderWikipediaDiscoveryResults(results, listElement, handlers);
    }
};

/**
 * Render Fandom search results
 */
SearchUIRenderer.renderFandomResults = function (results, container, query, handlers = {}) {
    if (window.SearchUIRendererFandom) {
        SearchUIRendererFandom.renderFandomResults(results, container, query, handlers);
    }
};

window.SearchUIRenderer = SearchUIRenderer;
