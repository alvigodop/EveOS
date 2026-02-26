/**
 * Wiki Cache Manager Module (Facade)
 * 
 * Handles cache management operations (view, clear, reload) for Wiki entries and Fandom domains.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - WikiCacheManagerView: View cached data
 * - WikiCacheManagerStorage: Clear cache operations
 * - WikiCacheManagerUpdate: Reload/Update status
 * 
 * @version 1.1.0-facade
 */

const WikiCacheManager = {
    version: '1.1.0-facade',
    _initialized: false,

    /**
     * Initialize WikiCacheManager
     */
    init: function () {
        if (this._initialized) return;

        console.log('Initializing WikiCacheManager (Facade)');

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('WikiCacheManager', WikiCacheManager);
        }

        // Initialize sub-modules
        if (window.WikiCacheManagerView && typeof WikiCacheManagerView.init === 'function') {
            WikiCacheManagerView.init();
        }
        if (window.WikiCacheManagerStorage && typeof WikiCacheManagerStorage.init === 'function') {
            WikiCacheManagerStorage.init();
        }
        if (window.WikiCacheManagerUpdate && typeof WikiCacheManagerUpdate.init === 'function') {
            WikiCacheManagerUpdate.init();
        }

        this._initialized = true;
    },

    /**
     * View cached data for a Fandom domain
     * @param {string} domain 
     */
    viewFandomCachedData: function (domain) {
        if (window.WikiCacheManagerView) {
            WikiCacheManagerView.viewFandomCachedData(domain);
        }
    },

    /**
     * View cached data for a Wikipedia entry
     * @param {string} title 
     */
    viewWikiCachedData: function (title) {
        if (window.WikiCacheManagerView) {
            WikiCacheManagerView.viewWikiCachedData(title);
        }
    },

    /**
     * Clear cache for a Fandom domain
     * @param {string} domain 
     */
    clearFandomCache: function (domain) {
        if (window.WikiCacheManagerStorage) {
            WikiCacheManagerStorage.clearFandomCache(domain);
        }
    },

    /**
     * Clear cache for a Wikipedia entry
     * @param {string} title 
     */
    clearWikiCache: function (title) {
        if (window.WikiCacheManagerStorage) {
            WikiCacheManagerStorage.clearWikiCache(title);
        }
    },

    /**
     * Clear all Fandom caches
     */
    clearAllFandomCaches: function () {
        if (window.WikiCacheManagerStorage) {
            WikiCacheManagerStorage.clearAllFandomCaches();
        }
    },

    /**
     * Clear all Wikipedia caches
     */
    clearAllWikiCaches: function () {
        if (window.WikiCacheManagerStorage) {
            WikiCacheManagerStorage.clearAllWikiCaches();
        }
    },

    /**
     * Reload status for a specific Fandom domain
     * @param {string} domain 
     */
    reloadFandomWikiStatus: async function (domain, btnElement) {
        if (window.WikiCacheManagerUpdate) {
            return await WikiCacheManagerUpdate.reloadFandomWikiStatus(domain, btnElement);
        }
    },

    /**
     * Reload status for all Fandom domains
     */
    reloadAllFandomWikiStatus: async function () {
        if (window.WikiCacheManagerUpdate) {
            return await WikiCacheManagerUpdate.reloadAllFandomWikiStatus();
        }
    },

    /**
     * Reload status for a specific Wikipedia entry
     * @param {string} title 
     */
    reloadWikiEntryStatus: async function (title, btnElement) {
        if (window.WikiCacheManagerUpdate) {
            return await WikiCacheManagerUpdate.reloadWikiEntryStatus(title, btnElement);
        }
    },

    /**
     * Reload status for all Wikipedia entries
     */
    reloadAllWikiStatus: async function () {
        if (window.WikiCacheManagerUpdate) {
            return await WikiCacheManagerUpdate.reloadAllWikiStatus();
        }
    }
};

// Expose to window
window.WikiCacheManager = WikiCacheManager;

// Register with ModuleRegistry
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('WikiCacheManager', WikiCacheManager);
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WikiCacheManager.init());
} else {
    WikiCacheManager.init();
}
