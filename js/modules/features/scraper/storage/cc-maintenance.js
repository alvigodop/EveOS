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
            this.emergencyPrune(0.2); // Default to 20%
        },

        /**
         * Emergency prune of the cache
         * @param {number} percentage - Percentage of items to remove (0.0 to 1.0)
         */
        emergencyPrune: function (percentage = 0.5) {
            console.warn(`CCMaintenance: Emergency prune triggered (target: ${Math.round(percentage * 100)}%)...`);
            try {
                // 1. Identify all cache-related keys
                const allKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.includes('cache_') || key.includes('browserEmulator_'))) {
                        allKeys.push({
                            key: key,
                            size: localStorage.getItem(key).length,
                            isHighValue: key.includes('browserEmulator_')
                        });
                    }
                }

                if (allKeys.length === 0) return;

                // 2. Sort by size (descending) so we free up the most space first
                allKeys.sort((a, b) => b.size - a.size);

                // 3. Remove the top percentage of items
                const itemsToRemove = Math.max(1, Math.floor(allKeys.length * percentage));
                let spaceFreed = 0;

                for (let i = 0; i < itemsToRemove; i++) {
                    const item = allKeys[i];
                    spaceFreed += item.size;
                    localStorage.removeItem(item.key);
                }

                console.log(`CCMaintenance: Emergency prune complete. Removed ${itemsToRemove} items, freed approximately ${(spaceFreed / 1024).toFixed(2)} KB.`);
            } catch (e) {
                console.error('CCMaintenance: Error during emergency prune:', e);
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
