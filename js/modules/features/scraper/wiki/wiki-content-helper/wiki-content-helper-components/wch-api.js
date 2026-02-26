/**
 * Wiki Content Helper - API
 * API interaction logic for fetching wiki content
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WCHApi = {
        version: '1.0.0',

        init: function () {
            console.log('WCHApi initialized');
            return this;
        },

        /**
         * Get all wiki pages (limited to top 50 for performance)
         */
        getAllWikiPages: async function (domain) {
            try {
                const url = `https://${domain}/api.php?action=query&list=allpages&aplimit=50&format=json&origin=*`;

                let response;
                if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                    response = await CORSProxyManager.fetch(url);
                } else {
                    response = await fetch(url);
                }

                const data = await response.json();
                return data.query?.allpages || [];
            } catch (error) {
                console.error(`WCHApi: Error fetching pages for ${domain}:`, error);
                return [];
            }
        },

        /**
         * Helper to fetch raw page content
         */
        fetchPageContent: async function (wiki, title) {
            const pageUrl = `https://${wiki.domain}/api.php?action=query&prop=revisions&titles=${encodeURIComponent(title)}&rvprop=content&format=json&origin=*`;
            let response;
            if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                response = await CORSProxyManager.fetch(pageUrl);
            } else {
                response = await fetch(pageUrl);
            }
            const data = await response.json();
            const pages = data.query?.pages || {};
            return Object.values(pages)[0]?.revisions?.[0]?.['*'] || '';
        },

        /**
         * Get content for a specific page
         */
        getPageContent: async function (domain, title) {
            try {
                const contentUrl = `https://${domain}/api.php?action=query&prop=revisions|categories&titles=${encodeURIComponent(title)}&rvprop=content&format=json&origin=*`;

                let response;
                if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                    response = await CORSProxyManager.fetch(contentUrl);
                } else {
                    response = await fetch(contentUrl);
                }

                const data = await response.json();
                const page = Object.values(data.query?.pages || {})[0];

                const content = page?.revisions?.[0]?.['*'] || '';
                const categories = page?.categories?.map(cat => cat.title.replace('Category:', '')) || [];

                // Simple content type inference
                let contentType = 'other';
                const catStr = categories.join(' ').toLowerCase();
                if (catStr.includes('character') || catStr.includes('person')) contentType = 'character';
                else if (catStr.includes('location') || catStr.includes('place')) contentType = 'location';
                else if (catStr.includes('episode') || catStr.includes('season')) contentType = 'episode';

                // Extract aliases if it's a character
                let aliases = [];
                if ((contentType === 'character' || contentType === 'person') && window.WCHProcessors) {
                    aliases = await WCHProcessors.getCharacterAliases({ domain: domain }, title, content, this.fetchPageContent);
                }

                return { content, categories, contentType, aliases };
            } catch (error) {
                console.error('WCHApi: Error fetching page content:', error);
                return { content: '', categories: [], contentType: 'other', aliases: [] };
            }
        }
    };

    // Expose globally
    window.WCHApi = WCHApi;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('WCHApi', WCHApi);
    }
})();
