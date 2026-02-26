/**
 * Cache UI Components - Summary
 * 
 * Handles the high-level cache summary view.
 */
(function () {
    'use strict';

    window.CUISummary = {
        /**
         * View all cached data 
         * Shows a summary of all cached data for both Fandom and Wikipedia
         */
        viewCache: function () {
            console.log('CacheUI.viewCache called');

            // Ensure Core is initialized
            if (window.CacheCore && !CacheCore._initialized) {
                CacheCore.init();
            }

            if (!window.CacheCore) {
                console.error('CacheCore not available');
                return;
            }

            const wikiDataStore = CacheCore.wikiDataStore;
            const wikiCacheStore = CacheCore.wikiCacheStore;

            console.log('Cache state:', {
                wikiDataStore: wikiDataStore ? 'exists' : 'missing',
                wikiCacheStore: wikiCacheStore ? 'exists' : 'missing'
            });

            // Count items in each cache
            const fandomCacheCount = Object.keys(wikiDataStore.searchResults || {}).length;
            const wikiCacheCount = Object.keys(wikiCacheStore || {}).length;

            // Calculate total size
            const fandomCacheSize = JSON.stringify(wikiDataStore).length;
            const wikiCacheSize = JSON.stringify(wikiCacheStore).length;
            const totalSize = (fandomCacheSize + wikiCacheSize) / 1024; // Size in KB

            // Create data object for display
            const summaryData = {
                fandomWikis: `${fandomCacheCount} domains cached`,
                wikipediaEntries: `${wikiCacheCount} articles cached`,
                totalCacheSize: `${totalSize.toFixed(2)} KB`,
                lastFandomUpdate: wikiDataStore.lastUpdate ? new Date(wikiDataStore.lastUpdate).toLocaleString() : 'Never',
                lastWikiUpdate: wikiCacheStore.lastUpdate ? new Date(wikiCacheStore.lastUpdate).toLocaleString() : 'Never'
            };

            // Display the summary using Popup manager
            if (window.CUIPopup) {
                CUIPopup.displayCachedData(summaryData, 'Cache Summary');
            } else {
                console.error('CUIPopup module not loaded');
            }
        }
    };

    console.log('[CUISummary] Loaded');
})();
