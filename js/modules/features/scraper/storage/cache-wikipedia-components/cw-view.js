/**
 * Cache Wikipedia View Component
 * Handles UI interactions and data display for Wikipedia cache.
 */
const CWView = {
    /**
     * View cached data for a Wikipedia entry
     * @param {string} title - The wiki entry title to view cache for
     */
    viewWikiCachedData(title) {
        if (window.CacheCore) CacheCore.init();

        // Check entryResults first (primary location now)
        let entryData = null;
        let searchResultsData = null;

        if (CacheCore.wikiCacheStore.entryResults && CacheCore.wikiCacheStore.entryResults[title]) {
            const fullEntry = CacheCore.wikiCacheStore.entryResults[title];

            // Get main entry data
            if (fullEntry.main) {
                entryData = fullEntry.main;
            }

            // Get search results if they exist
            if (fullEntry.searchResults && Object.keys(fullEntry.searchResults).length > 0) {
                searchResultsData = fullEntry.searchResults;
            }
        }

        // Fallback to root level
        if (!entryData && CacheCore.wikiCacheStore[title]) {
            entryData = CacheCore.wikiCacheStore[title];
        }

        // Combine data if both exist: flatten so each result is a separate card (avoids "Unknown Title" from searchResults blob)
        const displayData = {
            title: title,
            lastUpdate: (CacheCore.wikiCacheStore.entryResults && CacheCore.wikiCacheStore.entryResults[title])
                ? CacheCore.wikiCacheStore.entryResults[title].lastUpdate
                : new Date().toISOString(),
            mainEntry: entryData
        };
        if (searchResultsData && typeof searchResultsData === 'object') {
            Object.assign(displayData, searchResultsData);
        }

        if (window.CacheUI) {
            // Simplify for display if only one exists
            if (searchResultsData && !entryData) {
                CacheUI.displayCachedData(searchResultsData, `${title} Search Results`);
            } else if (entryData && !searchResultsData) {
                CacheUI.displayCachedData(entryData, title);
            } else if (entryData && searchResultsData) {
                // Combined view: mainEntry + each search result as its own card
                CacheUI.displayCachedData(displayData, `${title} (Entry & Results)`);
            } else {
                // Fallback
                CacheUI.showToast('No cached data. Search within this entry to populate cache.', 'warning');
            }
        }
        return;

        if (!entryData) {
            if (window.CacheUI) {
                CacheUI.showToast('No cached data. Search within this entry to populate cache.', 'warning');
            }
            return;
        }

        if (window.CacheUI) {
            CacheUI.displayCachedData(entryData, title);
        }
    },

    /**
     * Show UI notification for cache clear
     * @param {string} title - The entry title
     * @param {boolean} success - Whether clear was successful
     */
    notifyCacheClear(title, success) {
        if (!window.CacheUI) return;

        if (success) {
            CacheUI.showToast(`Cache for "${title}" cleared!`, 'success');
        } else {
            CacheUI.showToast(`No cache found for "${title}"`, 'warning');
        }
    },

    /**
     * Show UI notification for clear all
     * @param {boolean} success - Whether clear was successful
     */
    notifyClearAll(success) {
        if (!window.CacheUI) return;

        if (success) {
            CacheUI.showToast('All Wikipedia caches cleared successfully!', 'success');
        } else {
            CacheUI.showToast('No Wikipedia entries found to clear.', 'warning');
        }
    }
};

window.CWView = CWView;
