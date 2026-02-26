/**
 * Search Handlers Module (Facade)
 * 
 * Handles UI event interactions for search.
 * Delegates to:
 * - SHInput: Input handling and specific search button
 * - SHTabs: Main global search routing
 * 
 * @version 1.1.0-facade
 */

window.SearchHandlers = window.SearchHandlers || {};
const SearchHandlers = window.SearchHandlers;

SearchHandlers.init = function () {
    console.log('SearchHandlers initialized');
    if (window.SHInput && typeof SHInput.init === 'function') {
        SHInput.init();
        SHInput._initialized = true;
    }
    if (window.SHTabs && typeof SHTabs.init === 'function') {
        SHTabs.init();
        SHTabs._initialized = true;
    }
    this._initialized = true;
    return this;
};

SearchHandlers.handleSearchButtonClick = function (event) {
    if (window.SHInput) {
        SHInput.handleSearchButtonClick(event);
    } else {
        console.error('SearchHandlers: SHInput not loaded');
        // Fallback or legacy check if strictly required, but mostly modularized now
    }
};

SearchHandlers._handleSearchSubmit = function (e) {
    if (window.SHInput) {
        SHInput.handleSearchSubmit(e);
    } else {
        console.error('SearchHandlers: SHInput not loaded');
        if (e) e.preventDefault();
    }
};

SearchHandlers._handleMainSearch = function () {
    if (window.SHTabs) {
        SHTabs.handleMainSearch();
    } else {
        console.error('SearchHandlers: SHTabs not loaded');
    }
};

// Register
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('SearchHandlers', SearchHandlers);
}

// Auto-initialize
if (SearchHandlers.init) SearchHandlers.init();
