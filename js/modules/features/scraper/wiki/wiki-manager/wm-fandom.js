/**
 * WikiManager Fandom Component
 * Handles management of Fandom domains.
 */
const WikiManagerFandom = {};

/**
 * Initialize the module
 */
WikiManagerFandom.init = function () {
    console.log('WikiManagerFandom initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiManagerFandom', WikiManagerFandom);
    }
};

/**
 * Add a Fandom domain
 */
WikiManagerFandom.addFandomDomain = async function (domain, name, imageUrl) {
    if (!domain) {
        alert('Please enter a valid Fandom domain');
        return;
    }

    // Clean up domain
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain.includes('.')) domain += '.fandom.com';

    if (window.WikiStore) {
        const success = await WikiStore.addFandomDomain(domain, name, imageUrl);
        if (success) {
            // Trigger update
            if (window.WikiManagerDelegates) {
                WikiManagerDelegates.updateFandomData(domain);
            }
            await this.renderFandomDomainList(true);

            // Notify Discovery Integration
            if (window.WikiManagerDelegates) {
                WikiManagerDelegates.updateDiscoveryButtonStatus('fandom', domain, true);
            }

            return success;
        }
    } else {
        console.error('WikiStore not found');
        return null;
    }
};

/**
 * Remove a Fandom domain
 */
WikiManagerFandom.removeFandomDomain = async function (domain) {
    if (window.WikiStore) {
        await WikiStore.removeFandomDomain(domain);
        await this.renderFandomDomainList(true);
        if (window.WikiManagerDelegates) {
            WikiManagerDelegates.updateDiscoveryButtonStatus('fandom', domain, false);
        }
    }
};

/**
 * Render Fandom domain list
 */
WikiManagerFandom.renderFandomDomainList = async function (force) {
    const listElement = document.getElementById('fandomDomainList');
    if (!listElement) return; // Silent fail if UI not ready

    // Use WikiManager facade for callbacks to ensure consistent handling
    const wm = window.WikiManager || {};

    // Always reload cache stores from storage before rendering to pick up writes from orchestrators
    // This is now ASYNC and must be awaited to ensure we have the latest data
    if (wm.refreshCacheStores && typeof wm.refreshCacheStores === 'function') {
        await wm.refreshCacheStores();
    }

    // Helper for cache store
    let cacheStore = { searchResults: {} };
    if (window.CacheCore && window.CacheCore.wikiDataStore) {
        cacheStore = window.CacheCore.wikiDataStore;
    } else if (wm.fandomCacheStore) {
        cacheStore = wm.fandomCacheStore;
    } else if (window.StorageManager) {
        // loadFromDataStore is now async in StorageManager/SMWiki contexts
        cacheStore = await StorageManager.loadFromDataStore() || { searchResults: {} };
    }

    const renderCacheStore = (cacheStore && typeof cacheStore === 'object')
        ? { ...cacheStore, searchResults: { ...(cacheStore.searchResults || {}) } }
        : { searchResults: {} };
    let fandomCacheIndex = {};

    if (window.StorageManager && typeof StorageManager.loadDataAsync === 'function') {
        try {
            fandomCacheIndex = await StorageManager.loadDataAsync('fandomCacheIndex', {}, null) || {};
        } catch (error) {
            console.warn('WikiManagerFandom: Failed to load fandom cache index', error);
        }
    }

    if (fandomCacheIndex && typeof fandomCacheIndex === 'object') {
        Object.entries(fandomCacheIndex).forEach(function ([domain, meta]) {
            const normalizedDomain = String(domain || '').trim();
            if (!normalizedDomain) return;

            const existingEntry = renderCacheStore.searchResults[normalizedDomain];
            const existingKeys = existingEntry && typeof existingEntry === 'object'
                ? Object.keys(existingEntry).filter((key) => key !== 'lastUpdate' && key !== '__cacheMeta')
                : [];

            if (existingKeys.length > 0) return;

            renderCacheStore.searchResults[normalizedDomain] = {
                ...(existingEntry && typeof existingEntry === 'object' ? existingEntry : {}),
                lastUpdate: existingEntry?.lastUpdate || meta?.updatedAt || meta?.lastUpdate || null,
                __cacheMeta: {
                    itemCount: Number(meta?.itemCount || existingEntry?.__cacheMeta?.itemCount || 0),
                    updatedAt: meta?.updatedAt || meta?.lastUpdate || existingEntry?.__cacheMeta?.updatedAt || existingEntry?.lastUpdate || null,
                    sampleTitles: Array.isArray(meta?.sampleTitles) ? meta.sampleTitles.slice(0, 5) : []
                }
            };
        });
    }

    if (window.WikiUIRenderer && window.WikiStore) {
        WikiUIRenderer.renderFandomDomainList(
            await WikiStore.getFandomDomains(),
            listElement,
            renderCacheStore,
            {
                onVisit: (url, name) => {
                    if (wm._handleVisit) wm._handleVisit(url, name);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleVisit(url, name);
                },
                onItemClick: (e, wiki) => {
                    const url = `https://${wiki.domain}`;
                    if (wm._handleItemClick) wm._handleItemClick(e, url, wiki.name);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleItemClick(e, url, wiki.name);
                },
                onReload: (domain, btn) => {
                    if (wm.reloadFandomWikiStatus) wm.reloadFandomWikiStatus(domain, btn);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.reloadFandomWikiStatus(domain, btn);
                },
                onViewCache: (domain) => {
                    if (window.CacheManager && typeof window.CacheManager.viewFandomCachedData === 'function') {
                        window.CacheManager.viewFandomCachedData(domain);
                    } else if (wm.viewFandomCachedData) wm.viewFandomCachedData(domain);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.viewFandomCachedData(domain);
                },
                onRemove: (domain) => this.removeFandomDomain(domain),
                onClearCache: (domain) => {
                    if (window.CacheManager && typeof window.CacheManager.clearFandomCache === 'function') {
                        window.CacheManager.clearFandomCache(domain);
                    } else if (wm.clearFandomCache) wm.clearFandomCache(domain);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.clearFandomCache(domain);
                }
            }
        );
    }
};

// Internal update helper (if needed by others, though addFandomDomain uses Delegate directly)
WikiManagerFandom._updateFandomData = function (domain) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.updateFandomData(domain);
};

window.WikiManagerFandom = WikiManagerFandom;
