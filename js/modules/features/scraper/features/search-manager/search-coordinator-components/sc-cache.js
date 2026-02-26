/**
 * Search Coordinator Cache Component
 * Handles cache checking for search results.
 */
const SearchCoordinatorCache = {};

/**
 * Initialize the module
 */
SearchCoordinatorCache.init = function () {
    console.log('SearchCoordinatorCache initialized');
};

/**
 * Check if a search term is effectively cached for a domain
 */
SearchCoordinatorCache.isEffectivelyCached = function (domain, searchTerm) {
    if (window.CacheManager) {
        if (CacheManager.wikiCacheStore && CacheManager.wikiCacheStore.entryResults &&
            CacheManager.wikiCacheStore.entryResults[domain]) {
            const entryResults = CacheManager.wikiCacheStore.entryResults[domain];
            if (entryResults[searchTerm.toLowerCase()]) return true;
            const cachedTerms = Object.keys(entryResults).filter(key => key !== 'lastUpdate');
            for (const cachedTerm of cachedTerms) {
                if (searchTerm.toLowerCase().includes(cachedTerm.toLowerCase()) ||
                    cachedTerm.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return true;
                }
            }
        }
        if (CacheManager.wikiDataStore && CacheManager.wikiDataStore.searchResults &&
            CacheManager.wikiDataStore.searchResults[domain]) {
            const wikiResults = CacheManager.wikiDataStore.searchResults[domain];
            if (wikiResults[searchTerm.toLowerCase()]) return true;
            const cachedTerms = Object.keys(wikiResults).filter(key => key !== 'lastUpdate');
            for (const cachedTerm of cachedTerms) {
                if (searchTerm.toLowerCase().includes(cachedTerm.toLowerCase()) ||
                    cachedTerm.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return true;
                }
            }
        }
    }

    // Fallback to localStorage
    try {
        const wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore') || '{}');
        if (wikiCacheStore.entryResults && wikiCacheStore.entryResults[domain]) {
            const entryResults = wikiCacheStore.entryResults[domain];
            if (entryResults[searchTerm.toLowerCase()]) return true;
        }
        const wikiDataStore = JSON.parse(localStorage.getItem('wikiDataStore') || '{}');
        if (wikiDataStore.searchResults && wikiDataStore.searchResults[domain]) {
            const wikiResults = wikiDataStore.searchResults[domain];
            if (wikiResults[searchTerm.toLowerCase()]) return true;
        }
    } catch (e) {
        console.warn('SearchCoordinatorCache: Error checking cache:', e);
    }
    return false;
};

window.SearchCoordinatorCache = SearchCoordinatorCache;
