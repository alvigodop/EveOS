/**
 * Wiki UI Renderer - Status Badge Component
 * 
 * Handles generation of status badge HTML for Wiki lists.
 */

(function () {
    'use strict';

    window.WikiUIRenderer = window.WikiUIRenderer || {};

    /**
     * Get HTML for Fandom cache status
     */
    WikiUIRenderer.getFandomCacheStatus = function (domain, cacheStore) {
        if (!cacheStore || !cacheStore.searchResults || !cacheStore.searchResults[domain]) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const domainCache = cacheStore.searchResults[domain];
        let lastUpdate = domainCache.lastUpdate;

        if (!lastUpdate) {
            const items = Object.keys(domainCache).filter(k => k !== 'lastUpdate').map(k => domainCache[k]);
            for (const item of items) {
                if (item && typeof item === 'object' && (item.lastUpdate || item.lastFetch || item.timestamp)) {
                    const itemTs = new Date(item.lastUpdate || item.lastFetch || item.timestamp).getTime();
                    const currentTs = lastUpdate ? new Date(lastUpdate).getTime() : 0;
                    if (itemTs > currentTs) {
                        lastUpdate = item.lastUpdate || item.lastFetch || item.timestamp;
                    }
                }
            }
        }

        const itemCount = Object.keys(domainCache).filter(k => k !== 'lastUpdate').length;

        if (!lastUpdate) {
            if (itemCount > 0) {
                return '<span class="status-badge cached">Cached</span><span class="status-line">Data available</span>';
            }
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const lastDate = new Date(lastUpdate);
        const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        let statusHtml = `
            <span class="status-badge cached">Cached</span>
            <span class="status-info">Updated: ${dayDiff === 0 ? 'Today' : (dayDiff === 1 ? 'Yesterday' : dayDiff + ' days ago')}</span>
            <span class="status-info">Items: ${itemCount}</span>
        `;
        if (dayDiff > 30) {
            statusHtml += '<span class="status-badge outdated">Outdated</span>';
        }

        return statusHtml;
    };

    /**
     * Get HTML for Wiki entry cache status
     */
    WikiUIRenderer.getWikiCacheStatus = function (title, cacheStore) {
        if (!title || !cacheStore) return '<span class="status-badge not-cached">Not Cached</span>';

        // 1. Try modern entryResults sub-structure
        const normalize = (s) => String(s || "").trim().toLowerCase().replace(/_/g, " ");
        const targetNormalized = normalize(title);
        
        let entryCache = cacheStore.entryResults ? cacheStore.entryResults[title] : null;

        // Fuzzy fallback if exact match fails
        if (!entryCache && cacheStore.entryResults) {
            const keys = Object.keys(cacheStore.entryResults);
            const fuzzyKey = keys.find(k => normalize(k) === targetNormalized);
            if (fuzzyKey) {
                entryCache = cacheStore.entryResults[fuzzyKey];
                console.log(`[Badge-Debug] Fuzzy match found for "${title}" -> "${fuzzyKey}"`);
            } else {
                console.log(`[Badge-Debug] No match for "${title}" in keys:`, keys);
            }
        }
        
        // 2. Fallback to legacy root-level entry storage
        if (!entryCache && cacheStore[title]) {
            entryCache = cacheStore[title];
        }

        if (!entryCache) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        // Deep timestamp check (Root -> Main -> Fallbacks)
        const lastUpdate = 
            entryCache.lastUpdate || 
            entryCache.lastFetch || 
            entryCache.timestamp || 
            (entryCache.main ? (entryCache.main.lastUpdate || entryCache.main.lastFetch || entryCache.main.timestamp) : null);

        if (!lastUpdate) {
            // Data exists but no timestamp? Likely very old or partial cache
            return '<span class="status-badge cached">Cached</span><span class="status-line">Data available</span>';
        }

        // Format relative time
        let timeStr = 'Recently';
        let dayDiff = NaN;
        try {
            const date = new Date(lastUpdate);
            if (!isNaN(date.getTime())) {
                const now = new Date();
                const diffMs = now - date;
                dayDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins < 1) timeStr = 'Just now';
                else if (diffMins < 60) timeStr = `${diffMins}m ago`;
                else if (dayDiff === 0) timeStr = 'Today';
                else if (dayDiff === 1) timeStr = 'Yesterday';
                else if (dayDiff < 30) timeStr = `${dayDiff} days ago`;
                else timeStr = date.toLocaleDateString();
            }
        } catch (e) {
            timeStr = 'Cached';
        }

        // Item count logic (Search Results + Main)
        let itemCount = 0;
        if (entryCache.searchResults) {
            itemCount = Object.keys(entryCache.searchResults).length;
        }
        
        // Detailed quality check for Main data (article context)
        const mainData = entryCache.main || entryCache;
        const hasExtract = !!(mainData.extract && String(mainData.extract).length > 20); // Heuristic for full content
        const hasThumbnail = !!(mainData.thumbnail || mainData.imageUrl);
        const hasSnippet = !!(mainData.snippet || mainData.extract || mainData.description);
        const hasValidUrl = !!mainData.url;

        if (hasSnippet || hasThumbnail || hasValidUrl || mainData.title || itemCount > 0) {
            if (itemCount === 0) itemCount = 1; // Show at least 1 item for synced metadata
        }

        // Cache quality indicators (Metadata is sufficient for a positive "Cached" notice now)
        const badgeClass = hasExtract ? 'cached' : 'partial-cached';
        const badgeLabel = 'Cached'; // Unify label as requested by user
        const qualityNote = hasExtract ? '' : '<span class="status-line">Metadata synced</span>';

        let statusHtml = `
            <span class="status-badge ${badgeClass}">${badgeLabel}</span>
            <span class="status-info">Updated: ${timeStr}</span>
            <span class="status-info">Items: ${itemCount}</span>
            ${qualityNote}
        `;

        if (!isNaN(dayDiff) && dayDiff > 30) {
            statusHtml += '<span class="status-badge outdated">Outdated</span>';
        }

        return statusHtml;
    };

    /**
     * Get HTML for Wiki category cache status
     */
    WikiUIRenderer.getCategoryCacheStatus = function (category, cacheStore) {
        if (!cacheStore || !cacheStore.categoryResults || !cacheStore.categoryResults[category]) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const cacheData = cacheStore.categoryResults[category];
        const lastUpdate = cacheData.lastUpdate;
        const pageCount = Object.keys(cacheData).filter(k => k !== 'lastUpdate').length;

        if (!lastUpdate && pageCount === 0) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        let timeStr = 'Data available';
        if (lastUpdate) {
            const lastDate = new Date(lastUpdate);
            const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
            timeStr = dayDiff === 0 ? 'Today' : (dayDiff === 1 ? 'Yesterday' : dayDiff + ' days ago');
        }

        let statusHtml = `
            <span class="status-badge cached">Cached</span>
            <span class="status-info">Pages: ${pageCount}</span>
         `;

        return statusHtml;
    };

    console.log('WikiUIRenderer: Status component loaded');
})();
