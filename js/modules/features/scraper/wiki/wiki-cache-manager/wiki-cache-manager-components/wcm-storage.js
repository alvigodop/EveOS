/**
 * Wiki Cache Manager Storage Component
 * Handles cache clearing and storage management operations.
 */
const WikiCacheManagerStorage = {};

/**
 * Initialize the module
 */
WikiCacheManagerStorage.init = function () {
    console.log('WikiCacheManagerStorage initialized');
};

/**
 * Clear cache for a Fandom domain
 * @param {string} domain 
 */
WikiCacheManagerStorage.clearFandomCache = function (domain) {
    console.log(`WikiCacheManager: Clearing cache for Fandom domain: ${domain}`);
    try {
        if (window.CacheManager && typeof CacheManager.clearFandomCache === 'function') {
            CacheManager.clearFandomCache(domain);
        } else {
            // Fallback
            if (confirm(`Are you sure you want to clear the cache for ${domain}?`)) {
                const wikiDataStore = JSON.parse(localStorage.getItem('wikiDataStore')) || { searchResults: {} };
                delete wikiDataStore.searchResults[domain];
                localStorage.setItem('wikiDataStore', JSON.stringify(wikiDataStore));

                if (window.WikiManager) WikiManager._notify(`Cache for ${domain} cleared successfully!`, 'success');

                if (window.WikiManager) WikiManager._notify(`Cache for ${domain} cleared successfully!`, 'success');

                // Fix for stale UI: Refresh WikiManager's cache store
                if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                    WikiManager.refreshCacheStores();
                }

                // Update UI if necessary
                if (typeof window.updateFandomDomainList === 'function') {
                    window.updateFandomDomainList();
                } else if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
                    WikiManager.renderFandomDomainList(true);
                }
            }
        }
    } catch (error) {
        console.error(`Error clearing cache for ${domain}:`, error);
        if (window.WikiManager) WikiManager._notify(`Error clearing cache: ${error.message}`, 'error');
    }
};

/**
 * Clear cache for a Wikipedia entry
 * @param {string} title 
 */
WikiCacheManagerStorage.clearWikiCache = function (title) {
    console.log(`WikiCacheManager: Clearing cache for Wikipedia entry: ${title}`);
    try {
        if (window.CacheManager && typeof CacheManager.clearWikiCache === 'function') {
            CacheManager.clearWikiCache(title);
        } else {
            // Fallback
            if (confirm(`Are you sure you want to clear the cache for "${title}"?`)) {
                const wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore')) || {};
                delete wikiCacheStore[title];
                localStorage.setItem('wikiCacheStore', JSON.stringify(wikiCacheStore));

                if (window.WikiManager) WikiManager._notify(`Cache for "${title}" cleared successfully!`, 'success');

                // Fix for stale UI: Refresh WikiManager's cache store
                if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                    WikiManager.refreshCacheStores();
                }

                if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                    WikiManager.renderWikiEntryList(true);
                }
            }
        }
    } catch (error) {
        console.error(`Error clearing cache for ${title}:`, error);
        if (window.WikiManager) WikiManager._notify(`Error clearing cache: ${error.message}`, 'error');
    }
};

/**
 * Clear all Fandom caches
 */
WikiCacheManagerStorage.clearAllFandomCaches = function () {
    if (window.WikiManager) {
        WikiManager.fandomCacheStore.searchResults = {};
        localStorage.setItem('wikiDataStore', JSON.stringify(WikiManager.fandomCacheStore));
        alert('All Fandom caches cleared');
    }
};

/**
 * Clear all Wikipedia caches
 */
WikiCacheManagerStorage.clearAllWikiCaches = function () {
    if (window.WikiManager) {
        WikiManager.wikiCacheStore = {};
        localStorage.setItem('wikiCacheStore', JSON.stringify(WikiManager.wikiCacheStore));
        alert('All Wikipedia caches cleared');
    }
};

window.WikiCacheManagerStorage = WikiCacheManagerStorage;
