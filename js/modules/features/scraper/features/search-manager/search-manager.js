/**
 * Search Manager Module (Facade)
 * 
 * Manages search functionality across different sources
 * Handles search input, execution, and result processing
 * 
 * Refactored to delegate to:
 * - SearchCoordinator (Core logic)
 * - SearchHandlers (UI Events)
 * - SearchEnhancer (Data Enhancement)
 * 
 * @version 1.2.0
 */

// Create SearchManager namespace if it doesn't exist
window.SearchManager = window.SearchManager || {};
const SearchManager = window.SearchManager;

// Add version and installation status flag
SearchManager.version = '1.2.0';
SearchManager.installed = true;
SearchManager._functional = true;
SearchManager._initialized = false;
SearchManager._lastQueryOptions = {}; // Store last search options
SearchManager._lastSearchResults = []; // Store last results

/**
 * Initialize the SearchManager module
 * @returns {Object} - This instance for chaining
 */
SearchManager.init = function () {
    console.log('SearchManager: Initializing (Facade Mode)');

    // Initialize UI Handler
    if (window.SearchUIHandler && typeof SearchUIHandler.init === 'function') {
        SearchUIHandler.init();
    } else {
        console.warn('SearchManager: SearchUIHandler not found');
    }

    this._initialized = true;
    console.log('SearchManager: Initialization complete');
    return this;
};

/**
 * Delegated Methods
 */

SearchManager._handleMainSearch = function () {
    if (window.SearchHandlers) SearchHandlers._handleMainSearch();
};

SearchManager.search = function (query, source) {
    return this.performContentSearch(query, source || 'all');
};

SearchManager.performSearch = function (query, source) {
    return this.search(query, source);
};

SearchManager.retryLastSearch = function (forceLive = false) {
    if (window.SearchCoordinator) return SearchCoordinator.retryLastSearch(forceLive);
    return null;
};

// Expose globally for UI buttons
window.retryLastSearch = function (forceLive) {
    return SearchManager.retryLastSearch(forceLive);
};

SearchManager.performContentSearch = async function (query, source, options = null, redisplayOnly = false) {
    if (window.SearchCoordinator) {
        return SearchCoordinator.performContentSearch(query, source, options, redisplayOnly);
    }
    console.error("SearchManager: SearchCoordinator not loaded");
};

// Kept for compatibility but delegated
SearchManager._getSearchOptions = function (source) {
    if (window.SearchOptions && typeof SearchOptions.getOptions === 'function') {
        return SearchOptions.getOptions(source);
    }
    return {};
};

SearchManager._searchManagedWikipedia = async function (entries, query, options) {
    if (window.SearchCoordinator) return SearchCoordinator._searchManagedWikipedia(entries, query, options);
    return [];
};

SearchManager._searchManagedFandom = async function (domains, query, options) {
    if (window.SearchCoordinator) return SearchCoordinator._searchManagedFandom(domains, query, options);
    return [];
};

SearchManager.handleSearchButtonClick = function (event) {
    if (window.SearchHandlers) SearchHandlers.handleSearchButtonClick(event);
};

SearchManager._getGlobalSearchOptions = function () {
    if (window.SearchOptions && typeof SearchOptions.getGlobalOptions === 'function') {
        return SearchOptions.getGlobalOptions();
    }
    return { useGoogleSearch: true, useFandomSearch: true, prioritizeGoogleSearch: true };
};

SearchManager.searchFandomCommunities = function (searchTerm, options) {
    if (window.SearchDiscoveryBroker && typeof SearchDiscoveryBroker.searchFandomCommunities === 'function') {
        SearchDiscoveryBroker.searchFandomCommunities(searchTerm, options);
    } else {
        console.error('SearchManager: SearchDiscoveryBroker not available');
    }
};

SearchManager._handleSearchSubmit = function (e) {
    if (window.SearchHandlers) SearchHandlers._handleSearchSubmit(e);
};

SearchManager._performGoogleSearch = function (query, container) {
    if (window.SearchEnhancer) SearchEnhancer._performGoogleSearch(query, container);
};

SearchManager._displayBasicResults = function (results, container, query) {
    if (window.SearchEnhancer) SearchEnhancer._displayBasicResults(results, container, query);
};

SearchManager.fetchWikipediaThumbnails = async function (results) {
    // Originally delegated to DiscoveryBroker or ThumbnailLoader
    if (window.SearchDiscoveryBroker && typeof SearchDiscoveryBroker.fetchWikipediaThumbnails === 'function') {
        return SearchDiscoveryBroker.fetchWikipediaThumbnails(results);
    }
    if (window.ThumbnailLoader && typeof ThumbnailLoader.fetchWikipediaThumbnails === 'function') {
        return ThumbnailLoader.fetchWikipediaThumbnails(results);
    }
    return results;
};

window.loadFandomThumbnails = function (results, containerSelector) {
    if (window.ThumbnailLoader && typeof ThumbnailLoader.loadFandomThumbnails === 'function') {
        return ThumbnailLoader.loadFandomThumbnails(results, containerSelector);
    }
};

SearchManager.enhanceResultsWithWebData = async function (results, searchTerm) {
    if (window.SearchEnhancer) return SearchEnhancer.enhanceResultsWithWebData(results, searchTerm);
    return results;
};

SearchManager.isEffectivelyCached = function (domain, searchTerm) {
    if (window.SearchCoordinator) return SearchCoordinator.isEffectivelyCached(domain, searchTerm);
    return false;
};

SearchManager.discoverWikipediaArticles = function (query) {
    if (window.SearchDiscoveryBroker && typeof SearchDiscoveryBroker.discoverWikipediaArticles === 'function') {
        SearchDiscoveryBroker.discoverWikipediaArticles(query);
    }
};