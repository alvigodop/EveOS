/**
 * Search Enhancer Module (Facade)
 * 
 * Handles search result enhancement and Google search delegation.
 * Delegates to:
 * - SEGoogle: Google search operations
 * - SEWikiEnhance: Wikipedia enhancements
 * 
 * @version 1.1.0-facade
 */

window.SearchEnhancer = window.SearchEnhancer || {};
const SearchEnhancer = window.SearchEnhancer;

SearchEnhancer.init = function () {
    console.log('SearchEnhancer initialized');
    if (window.SEGoogle && typeof SEGoogle.init === 'function') {
        SEGoogle.init();
        SEGoogle._initialized = true;
    }
    if (window.SEWikiEnhance && typeof SEWikiEnhance.init === 'function') {
        SEWikiEnhance.init();
        SEWikiEnhance._initialized = true;
    }
    this._initialized = true;
    return this;
};

SearchEnhancer._performGoogleSearch = function (query, container) {
    if (window.SEGoogle) {
        SEGoogle.performGoogleSearch(query, container);
    } else {
        console.error('SearchEnhancer: SEGoogle not loaded');
        // Simple fallback error display
        container.innerHTML = '<div class="error">Google Search unavailable (Module Missing)</div>';
    }
};

SearchEnhancer.enhanceResultsWithWebData = async function (results, searchTerm) {
    if (window.SEWikiEnhance) {
        return SEWikiEnhance.enhanceResultsWithWebData(results, searchTerm);
    }
    console.warn('SearchEnhancer: SEWikiEnhance not loaded, skipping enhancement');
    return results;
};

SearchEnhancer._displayBasicResults = function (results, container, query) {
    // This was previously in SearchEnhancer, optionally delegate to SearchDisplay or SEGoogle local helper
    // Assuming SearchDisplay exists elsewhere or handled by consumers.
    // For now, delegate to SEGoogle if it implements fallback, or generic SearchDisplay
    if (window.SearchDisplay && typeof SearchDisplay.displayBasicResults === 'function') {
        SearchDisplay.displayBasicResults(results, container, query);
    }
};

// Register
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('SearchEnhancer', SearchEnhancer);
}

// Auto-init
if (SearchEnhancer.init) SearchEnhancer.init();
