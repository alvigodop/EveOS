/**
 * Search Coordinator Module (Facade)
 * 
 * Handles high-level search coordination, delegation, and caching checks.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - SearchCoordinatorFlow: Search orchestration
 * - SearchCoordinatorManaged: Managed content delegation
 * - SearchCoordinatorCache: Cache utility
 * 
 * @version 1.1.0-facade
 */

window.SearchCoordinator = window.SearchCoordinator || {};

/**
 * Initialize the module
 */
SearchCoordinator.init = function () {
    console.log('SearchCoordinator initializing...');

    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('SearchCoordinator', SearchCoordinator);
    }

    // Initialize sub-modules
    if (window.SearchCoordinatorFlow && typeof SearchCoordinatorFlow.init === 'function') {
        SearchCoordinatorFlow.init();
    }
    if (window.SearchCoordinatorManaged && typeof SearchCoordinatorManaged.init === 'function') {
        SearchCoordinatorManaged.init();
    }
    if (window.SearchCoordinatorCache && typeof SearchCoordinatorCache.init === 'function') {
        SearchCoordinatorCache.init();
    }
};

/**
 * Perform search across managed content (Wikis/Entries)
 */
SearchCoordinator.performContentSearch = async function (query, source, options = null, redisplayOnly = false) {
    if (window.SearchCoordinatorFlow) {
        return SearchCoordinatorFlow.performContentSearch(query, source, options, redisplayOnly);
    }
};

/**
 * Retry last search
 */
SearchCoordinator.retryLastSearch = function (forceLive = false) {
    if (window.SearchCoordinatorFlow) {
        return SearchCoordinatorFlow.retryLastSearch(forceLive);
    }
};

/**
 * Search managed Wikipedia (Private/Internal delegation)
 */
SearchCoordinator._searchManagedWikipedia = async function (entries, query, options) {
    if (window.SearchCoordinatorManaged) {
        return SearchCoordinatorManaged.searchManagedWikipedia(entries, query, options);
    }
    return [];
};

/**
 * Search managed Fandom (Private/Internal delegation)
 */
SearchCoordinator._searchManagedFandom = async function (domains, query, options) {
    if (window.SearchCoordinatorManaged) {
        return SearchCoordinatorManaged.searchManagedFandom(domains, query, options);
    }
    return [];
};

/**
 * Check if a search term is effectively cached for a domain
 */
SearchCoordinator.isEffectivelyCached = function (domain, searchTerm) {
    if (window.SearchCoordinatorCache) {
        return SearchCoordinatorCache.isEffectivelyCached(domain, searchTerm);
    }
    return false;
};

// Auto-init logic if needed, or rely on ResourceLoader call
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // Optional self-init
}
