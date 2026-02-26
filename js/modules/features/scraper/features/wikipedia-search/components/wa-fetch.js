/**
 * Wikipedia API - Fetch
 * 
 * Handles fetching of single entry data.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WAFetch = {
        version: '1.0.0',

        init: function () {
            console.log('WAFetch initialized');
            return this;
        },

        /**
         * Fetch live data for a single Wikipedia entry
         * @param {string} title - The title of the Wikipedia entry
         * @returns {Promise<object|null>} Promise resolving to entry data or null
         */
        fetchLiveEntry: async function (title) {
            console.log(`WAFetch: Fetching live data for: ${title}`);
            const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|categories|links|pageimages&explaintext=1&format=json&origin=*&pllimit=max&pithumbsize=200&cllimit=max`;

            try {
                // Dependency check for CORSProxyManager
                if (!window.CORSProxyManager || typeof CORSProxyManager.fetch !== 'function') {
                    throw new Error('CORSProxyManager not available');
                }

                const response = await CORSProxyManager.fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                const data = await response.json();

                if (!data.query || !data.query.pages) {
                    throw new Error('Invalid API response format');
                }

                const pageId = Object.keys(data.query.pages)[0];
                if (pageId === "-1") {
                    console.log(`Page "${title}" does not exist on Wikipedia.`);
                    return null;
                }
                const pageData = data.query.pages[pageId];

                const extract = pageData.extract;
                const categories = pageData.categories ?
                    pageData.categories
                        .map(cat => cat.title.replace(/^Category:/, ''))
                        .filter(cat => !cat.startsWith('Articles with') && !cat.startsWith('All articles') && !cat.startsWith('Use dmy dates') && !cat.startsWith('Webarchive'))
                    : [];
                const links = pageData.links ? pageData.links.map(link => link.title) : [];
                const thumbnail = pageData.thumbnail ? pageData.thumbnail.source : null;
                const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageData.title.replace(/ /g, '_'))}`;

                // Use ModuleUtilities if available for content type inference
                let contentType = 'Article';
                if (window.ModuleUtilities) {
                    contentType = ModuleUtilities.inferContentTypeFromCategories(categories) || ModuleUtilities.inferContentTypeFromTitle(pageData.title, 'en.wikipedia.org');
                }

                return {
                    title: pageData.title,
                    url: url,
                    extract: extract,
                    categories: categories,
                    links: links,
                    thumbnail: thumbnail,
                    contentType: contentType,
                    lastFetch: Date.now()
                };

            } catch (error) {
                console.error(`WAFetch: Failed to fetch live data for ${title}:`, error);
                throw error;
            }
        }
    };

    // Expose globally
    window.WAFetch = WAFetch;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WAFetch', WAFetch);
    }
})();
