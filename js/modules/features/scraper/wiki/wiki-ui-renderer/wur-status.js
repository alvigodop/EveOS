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
        // Note: original code had constlastUpdate typo fix here? 
        // Original: constlastUpdate = domainCache.lastUpdate;
        const lastUpdate = domainCache.lastUpdate;

        if (!lastUpdate) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const lastDate = new Date(lastUpdate);
        const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        // Count cached items
        const itemCount = Object.keys(domainCache).filter(k => k !== 'lastUpdate').length;

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
        if (!cacheStore) return '<span class="status-badge not-cached">Not Cached</span>';

        // 1. Try modern entryResults sub-structure first
        let entryCache = cacheStore.entryResults ? cacheStore.entryResults[title] : null;

        // 2. Fallback to legacy root-level entry storage
        if (!entryCache && cacheStore[title]) {
            entryCache = cacheStore[title];
        }

        if (!entryCache) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        // 3. Resilient timestamp detection (lastUpdate, lastFetch, or entry-level timestamp)
        const lastUpdate = entryCache.lastUpdate || entryCache.lastFetch || entryCache.timestamp || (entryCache.main ? entryCache.main.lastUpdate : null);

        if (!lastUpdate) {
            // If data exists but no timestamp, we still consider it "Cached" but mark update as unknown
            return `
                <span class="status-badge cached">Cached</span>
                <span class="status-info">Update Time: Unknown</span>
            `;
        }

        const lastDate = new Date(lastUpdate);
        const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        // 4. Robust Item Count (handle nested main + searchResults or root-level keys)
        let itemCount = 0;
        
        // Count the primary article if present (nested or root)
        if (entryCache.main || entryCache.extract || entryCache.title === title) {
            itemCount++;
        }
        
        // Count additional snippet/search matches
        if (entryCache.searchResults) {
            itemCount += Object.keys(entryCache.searchResults).length;
        }

        let statusHtml = `
            <span class="status-badge cached">Cached</span>
            <span class="status-info">Updated: ${isNaN(dayDiff) ? 'Recently' : (dayDiff === 0 ? 'Today' : (dayDiff === 1 ? 'Yesterday' : dayDiff + ' days ago'))}</span>
            <span class="status-info">Items: ${itemCount}</span>
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

        if (!lastUpdate) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const lastDate = new Date(lastUpdate);
        const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        const pageCount = Object.keys(cacheData).filter(k => k !== 'lastUpdate').length;

        let statusHtml = `
            <span class="status-badge cached">Cached</span>
            <span class="status-info">Pages: ${pageCount}</span>
         `;

        return statusHtml;
    };

    console.log('WikiUIRenderer: Status component loaded');
})();
