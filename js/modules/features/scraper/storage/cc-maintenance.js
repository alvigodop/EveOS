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
         * Targets specific items to free up space based on size and importance
         * @param {number} targetFreePercentage - Target percentage of storage to free up (0.0 to 1.0)
         */
        emergencyPrune: function (targetFreePercentage = 0.3) {
            console.warn(`CCMaintenance: Emergency prune triggered (Target: free up ~${Math.round(targetFreePercentage * 100)}% space)...`);
            try {
                // 1. Identify and measure all scrappable keys
                const allKeys = [];
                let currentPoolSize = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const val = localStorage.getItem(key);
                    if (key && val) {
                        const size = (key.length + val.length);
                        currentPoolSize += size;
                        if (key.includes('cache_') || key.includes('browserEmulator_') || key.includes('wiki') || key.includes('apiSearchCachePool')) {
                            allKeys.push({
                                key: key,
                                size: size,
                                isHighValue: key.includes('link') || key.includes('config')
                            });
                        }
                    }
                }

                if (allKeys.length === 0) {
                    console.log('CCMaintenance: No prunable cache keys found.');
                    return;
                }

                // 2. Sort by size (descending) - target largest non-high-value items first
                allKeys.sort((a, b) => b.size - a.size);

                // 3. Clear target amount
                const targetBytesToFree = currentPoolSize * targetFreePercentage;
                let actualBytesFreed = 0;
                let itemsRemoved = 0;

                for (const item of allKeys) {
                    if (actualBytesFreed >= targetBytesToFree) break;
                    
                    localStorage.removeItem(item.key);
                    actualBytesFreed += item.size;
                    itemsRemoved++;
                }

                console.log(`CCMaintenance: Emergency prune complete. Removed ${itemsRemoved} items, freed approximately ${(actualBytesFreed / 1024).toFixed(2)} KB.`);
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
