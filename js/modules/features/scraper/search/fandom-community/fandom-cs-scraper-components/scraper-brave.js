/**
 * Fandom CS Scraper - Brave Strategy
 * 
 * Handles Brave Search fallback for Fandom wikis.
 */
(function () {
    'use strict';

    const ScraperBrave = {
        /**
         * Brave Search Fallback
         */
        performBraveSearchFallback: async function (query) {
            console.log('FandomCSScraper: Starting Brave Search fallback...');

            const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (!isLocalServer) {
                if (window.FandomCSUI) {
                    FandomCSUI.showInfoMessage(
                        '<h3 style="color: #ff6b35;">🦁 Brave Scraper Requires Local Server</h3>' +
                        '<p>Run <code>python python-server.py</code> and access via localhost:3000</p>'
                    );
                }
                if (window.FandomCSCore) FandomCSCore.setLoading(false);
                return;
            }

            if (window.FandomCSCore) FandomCSCore.setLoading(true);

            try {
                const braveQuery = `${query} site:fandom.com`;
                const foundDomains = await this._executeBraveScrape(braveQuery);

                const results = [];
                const cleanDomains = [...foundDomains].filter(domain => {
                    const subdomain = domain.replace('.fandom.com', '');
                    if (subdomain === 'www') return false;
                    return subdomain.length > 2;
                });

                cleanDomains.forEach(domain => {
                    const subdomain = domain.replace('.fandom.com', '');
                    const name = subdomain.charAt(0).toUpperCase() + subdomain.slice(1).replace(/-/g, ' ');
                    results.push({
                        title: `${name} Wiki`,
                        link: `https://${domain}`,
                        htmlTitle: `<b>${name}</b> Wiki`,
                        snippet: `Community wiki for ${name}. Found via Brave Search.`,
                        displayLink: domain,
                        pagemap: null
                    });
                });

                if (results.length > 0) {
                    if (window.FandomCSUI) FandomCSUI.displayResults(results, 1);
                } else {
                    if (window.FandomCSUI) FandomCSUI.showInfoMessage('<p>No results found via Brave Search.</p>');
                }
            } catch (e) {
                console.warn('Brave fallback failed:', e);
                if (window.FandomCSUI) FandomCSUI.showManualSearchMessage(query);
            }

            if (window.FandomCSCore) FandomCSCore.setLoading(false);
        },

        /**
         * Execute Brave Scrape
         */
        _executeBraveScrape: async function (query) {
            const targetUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;

            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Brave Scrape failed: ${response.status}`);
                const html = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const foundDomains = new Set();

                const links = doc.querySelectorAll('a[href*="fandom.com"], .result a, .snippet a');
                links.forEach(link => {
                    try {
                        const urlObj = new URL(link.href);
                        if (urlObj.hostname.endsWith('fandom.com')) {
                            foundDomains.add(urlObj.hostname);
                        }
                    } catch (e) { }
                });

                return foundDomains;
            } catch (error) {
                console.warn("Brave Scrape Error:", error);
                throw error;
            }
        }
    };

    window.ScraperBrave = ScraperBrave;
})();
