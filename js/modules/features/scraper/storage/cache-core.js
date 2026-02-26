/**
 * Cache Core Module (Facade)
 * 
 * Handles low-level storage operations, cache key management, and data stores.
 * 
 * Delegates to:
 * - CCMaintenance: Cache pruning, clearing, and search logging
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.CacheCore) {
        const CacheCore = {
            version: '1.1.0-facade',
            _initialized: false,

            // In-memory references to data stores
            wikiDataStore: { searchResults: {} },
            wikiCacheStore: {},

            /**
             * Initialize the cache core
             */
            init: function () {
                console.log('Initializing CacheCore');
                if (window.StorageManager) {
                    this.wikiDataStore = StorageManager.loadData('wikiDataStore', { searchResults: {} });
                    this.wikiCacheStore = StorageManager.loadData('wikiCacheStore', {});
                } else {
                    try {
                        this.wikiDataStore = JSON.parse(localStorage.getItem('wikiDataStore')) || { searchResults: {} };
                        this.wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore')) || {};
                    } catch (e) {
                        this.wikiDataStore = { searchResults: {} };
                        this.wikiCacheStore = {};
                    }
                }

                if (window.CCMaintenance && typeof CCMaintenance.init === 'function') {
                    CCMaintenance.init();
                    CCMaintenance._initialized = true;
                }

                this._initialized = true;
                return this;
            },

            /**
             * Get data from cache (general purpose)
             * @param {string} key - The key to look up
             * @param {any} defaultValue - Default value to return if key not found
             * @returns {any} - The cached value or default value
             */
            get: function (key, defaultValue) {
                try {
                    const cacheKey = 'cache_' + key;
                    const cacheData = window.StorageManager ? StorageManager.loadData(cacheKey, null) : JSON.parse(localStorage.getItem(cacheKey));
                    if (!cacheData) return defaultValue;

                    // Check if cache has expired
                    if (cacheData.expires && cacheData.expires < Date.now()) {
                        if (window.StorageManager) {
                            StorageManager.deleteData(cacheKey);
                        } else {
                            localStorage.removeItem(cacheKey);
                        }
                        return defaultValue;
                    }

                    return cacheData.value;
                } catch (e) {
                    console.error('Error in CacheCore.get:', e);
                    return defaultValue;
                }
            },

            /**
             * Set data in cache (general purpose)
             * @param {string} key - The key to store under
             * @param {any} value - The value to cache
             * @param {number} ttl - Time to live in milliseconds (optional)
             * @returns {boolean} - True if successful
             */
            set: function (key, value, ttl) {
                try {
                    const cacheKey = 'cache_' + key;
                    const cacheData = {
                        value: value,
                        timestamp: Date.now(),
                        expires: ttl ? Date.now() + ttl : null
                    };

                    if (window.StorageManager) {
                        StorageManager.saveData(cacheKey, cacheData);
                    } else {
                        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                    }
                    return true;
                } catch (e) {
                    console.error('Error in CacheCore.set:', e);
                    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                        console.warn('LocalStorage quota exceeded. Pruning cache...');
                        this.pruneCache();
                    }
                    return false;
                }
            },

            /**
             * Prune old cache items - delegates to CCMaintenance
             */
            pruneCache: function () {
                if (window.CCMaintenance) {
                    CCMaintenance.pruneCache();
                } else {
                    // Fallback implementation
                    const cacheItems = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('cache_')) {
                            cacheItems.push(key);
                        }
                    }
                    const itemsToRemove = Math.max(1, Math.floor(cacheItems.length * 0.2));
                    for (let i = 0; i < itemsToRemove; i++) {
                        localStorage.removeItem(cacheItems[i]);
                    }
                }
            },

            /**
             * Clear all cache entries - delegates to CCMaintenance
             * @returns {boolean} - True if successful
             */
            clear: function () {
                console.log('CacheCore.clear called');
                if (window.CCMaintenance) {
                    return CCMaintenance.clearAllCache();
                }
                // Fallback
                try {
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('cache_')) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(key => localStorage.removeItem(key));
                    return true;
                } catch (e) {
                    return false;
                }
            },

            /**
             * Log search terms - delegates to CCMaintenance
             * @param {string} searchTerm - The search term to log
             * @param {string} source - The source of the search
             * @returns {boolean} - True if successful
             */
            logSearch: function (searchTerm, source) {
                if (window.CCMaintenance) {
                    return CCMaintenance.logSearch(searchTerm, source);
                }
                return false;
            },

            /**
             * Save the Wiki Data Store to localStorage
             */
            saveWikiDataStore: function () {
                if (window.StorageManager) {
                    return StorageManager.saveData('wikiDataStore', this.wikiDataStore);
                }
                try {
                    localStorage.setItem('wikiDataStore', JSON.stringify(this.wikiDataStore));
                    return true;
                } catch (e) {
                    console.error('Error saving wikiDataStore:', e);
                    return false;
                }
            },

            /**
             * Save the Wiki Cache Store to localStorage
             */
            saveWikiCacheStore: function () {
                if (window.StorageManager) {
                    return StorageManager.saveData('wikiCacheStore', this.wikiCacheStore);
                }
                try {
                    localStorage.setItem('wikiCacheStore', JSON.stringify(this.wikiCacheStore));
                    return true;
                } catch (e) {
                    console.error('Error saving wikiCacheStore:', e);
                    return false;
                }
            },

            /**
             * Clear internal API caches - delegates to CCMaintenance
             * @param {string} prefix - The prefix to match
             */
            clearInternalApiCache: function (prefix) {
                if (window.CCMaintenance) {
                    CCMaintenance.clearPrefixedCache(prefix);
                }
            }
        };

        window.CacheCore = CacheCore;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('CacheCore', CacheCore);
        }
    }
})();
