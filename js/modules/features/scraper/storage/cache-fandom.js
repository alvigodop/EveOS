/**
 * Cache Fandom Module
 * 
 * Handles cache operations specific to Fandom wikis.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.CacheFandom) {
        const CacheFandom = {
            version: '1.0.0',
            _initialized: false,

            _resolveContext: function () {
                const context = window.currentCategoryCtx || window.StorageManager?.categoryContext || '';
                return String(context || '').trim() || null;
            },

            _resolveWikiName: function (domain) {
                const normalizedDomain = String(domain || '').trim().toLowerCase();
                const sources = []
                    .concat(Array.isArray(window.WikiManager?.fandomDomains) ? window.WikiManager.fandomDomains : [])
                    .concat(Array.isArray(window.fandomDomains) ? window.fandomDomains : []);
                const match = sources.find(function (entry) {
                    return String(entry?.domain || '').trim().toLowerCase() === normalizedDomain;
                });
                return String(match?.name || domain || '').trim();
            },

            _syncWikiDataStore: function (wikiDataStore) {
                if (!wikiDataStore || typeof wikiDataStore !== 'object') return;
                if (!wikiDataStore.searchResults || typeof wikiDataStore.searchResults !== 'object') {
                    wikiDataStore.searchResults = {};
                }
                if (window.CacheCore) {
                    CacheCore.wikiDataStore = wikiDataStore;
                }
                if (window.WikiManager) {
                    WikiManager.fandomCacheStore = wikiDataStore;
                }
            },

            _loadFandomCacheIndex: async function (context) {
                if (!window.StorageManager || typeof StorageManager.loadDataAsync !== 'function') {
                    return {};
                }
                try {
                    return await StorageManager.loadDataAsync('fandomCacheIndex', {}, context) || {};
                } catch (error) {
                    console.warn('CacheFandom: Failed to load fandom cache index', error);
                    return {};
                }
            },

            _loadDomainCacheSnapshot: async function (domain, context) {
                const normalizedDomain = String(domain || '').trim();
                if (!normalizedDomain) {
                    return {
                        wikiDataStore: { searchResults: {} },
                        domainData: null,
                        indexEntry: null
                    };
                }

                if (window.CacheManager && typeof CacheManager.init === 'function') {
                    await CacheManager.init(context);
                } else if (window.CacheCore && typeof CacheCore.init === 'function') {
                    await CacheCore.init(context);
                }

                let wikiDataStore = (window.CacheCore && CacheCore.wikiDataStore && typeof CacheCore.wikiDataStore === 'object')
                    ? CacheCore.wikiDataStore
                    : { searchResults: {} };
                if (!wikiDataStore.searchResults || typeof wikiDataStore.searchResults !== 'object') {
                    wikiDataStore.searchResults = {};
                }

                let domainData = wikiDataStore.searchResults[normalizedDomain] || null;

                if (!domainData && window.StorageManager && typeof StorageManager.loadHeavyData === 'function') {
                    try {
                        wikiDataStore = await StorageManager.loadHeavyData('wikiDataStore', { searchResults: {} }, context) || { searchResults: {} };
                        if (!wikiDataStore.searchResults || typeof wikiDataStore.searchResults !== 'object') {
                            wikiDataStore.searchResults = {};
                        }
                        this._syncWikiDataStore(wikiDataStore);
                        domainData = wikiDataStore.searchResults[normalizedDomain] || null;
                    } catch (error) {
                        console.warn(`CacheFandom: Failed to load wikiDataStore for ${normalizedDomain}`, error);
                    }
                }

                const cacheIndex = await this._loadFandomCacheIndex(context);
                const indexEntry = cacheIndex && typeof cacheIndex === 'object'
                    ? cacheIndex[normalizedDomain] || null
                    : null;

                return { wikiDataStore, domainData, indexEntry };
            },

            init: function () {
                this._initialized = true;
                return this;
            },

            /**
             * Clear cache for a specific Fandom domain
             * @param {string} domain - The domain to clear cache for
             */
            clearFandomCache: function (domain) {
                console.log(`CacheFandom: Clearing Fandom cache for ${domain}`);

                // Ensure Core is initialized to get latest data
                if (window.CacheCore) {
                    CacheCore.init();
                } else {
                    console.error('CacheCore not available');
                    return;
                }

                // 1. Clear Visible Cache (Result Lists)
                if (CacheCore.wikiDataStore.searchResults && CacheCore.wikiDataStore.searchResults[domain]) {
                    delete CacheCore.wikiDataStore.searchResults[domain];
                    CacheCore.saveWikiDataStore();
                }

                if (window.StorageManager && typeof StorageManager.loadDataAsync === 'function' && typeof StorageManager.saveData === 'function') {
                    StorageManager.loadDataAsync('fandomCacheIndex', {}, null)
                        .then(function (cacheIndex) {
                            if (!cacheIndex || typeof cacheIndex !== 'object' || !cacheIndex[domain]) return;
                            delete cacheIndex[domain];
                            StorageManager.saveData('fandomCacheIndex', cacheIndex);
                        })
                        .catch(function (error) {
                            console.warn('CacheFandom: Failed to update fandom cache index', error);
                        });
                }

                // 2. Clear Internal Fast-Search Cache (API Responses)
                // Keys usually look like: cache_fandom_wikiname.fandom.com_search_query
                CacheCore.clearInternalApiCache(`fandom_${domain}_`);
                CacheCore.clearInternalApiCache('fandom_managed_search_');

                if (window.CacheUI) {
                    CacheUI.showToast(`Cache for ${domain} cleared!`, 'success');
                }

                // Fix for stale UI: Refresh WikiManager's cache store
                if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                    WikiManager.refreshCacheStores();
                }

                // Notify that cache was cleared so UI can be updated
                if (typeof window.updateFandomDomainList === 'function') {
                    window.updateFandomDomainList();
                }
            },

            /**
             * View cached data for a Fandom domain
             * @param {string} domain - The domain to view cache for
             */
            viewFandomCachedData: async function (domain) {
                const normalizedDomain = String(domain || '').trim();
                if (!normalizedDomain) return;

                const context = this._resolveContext();
                const { domainData, indexEntry } = await this._loadDomainCacheSnapshot(normalizedDomain, context);

                if (!domainData && !indexEntry) {
                    if (window.CacheUI) {
                        CacheUI.showToast('No cached data. Click "Reload Status" to fetch content.', 'warning');
                    }
                    return;
                }

                const wikiName = this._resolveWikiName(normalizedDomain);
                let displayData = domainData;

                if (!displayData && indexEntry) {
                    displayData = {
                        lastUpdate: indexEntry.updatedAt || indexEntry.lastUpdate || null,
                        summary: {
                            domain: normalizedDomain,
                            itemCount: Number(indexEntry.itemCount || 0),
                            sampleTitles: Array.isArray(indexEntry.sampleTitles) ? indexEntry.sampleTitles.slice(0, 10) : []
                        }
                    };
                } else if (displayData && indexEntry && !displayData.lastUpdate) {
                    displayData = {
                        ...displayData,
                        lastUpdate: indexEntry.updatedAt || indexEntry.lastUpdate || null
                    };
                }

                if (window.CacheUI) {
                    CacheUI.displayCachedData(displayData, wikiName);
                }
            },

            /**
             * Clear all Fandom domain caches
             */
            clearAllFandomCaches: async function () {
                // Deep clean all fandom internal caches (ALWAYS Perform this)
                // This clears internal API response caches, independent of saved domains
                // Matches pattern: cache_fandom_...
                if (window.CacheCore) {
                    CacheCore.wikiDataStore.searchResults = {};
                    CacheCore.clearInternalApiCache('fandom_');
                    CacheCore.saveWikiDataStore();
                }

                if (window.StorageManager && typeof StorageManager.saveData === 'function') {
                    StorageManager.saveData('fandomCacheIndex', {});
                }

                if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                    WikiManager.refreshCacheStores();
                }

                if (typeof window.updateFandomDomainList === 'function') {
                    window.updateFandomDomainList();
                } else if (window.WikiManager && typeof WikiManager.renderFandomDomainList === 'function') {
                    WikiManager.renderFandomDomainList();
                }

                if (window.CacheUI) {
                    CacheUI.showToast('All Fandom caches cleared successfully!', 'success');
                }
            },

            /**
             * Update all Fandom caches
             * @returns {Promise<number>} Number of updated domains
             */
            updateAllFandomDomains: async function (progressCallback) {
                const domains = (window.WikiManager && window.WikiManager.fandomDomains) || window.fandomDomains || [];
                let updatedCount = 0;
                let currentItem = 0;
                const totalItems = domains.length;

                if (totalItems === 0) return 0;

                for (const domain of domains) {
                    currentItem++;
                    const domainName = domain.domain || domain;

                    try {
                        if (progressCallback) {
                            progressCallback(currentItem, totalItems, domain.name || domainName);
                        }

                        // Use WikiManager's update function if available
                        if (window.WikiManager && typeof WikiManager.updateFandomCacheStatus === 'function') {
                            await WikiManager.updateFandomCacheStatus(domainName);
                            updatedCount++;
                        } else if (window.WikiManager && typeof WikiManager.reloadFandomStatus === 'function') {
                            await WikiManager.reloadFandomStatus(domainName);
                            updatedCount++;
                        } else {
                            console.warn(`No update function available for Fandom domain: ${domainName}`);
                        }
                    } catch (error) {
                        console.error(`Error updating Fandom cache for ${domainName}:`, error);
                    }
                }

                return updatedCount;
            }
        };

        window.CacheFandom = CacheFandom;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('CacheFandom', CacheFandom);
        }
    }
})();
