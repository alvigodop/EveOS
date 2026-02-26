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

                // 2. Clear Internal Fast-Search Cache (API Responses)
                // Keys usually look like: cache_fandom_wikiname.fandom.com_search_query
                CacheCore.clearInternalApiCache(`fandom_${domain}_`);

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
            viewFandomCachedData: function (domain) {
                // Ensure Core is initialized
                if (window.CacheCore) CacheCore.init();

                // Ensure structure exists
                if (!CacheCore.wikiDataStore.searchResults) {
                    CacheCore.wikiDataStore.searchResults = {};
                }

                const domainData = CacheCore.wikiDataStore.searchResults[domain];

                if (!domainData) {
                    if (window.CacheUI) {
                        CacheUI.showToast('No cached data. Click "Reload Status" to fetch content.', 'warning');
                    }
                    return;
                }

                // Find the wiki name if available
                let wikiName = domain;
                if (window.fandomDomains) {
                    const wiki = window.fandomDomains.find(w => w.domain === domain);
                    if (wiki) {
                        wikiName = wiki.name || domain;
                    }
                }

                if (window.CacheUI) {
                    CacheUI.displayCachedData(domainData, wikiName);
                }
            },

            /**
             * Clear all Fandom domain caches
             */
            clearAllFandomCaches: async function () {
                // Use WikiManager.fandomDomains if available, fallback to global or empty
                const domains = (window.WikiManager && window.WikiManager.fandomDomains) || window.fandomDomains || [];

                if (domains && domains.length > 0) {
                    domains.forEach(domain => {
                        const domainKey = domain.domain || domain; // Handle object or string
                        if (CacheCore.wikiDataStore.searchResults) {
                            delete CacheCore.wikiDataStore.searchResults[domainKey];
                        }
                    });
                }

                // Deep clean all fandom internal caches (ALWAYS Perform this)
                // This clears internal API response caches, independent of saved domains
                // Matches pattern: cache_fandom_...
                CacheCore.clearInternalApiCache('fandom_');

                CacheCore.saveWikiDataStore();

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
