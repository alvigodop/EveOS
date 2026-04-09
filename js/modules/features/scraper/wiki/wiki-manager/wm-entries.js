/**
 * WikiManager Entries Component
 * Handles management of Wikipedia entries.
 */
const WikiManagerEntries = {};

/**
 * Initialize the module
 */
WikiManagerEntries.init = function () {
    console.log('WikiManagerEntries initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiManagerEntries', WikiManagerEntries);
    }

    // Check for default entries on load (proxies to instance method)
    // Note: WikiManager facade will call this in its init
};

/**
 * Add a Wiki entry
 */
WikiManagerEntries.addWikiEntry = async function (title, name, imageUrl) {
    if (!title) {
        alert('Please enter a valid Wikipedia title');
        return;
    }

    if (window.WikiStore) {
        const success = await WikiStore.addWikiEntry(title, name, imageUrl);
        if (!success) {
            alert('This Wikipedia entry already exists!');
            return;
        }
        if (success) {
            if (window.WikiManagerDelegates) {
                WikiManagerDelegates.updateWikipediaData(title);
            }
            await this.renderWikiEntryList(true);

            // Notify Discovery Integration
            if (window.WikiManagerDelegates) {
                WikiManagerDelegates.updateDiscoveryButtonStatus('wikipedia', title, true);
            }

            return success;
        }
    }
    return null;
};

/**
 * Remove a Wiki entry
 */
WikiManagerEntries.removeWikiEntry = async function (title) {
    if (window.WikiStore) {
        await WikiStore.removeWikiEntry(title);
        await this.renderWikiEntryList(true);
        if (window.WikiManagerDelegates) {
            WikiManagerDelegates.updateDiscoveryButtonStatus('wikipedia', title, false);
        }
    }
};

/**
 * Render Wiki entry list
 */
WikiManagerEntries.renderWikiEntryList = async function (force) {
    const listElement = document.getElementById('wikiEntryList');
    if (!listElement) return;

    // Use WikiManager facade for callbacks to ensure consistent handling
    const wm = window.WikiManager || {};

    // Always reload cache stores from storage before rendering to pick up writes from orchestrators
    if (wm.refreshCacheStores && typeof wm.refreshCacheStores === 'function') {
        await wm.refreshCacheStores();
    }


    // Trace context if possible
    let currentPrefix = "Root";
    if (window.StorageManager && typeof StorageManager.getCardPrefix === 'function') {
        currentPrefix = StorageManager.getCardPrefix() || "Root";
    }
    console.log(`[Context-Debug] Rendering sidebar entries for context: "${currentPrefix}"`);

    // Helper for cache store
    let cacheStore = {};
    if (window.CacheCore && window.CacheCore.wikiCacheStore) {
        cacheStore = window.CacheCore.wikiCacheStore;
    } else if (wm.wikiCacheStore) {
        cacheStore = wm.wikiCacheStore;
    } else if (window.StorageManager) {
        cacheStore = await StorageManager.loadFromCacheStore() || {};
    }

    if (window.WikiUIRenderer && window.WikiStore) {
        const entries = window.WikiStore.getWikiEntries ? await window.WikiStore.getWikiEntries() : (wm.wikiEntries || []);
        WikiUIRenderer.renderWikiEntryList(
            entries,
            listElement,
            cacheStore,
            {
                onVisit: (url, name) => {
                    if (wm._handleVisit) wm._handleVisit(url, name);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleVisit(url, name);
                },
                onItemClick: (e, entry) => {
                    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title)}`;
                    if (wm._handleItemClick) wm._handleItemClick(e, url, entry.title);
                    else if (window.WikiManagerDelegates) WikiManagerDelegates.handleItemClick(e, url, entry.title);
                },
                onReload: (title, btn) => {
                    if (wm.reloadWikiEntryStatus) wm.reloadWikiEntryStatus(title, btn);
                    else if (window.WikiCacheManagerUpdate) window.WikiCacheManagerUpdate.reloadWikiEntryStatus(title, btn);
                },
                onViewCache: (title) => {
                    if (window.CacheManager && typeof window.CacheManager.viewWikiCachedData === 'function') {
                        window.CacheManager.viewWikiCachedData(title);
                    }
                },
                onRemove: (title) => {
                    if (wm.removeWikiEntry) wm.removeWikiEntry(title);
                },
                onClearCache: (title) => {
                    if (window.CacheManager && typeof window.CacheManager.clearWikiCache === 'function') {
                        window.CacheManager.clearWikiCache(title);
                    }
                }
            }
        );
    }
};

/**
 * Add default entries
 */
WikiManagerEntries.addDefaultWikiEntryIfNeeded = async function () {
    const isEnabled = localStorage.getItem('wiki_autoAddDefaults') === 'true';
    if (!isEnabled || !window.WikiStore) return;

    const entries = await WikiStore.getWikiEntries();
    if (entries.length === 0) {
        console.log('Adding default entries...');
        await WikiStore.addWikiEntry('Astro Boy', 'Astro Boy');
        await WikiStore.addWikiEntry('Dragon Ball', 'Dragon Ball');
        await this.renderWikiEntryList(true);
    }

};

// Internal update helper
WikiManagerEntries._updateWikipediaData = function (title) {
    if (window.WikiManagerDelegates) WikiManagerDelegates.updateWikipediaData(title);
};

window.WikiManagerEntries = WikiManagerEntries;
