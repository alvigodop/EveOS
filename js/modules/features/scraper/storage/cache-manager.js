/**
 * Cache Manager Module (Facade)
 * 
 * Provides a unified interface for all cache operations by delegating to specialized modules:
 * - CacheCore: Storage and basic operations
 * - CacheUI: Visualization and notifications
 * - CacheFandom: Fandom-specific operations
 * - CacheWikipedia: Wikipedia-specific operations
 * 
 * @version 1.1.0
 */

(function () {
    'use strict';

    if (!window.CacheManager || window.CacheManager._isStub) {
        const CacheManager = {
            version: '1.1.0',
            _initialized: false,

            // Delegate properties to Core
            get wikiDataStore() { return window.CacheCore ? CacheCore.wikiDataStore : { searchResults: {} }; },
            set wikiDataStore(val) { if (window.CacheCore) CacheCore.wikiDataStore = val; },

            get wikiCacheStore() { return window.CacheCore ? CacheCore.wikiCacheStore : {}; },
            set wikiCacheStore(val) { if (window.CacheCore) CacheCore.wikiCacheStore = val; },

            init: function () {
                console.log('Initializing CacheManager facade');

                // Initialize sub-modules
                if (window.CacheCore && !CacheCore._initialized) CacheCore.init();
                if (window.CacheUI && !CacheUI._initialized) CacheUI.init();
                if (window.CacheFandom && !CacheFandom._initialized) CacheFandom.init();
                if (window.CacheWikipedia && !CacheWikipedia._initialized) CacheWikipedia.init();

                this._initialized = true;
                return this;
            },

            // --- Core Delegation ---

            get: function (key, defaultValue) {
                if (window.CacheCore) return CacheCore.get(key, defaultValue);
                return defaultValue;
            },

            set: function (key, value, ttl) {
                if (window.CacheCore) return CacheCore.set(key, value, ttl);
                return false;
            },

            clear: function () {
                if (window.CacheCore) return CacheCore.clear();
                return false;
            },

            logSearch: function (searchTerm, source) {
                if (window.CacheCore) return CacheCore.logSearch(searchTerm, source);
                return false;
            },

            _clearInternalApiCache: function (prefix) {
                if (window.CacheCore) CacheCore.clearInternalApiCache(prefix);
            },

            // --- UI Delegation ---

            viewCache: function () {
                if (window.CacheUI) CacheUI.viewCache();
            },

            displayCachedData: function (data, title) {
                if (window.CacheUI) CacheUI.displayCachedData(data, title);
            },

            _showToast: function (message, type) {
                if (window.CacheUI) CacheUI.showToast(message, type);
            },

            // --- Fandom Delegation ---

            clearFandomCache: function (domain) {
                if (window.CacheFandom) CacheFandom.clearFandomCache(domain);
            },

            viewFandomCachedData: function (domain) {
                if (window.CacheFandom) CacheFandom.viewFandomCachedData(domain);
            },

            clearAllFandomCaches: async function () {
                if (window.CacheFandom) await CacheFandom.clearAllFandomCaches();
            },

            // --- Wikipedia Delegation ---

            clearWikiCache: function (title) {
                if (window.CacheWikipedia) CacheWikipedia.clearWikiCache(title);
            },

            viewWikiCachedData: function (title) {
                if (window.CacheWikipedia) CacheWikipedia.viewWikiCachedData(title);
            },

            clearAllWikiCaches: async function () {
                if (window.CacheWikipedia) await CacheWikipedia.clearAllWikiCaches();
            },

            getWikipediaEntryData: async function (title) {
                if (window.CacheWikipedia) return await CacheWikipedia.getWikipediaEntryData(title);
                return null;
            },

            updateWikipediaEntryData: async function (title, data) {
                if (window.CacheWikipedia) return await CacheWikipedia.updateWikipediaEntryData(title, data);
                return false;
            },

            // --- Generic SearchManager Integration Helpers ---
            // These just map to core get/set but with standardized names

            getGeneric: async function (key) {
                return this.get(key, null);
            },

            updateGeneric: async function (key, data, ttl) {
                return this.set(key, data, ttl);
            },

            // --- Orchestration ---

            clearCache: function () {
                // Legacy "Clear All" button handler
                if (confirm('Are you sure you want to clear ALL caches? This will remove all cached Fandom and Wikipedia data.')) {
                    if (window.CacheCore) {
                        // Clear stores
                        CacheCore.wikiDataStore = { searchResults: {} };
                        CacheCore.saveWikiDataStore();

                        CacheCore.wikiCacheStore = {};
                        CacheCore.saveWikiCacheStore();

                        // Deep clean
                        CacheCore.clear(); // This clears all `cache_` prefixed items

                        console.log('CacheManager: Deep clean completed via CacheCore');
                    }

                    // Update UI
                    if (typeof window.updateFandomDomainList === 'function') window.updateFandomDomainList();
                    if (typeof window.updateWikiEntryList === 'function') window.updateWikiEntryList();

                    alert('All caches cleared successfully!');
                }
            },

            updateAllCaches: async function () {
                // Confirm with user
                let confirmed = false;
                if (window.PopupManager && typeof PopupManager.showConfirmation === 'function') {
                    confirmed = await PopupManager.showConfirmation('Are you sure you want to update all caches? This may take some time.');
                } else {
                    confirmed = confirm('Are you sure you want to update all caches? This may take some time.');
                }

                if (!confirmed) return { cancelled: true };

                if (window.CacheUI) CacheUI.showToast('Starting bulk update...', 'info');

                let fandomUpdated = 0;
                let wikiUpdated = 0;

                // Orchestrate Fandom updates
                if (window.CacheFandom) {
                    fandomUpdated = await CacheFandom.updateAllFandomDomains((current, total, name) => {
                        if (window.CacheUI) CacheUI.showToast(`Updating Fandom ${current}/${total}: ${name}`, 'info');
                    });
                }

                // Orchestrate Wikipedia updates
                if (window.CacheWikipedia) {
                    wikiUpdated = await CacheWikipedia.updateAllWikiEntries((current, total, name) => {
                        if (window.CacheUI) CacheUI.showToast(`Updating Wikipedia ${current}/${total}: ${name}`, 'info');
                    });
                }

                // Update UI lists
                if (window.WikiManager) {
                    if (typeof WikiManager.renderFandomDomainList === 'function') WikiManager.renderFandomDomainList(true);
                    if (typeof WikiManager.renderWikiEntryList === 'function') WikiManager.renderWikiEntryList(true);
                }

                const successMessage = `Updated ${fandomUpdated} Fandom domains and ${wikiUpdated} Wikipedia entries.`;
                console.log(`CacheManager: ${successMessage}`);
                if (window.CacheUI) CacheUI.showToast(successMessage, 'success');

                // If available, get totals for return value
                const totalFandom = (window.WikiManager && WikiManager.fandomDomains) ? WikiManager.fandomDomains.length : 0;
                const totalWiki = (window.WikiManager && WikiManager.wikiEntries) ? WikiManager.wikiEntries.length : 0;

                return { fandomUpdated, wikiUpdated, totalFandom, totalWiki };
            }
        };

        // Register globally
        window.CacheManager = CacheManager;
        window.updateAllCaches = function () { return CacheManager.updateAllCaches(); };

        if (window.ModuleRegistry) {
            ModuleRegistry.register('CacheManager', CacheManager);
        }

        // Auto-init
        if (window.forceModuleInit) {
            CacheManager.init();
        }
    }
})();