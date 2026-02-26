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
        if (!cacheStore || !cacheStore.entryResults || !cacheStore.entryResults[title]) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const entryCache = cacheStore.entryResults[title];
        const lastUpdate = entryCache.lastUpdate || entryCache.main?.lastUpdate;

        if (!lastUpdate) {
            return '<span class="status-badge not-cached">Not Cached</span>';
        }

        const lastDate = new Date(lastUpdate);
        const dayDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        // Count cached items
        let itemCount = 0;
        if (entryCache.main) itemCount++;
        if (entryCache.searchResults) {
            itemCount += Object.keys(entryCache.searchResults).length;
        }

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
