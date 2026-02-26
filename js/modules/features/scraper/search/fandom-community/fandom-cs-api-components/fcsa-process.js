/**
 * Fandom Community Search API - Process Component
 * Handles the process, scoring, randomization, and deduplication of search results.
 */
(function () {
    'use strict';

    const FCSAProcess = {

        processAndDisplay: function (results, page) {
            if (window.FandomCSCore && window.FandomCSUI) {
                const prioritized = this._prioritizeResults(results, FandomCSCore.state.lastSearchTerm);
                FandomCSUI.displayResults(prioritized, page);
            }
        },

        /**
         * Prioritize search results logic
         */
        _prioritizeResults: function (items, searchTerm) {
            if (!items || items.length === 0 || !searchTerm) return items;

            const normalizedSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');

            const scoredItems = items.map(item => {
                let score = 0;
                let subdomain = '';
                let path = '';

                try {
                    const url = new URL(item.link);
                    subdomain = url.hostname.split('.')[0].toLowerCase();
                    path = url.pathname;
                } catch (e) {
                    return { item, score: 0 };
                }

                const normalizedSubdomain = subdomain.replace(/[^a-z0-9]/g, '');

                if (normalizedSubdomain === normalizedSearch) score += 1000;
                else if (normalizedSubdomain.includes(normalizedSearch)) score += 500;
                else if (normalizedSearch.includes(normalizedSubdomain) && normalizedSubdomain.length >= 3) score += 250;

                if (path === '/' || path === '' || path === '/wiki' || path.match(/^\/wiki\/?$/)) score += 500;
                else if (path.match(/^\/wiki\/(Main_Page|[A-Z][a-z]+pedia|[^/]+_Wiki)$/i)) score += 400;
                else if (path.match(/^\/wiki\/[^:\/]+$/)) score -= 300;
                else {
                    const depth = (path.match(/\//g) || []).length;
                    score -= depth * 10;
                }

                if (path.includes('/User:') || path.includes('/User_blog:') || path.includes('/Blog:') ||
                    path.includes('/File:') || path.includes('/Talk:') || path.includes('/f/') || path.includes('/d/')) {
                    score -= 400;
                }

                return { item, score, subdomain };
            });

            scoredItems.sort((a, b) => b.score - a.score);

            const seenSubdomains = new Set();
            const deduplicatedItems = [];

            for (const scoredItem of scoredItems) {
                const subdomain = scoredItem.subdomain;

                if (!seenSubdomains.has(subdomain)) {
                    seenSubdomains.add(subdomain);
                    const modifiedItem = { ...scoredItem.item };

                    try {
                        const originalUrl = new URL(modifiedItem.link);
                        modifiedItem.link = `https://${originalUrl.hostname}`;
                        modifiedItem.displayLink = originalUrl.hostname;

                        const wikiName = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
                        modifiedItem.title = `${wikiName} Wiki`;
                        modifiedItem.htmlTitle = `<b>${wikiName}</b> Wiki`;
                    } catch (e) {
                        // Ignore
                    }
                    deduplicatedItems.push(modifiedItem);
                }
            }
            return deduplicatedItems;
        }
    };

    window.FCSAProcess = FCSAProcess;
})();
