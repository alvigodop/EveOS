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
WikiManagerFandom.addFandomDomain = function (domain, name, imageUrl) {
    if (!domain) {
        alert('Please enter a valid Fandom domain');
        return;
    }

    // Clean up domain
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain.includes('.')) domain += '.fandom.com';

    if (window.WikiStore) {
        const success = WikiStore.addFandomDomain(domain, name, imageUrl);
        if (success) {
            // Trigger update
            if (window.WikiManagerDelegates) {
                WikiManagerDelegates.updateFandomData(domain);
            }
            this.renderFandomDomainList(true);

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
WikiManagerFandom.removeFandomDomain = function (domain) {
    if (window.WikiStore) {
        WikiStore.removeFandomDomain(domain);
        this.renderFandomDomainList(true);
        if (window.WikiManagerDelegates) {
            WikiManagerDelegates.updateDiscoveryButtonStatus('fandom', domain, false);
        }
    }
};

/**
 * Render Fandom domain list
 */
WikiManagerFandom.renderFandomDomainList = function (force) {
    const listElement = document.getElementById('fandomDomainList');
    if (!listElement) return; // Silent fail if UI not ready

    // Use WikiManager facade for callbacks to ensure consistent handling
    const wm = window.WikiManager || {};

    // Always reload cache stores from storage before rendering to pick up writes from orchestrators
    if (wm.refreshCacheStores && typeof wm.refreshCacheStores === 'function') {
        wm.refreshCacheStores();
    }

    // Helper for cache store
    let cacheStore = { searchResults: {} };
    if (window.CacheCore && window.CacheCore.wikiDataStore) {
        cacheStore = window.CacheCore.wikiDataStore;
    } else if (wm.fandomCacheStore) {
        cacheStore = wm.fandomCacheStore;
    } else if (window.StorageManager) {
        cacheStore = StorageManager.loadFromDataStore() || { searchResults: {} };
    }

    if (window.WikiUIRenderer && window.WikiStore) {
        WikiUIRenderer.renderFandomDomainList(
            WikiStore.getFandomDomains(),
            listElement,
            cacheStore,
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
                    if (wm.viewFandomCachedData) wm.viewFandomCachedData(domain);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.viewFandomCachedData(domain);
                },
                onRemove: (domain) => this.removeFandomDomain(domain),
                onClearCache: (domain) => {
                    if (wm.clearFandomCache) wm.clearFandomCache(domain);
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
