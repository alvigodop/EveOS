/**
 * Search Coordinator Managed Component
 * Handles searching against managed content (Wikipedia/Fandom).
 */
const SearchCoordinatorManaged = {};

/**
 * Initialize the module
 */
SearchCoordinatorManaged.init = function () {
    console.log('SearchCoordinatorManaged initialized');
};

/**
 * Search managed Wikipedia entries
 */
SearchCoordinatorManaged.searchManagedWikipedia = async function (entries, query, options) {
    if (window.SearchWikipedia && typeof SearchWikipedia.searchManagedWikipedia === 'function') {
        const loadingCallback = window.SearchUIRenderer ? SearchUIRenderer.showLoading.bind(SearchUIRenderer) : null;
        return SearchWikipedia.searchManagedWikipedia(entries, query, options, loadingCallback);
    }
    console.error('SearchCoordinatorManaged: SearchWikipedia module not available');
    return [];
};

/**
 * Search managed Fandom domains
 */
SearchCoordinatorManaged.searchManagedFandom = async function (domains, query, options) {
    if (window.FandomSearch && typeof FandomSearch.searchManagedFandom === 'function') {
        const loadingCallback = window.SearchUIRenderer ? SearchUIRenderer.showLoading.bind(SearchUIRenderer) : null;
        return FandomSearch.searchManagedFandom(domains, query, options, loadingCallback);
    }
    console.error('SearchCoordinatorManaged: FandomSearch module not available');
    return [];
};

window.SearchCoordinatorManaged = SearchCoordinatorManaged;
