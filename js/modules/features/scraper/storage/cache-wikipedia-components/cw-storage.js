/**
 * Cache Wikipedia Storage Component
 * Handles direct storage operations for Wikipedia cache entries.
 */
const CWStorage = {
    /**
     * Get cached data for a specific Wikipedia entry title.
     * @param {string} title - The Wikipedia article title.
     * @returns {Promise<object|null>} Promise resolving to the cached data object or null if not found/invalid.
     */
    async getWikipediaEntryData(title) {
        if (window.CacheCore && !CacheCore._initialized) CacheCore.init();

        try {
            const wikiCacheStore = window.CacheCore ? CacheCore.wikiCacheStore : null;
            const entryData = wikiCacheStore ? wikiCacheStore[title] : null;

            if (entryData && typeof entryData === 'object') {
                return entryData;
            }
            return null;
        } catch (e) {
            console.error(`Error getting Wikipedia entry data for "${title}":`, e);
            return null;
        }
    },

    /**
     * Update cached data for a specific Wikipedia entry title.
     * @param {string} title - The Wikipedia article title.
     * @param {object} data - The data object to cache (should include title, url, extract, etc.).
     * @returns {Promise<boolean>} Promise resolving to true if successful.
     */
    async updateWikipediaEntryData(title, data) {
        if (window.CacheCore && !CacheCore._initialized) CacheCore.init();

        if (!title || typeof data !== 'object') return false;

        try {
            if (!CacheCore.wikiCacheStore) CacheCore.wikiCacheStore = {};

            CacheCore.wikiCacheStore[title] = data;
            CacheCore.wikiCacheStore.lastUpdate = Date.now(); // Update overall cache timestamp

            CacheCore.saveWikiCacheStore();
            return true;
        } catch (e) {
            console.error(`Error updating Wikipedia entry data for "${title}":`, e);
            return false;
        }
    },

    /**
     * Clear cache for a Wikipedia entry (Storage logic only)
     * @param {string} title - The wiki entry title to clear cache for
     * @returns {boolean} True if anything was cleared
     */
    clearWikiCache(title) {
        console.log(`CacheWikipedia (Storage): Clearing cache for "${title}"`);

        if (window.CacheCore) CacheCore.init();

        let cleared = false;

        // Check root level (legacy/fallback)
        if (CacheCore.wikiCacheStore[title]) {
            console.log(`CacheWikipedia (Storage): Deleting root level cache for "${title}"`);
            delete CacheCore.wikiCacheStore[title];
            cleared = true;
        }

        // Check entryResults (new structure) - this includes main AND searchResults
        if (CacheCore.wikiCacheStore.entryResults && CacheCore.wikiCacheStore.entryResults[title]) {
            console.log(`CacheWikipedia (Storage): Deleting entryResults for "${title}"`);
            delete CacheCore.wikiCacheStore.entryResults[title];
            cleared = true;
        }

        // Clear Internal Fast-Search Cache (API Responses) for this title
        CacheCore.clearInternalApiCache(`wiki_${title}_`);

        // Also clear all per-query Wikipedia search caches
        CacheCore.clearInternalApiCache('wikipedia_search_');

        // Save changes
        CacheCore.saveWikiCacheStore();
        return cleared;
    },

    /**
     * Clear all Wikipedia entry caches (Storage logic only)
     * @param {Array} entries - Array of entry objects or strings
     * @returns {boolean} True if successful
     */
    clearAllWikiCaches(entries) {
        let entryCleared = false;

        if (entries && entries.length > 0) {
            entries.forEach(entry => {
                const title = entry.title || entry; // Handle object or string
                delete CacheCore.wikiCacheStore[title];
                // Also clear entryResults if present
                if (CacheCore.wikiCacheStore.entryResults) {
                    delete CacheCore.wikiCacheStore.entryResults[title];
                }
            });
            entryCleared = true;
        }

        // Deep clean all wiki internal caches (ALWAYS Perform this, even if no saved entries)
        CacheCore.clearInternalApiCache('wiki_');
        // Also clear per-query Wikipedia search caches
        if (window.CacheCore) {
            CacheCore.clearInternalApiCache('wikipedia_search_');
        }

        CacheCore.saveWikiCacheStore();
        return true;
    }
};

window.CWStorage = CWStorage;
