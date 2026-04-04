/**
 * Cache Wikipedia Module (Facade)
 * 
 * Handles cache operations specific to Wikipedia entries.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - CWStorage: Direct storage operations.
 * - CWView: UI view operations.
 * - CWSync: Batch update/sync operations.
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.CacheWikipedia) {
        const CacheWikipedia = {
            version: '1.1.0-facade',
            _initialized: false,

            init: function () {
                this._initialized = true;
                return this;
            },

            /**
             * Get cached data for a specific Wikipedia entry title.
             * Delegates to CWStorage
             */
            getWikipediaEntryData: async function (title) {
                if (window.CWStorage) {
                    return await CWStorage.getWikipediaEntryData(title);
                }
                console.error('CacheWikipedia: CWStorage not loaded');
                return null;
            },

            /**
             * Update cached data for a specific Wikipedia entry title.
             * Delegates to CWStorage
             */
            updateWikipediaEntryData: async function (title, data) {
                if (window.CWStorage) {
                    return await CWStorage.updateWikipediaEntryData(title, data);
                }
                console.error('CacheWikipedia: CWStorage not loaded');
                return false;
            },

            /**
             * Clear cache for a Wikipedia entry
             * Delegates to CWStorage and CWView
             */
            clearWikiCache: function (title) {
                if (window.CWStorage) {
                    const cleared = CWStorage.clearWikiCache(title);

                    if (window.CWView) {
                        CWView.notifyCacheClear(title, cleared);
                    }

                    if (cleared) {
                        // Fix for stale UI: Refresh WikiManager's cache store from storage
                        if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                            WikiManager.refreshCacheStores();
                        }

                        if (typeof window.updateWikiEntryList === 'function') {
                            window.updateWikiEntryList();
                        }
                    }
                } else {
                    console.error('CacheWikipedia: CWStorage not loaded');
                }
            },

            /**
             * View cached data for a Wikipedia entry
             * Delegates to CWView
             */
            viewWikiCachedData: function (title) {
                if (window.CWView) {
                    CWView.viewWikiCachedData(title);
                } else {
                    console.error('CacheWikipedia: CWView not loaded');
                }
            },

            /**
             * Clear all Wikipedia entry caches
             * Delegates to CWStorage and CWView
             */
            clearAllWikiCaches: async function () {
                // Use WikiManager.wikiEntries if available
                const entries = (window.WikiManager && window.WikiManager.wikiEntries) || window.wikiEntries || [];

                if (window.CWStorage) {
                    const success = CWStorage.clearAllWikiCaches(entries);

                    if (window.CWView) {
                        CWView.notifyClearAll(success);
                    }

                    if (success) {
                        // Fix for stale UI: Refresh WikiManager's cache store
                        if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                            WikiManager.refreshCacheStores();
                        }

                        if (typeof window.updateWikiEntryList === 'function') {
                            window.updateWikiEntryList();
                        } else if (window.WikiManager && typeof WikiManager.renderWikiEntryList === 'function') {
                            WikiManager.renderWikiEntryList();
                        }
                    }
                } else {
                    console.error('CacheWikipedia: CWStorage not loaded');
                }
            },

            /**
             * Update all Wikipedia entry caches
             * Delegates to CWSync
             */
            updateAllWikiEntries: async function (progressCallback) {
                if (window.CWSync && window.CWStorage) {
                    return await CWSync.updateAllWikiEntries(
                        this.updateWikipediaEntryData.bind(this),
                        progressCallback
                    );
                }
                console.error('CacheWikipedia: CWSync or CWStorage not loaded');
                return 0;
            }
        };

        window.CacheWikipedia = CacheWikipedia;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('CacheWikipedia', CacheWikipedia);
        }
    }
})();
