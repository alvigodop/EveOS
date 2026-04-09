/**
 * Cache Core - Maintenance
 * Handles cache maintenance operations: pruning, clearing, and search logging
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CCMaintenance = {
        version: '1.0.0',

        init: function () {
            console.log('CCMaintenance component initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Prune old cache items to free up space
         */
        pruneCache: function () {
            try {
                // Determine prefix to look for
                let prefix = 'cache_';
                if (window.StorageManager && StorageManager.categoryContext) {
                    const contextPrefix = StorageManager.categoryContext.toLowerCase().replace(/\s+/g, '_');
                    prefix = `${contextPrefix}_${prefix}`;
                }

                // Simple strategy: Remove oldest 20% of cache_ prefixed items
                const cacheItems = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        cacheItems.push(key);
                    }
                }

                if (cacheItems.length === 0) return;

                const itemsToRemove = Math.max(1, Math.floor(cacheItems.length * 0.2));
                for (let i = 0; i < itemsToRemove; i++) {
                    localStorage.removeItem(cacheItems[i]);
                }
                console.log(`CCMaintenance: Pruned ${itemsToRemove} cache items (prefix: ${prefix}).`);
            } catch (e) {
                console.error('CCMaintenance: Error pruning cache:', e);
            }
        },

        /**
         * Clear all cache entries (general purpose)
         * @returns {boolean} - True if successful
         */
        clearAllCache: function () {
            console.log('CCMaintenance: Clearing all cache entries');
            try {
                // Determine prefix to look for
                let prefix = 'cache_';
                if (window.StorageManager && StorageManager.categoryContext) {
                    const contextPrefix = StorageManager.categoryContext.toLowerCase().replace(/\s+/g, '_');
                    prefix = `${contextPrefix}_${prefix}`;
                }

                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        keysToRemove.push(key);
                    }
                }

                keysToRemove.forEach(key => localStorage.removeItem(key));
                console.log(`CCMaintenance: Removed ${keysToRemove.length} cache entries (prefix: ${prefix}).`);
                return true;
            } catch (e) {
                console.error('CCMaintenance: Error clearing cache:', e);
                return false;
            }
        },

        /**
         * Clear internal API caches matching a specific prefix
         * @param {string} prefix - The prefix to match (after "cache_")
         */
        clearPrefixedCache: function (prefix) {
            if (!prefix) return;

            let fullPrefix = 'cache_' + prefix;

            // Handle StorageManager prefixing
            if (window.StorageManager && StorageManager.categoryContext) {
                const contextPrefix = StorageManager.categoryContext.toLowerCase().replace(/\s+/g, '_');
                fullPrefix = `${contextPrefix}_${fullPrefix}`;
            }

            const keysToRemove = [];

            console.log(`CCMaintenance: Scanning for keys starting with "${fullPrefix}"...`);

            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(fullPrefix)) {
                        keysToRemove.push(key);
                    }
                }

                if (keysToRemove.length > 0) {
                    keysToRemove.forEach(key => localStorage.removeItem(key));
                    console.log(`CCMaintenance: Removed ${keysToRemove.length} cache keys for prefix "${prefix}" (full: ${fullPrefix})`);
                } else {
                    console.log(`CCMaintenance: No cache keys found for prefix "${prefix}" (full: ${fullPrefix})`);
                }
            } catch (e) {
                console.error('CCMaintenance: Error clearing prefixed cache:', e);
            }

            if (window.IDBStore && typeof IDBStore.keys === 'function' && typeof IDBStore.remove === 'function') {
                Promise.resolve()
                    .then(() => IDBStore.keys())
                    .then((keys) => {
                        const idbKeysToRemove = (Array.isArray(keys) ? keys : []).filter((key) => {
                            return String(key || '').startsWith(fullPrefix);
                        });
                        if (!idbKeysToRemove.length) return 0;
                        return Promise.all(idbKeysToRemove.map((key) => IDBStore.remove(key))).then(() => idbKeysToRemove.length);
                    })
                    .then((removedCount) => {
                        if (removedCount > 0) {
                            console.log(`CCMaintenance: Removed ${removedCount} IndexedDB cache keys for prefix "${prefix}" (full: ${fullPrefix})`);
                        }
                    })
                    .catch((error) => {
                        console.error('CCMaintenance: Error clearing prefixed IndexedDB cache:', error);
                    });
            }
        },

        /**
         * Log search terms for analytics
         * @param {string} searchTerm - The search term to log
         * @param {string} source - The source of the search
         * @returns {boolean} - True if successful
         */
        logSearch: function (searchTerm, source) {
            if (!searchTerm) return false;

            try {
                let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

                searchHistory.push({
                    term: searchTerm,
                    source: source || 'general',
                    timestamp: Date.now()
                });

                // Keep only the last 100 searches
                if (searchHistory.length > 100) {
                    searchHistory = searchHistory.slice(-100);
                }

                localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
                return true;
            } catch (e) {
                console.error('CCMaintenance: Error logging search:', e);
                return false;
            }
        },

        /**
         * Get search history
         * @returns {Array} - Array of search history entries
         */
        getSearchHistory: function () {
            try {
                return JSON.parse(localStorage.getItem('searchHistory') || '[]');
            } catch (e) {
                console.error('CCMaintenance: Error getting search history:', e);
                return [];
            }
        }
    };

    // Expose globally
    window.CCMaintenance = CCMaintenance;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('CCMaintenance', CCMaintenance);
    }
})();
