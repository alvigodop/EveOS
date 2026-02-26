/**
 * Cache Wikipedia Sync Component
 * Handles batch updates and synchronization for Wikipedia entries.
 */
const CWSync = {
    /**
     * Update all Wikipedia entry caches
     * @param {Function} updateCallback - Callback for update logic (CWStorage.updateWikipediaEntryData)
     * @param {Function} progressCallback - Callback for progress updates
     * @returns {Promise<number>} Number of updated entries
     */
    async updateAllWikiEntries(updateCallback, progressCallback) {
        const entries = (window.WikiManager && window.WikiManager.wikiEntries) || window.wikiEntries || [];
        let updatedCount = 0;
        let currentItem = 0;
        const totalItems = entries.length;

        if (totalItems === 0) return 0;

        for (const entry of entries) {
            currentItem++;
            const title = entry.title || entry;

            try {
                if (progressCallback) {
                    progressCallback(currentItem, totalItems, entry.name || title);
                }

                // Use SearchManager's live fetch function if available
                if (window.SearchManager && typeof SearchManager._fetchLiveWikipediaEntryData === 'function') {
                    const liveData = await SearchManager._fetchLiveWikipediaEntryData(title);
                    if (liveData) {
                        liveData.lastFetch = Date.now();
                        await updateCallback(title, liveData);
                        updatedCount++;
                    }
                } else if (window.WikiManager && typeof WikiManager.reloadWikiStatus === 'function') {
                    await WikiManager.reloadWikiStatus(title);
                    updatedCount++;
                } else {
                    console.warn(`No update function available for Wikipedia entry: ${title}`);
                }
            } catch (error) {
                console.error(`Error updating Wikipedia cache for ${title}:`, error);
            }
        }

        return updatedCount;
    }
};

window.CWSync = CWSync;
