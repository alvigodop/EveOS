/**
 * Google Scraper UI Module (Facade)
 * 
 * Delegates to:
 * - GSUToggles: Toggle management
 * - GSURendering: Google-style results rendering
 * - GSUDisplay: Standard results display
 * 
 * @version 1.1.0-facade
 */

window.GoogleScraperUI = window.GoogleScraperUI || {};
const GoogleScraperUI = window.GoogleScraperUI;

GoogleScraperUI.init = function () {
    if (window.GSUToggles) {
        if (typeof GSUToggles.init === 'function') GSUToggles.init();
        GSUToggles._initialized = true;
    }
    if (window.GSURendering) {
        if (typeof GSURendering.init === 'function') GSURendering.init();
        GSURendering._initialized = true;
    }
    if (window.GSUDisplay) {
        if (typeof GSUDisplay.init === 'function') GSUDisplay.init();
        GSUDisplay._initialized = true;
    }
    this._initialized = true;
    return this;
};

GoogleScraperUI.initSearchToggles = function () {
    if (window.GSUToggles) {
        GSUToggles.initSearchToggles();
        // Copy searchOptions ref
        this.searchOptions = GSUToggles.searchOptions;
    } else {
        console.warn('GoogleScraperUI: GSUToggles module missing');
    }
};

GoogleScraperUI.renderGoogleStyleResults = function (results, searchTerm, container) {
    if (window.GSURendering) {
        GSURendering.renderGoogleStyleResults(results, searchTerm, container);
    }
};

GoogleScraperUI.displayResults = function (results, containerId = 'search-results', query = '') {
    if (window.GSUDisplay) {
        GSUDisplay.displayResults(results, containerId, query);
    }
};

console.log('GoogleScraperUI module loaded');
