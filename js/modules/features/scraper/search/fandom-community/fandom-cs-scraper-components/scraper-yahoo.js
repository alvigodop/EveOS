/**
 * Fandom CS Scraper - Yahoo Strategy
 * 
 * Handles Yahoo Search fallback for Fandom wikis.
 */
(function () {
    'use strict';

    const ScraperYahoo = {
        /**
         * Yahoo Search Fallback
         */
        performYahooSearchFallback: async function (query) {
            console.log('FandomCSScraper: Starting Yahoo Search fallback...');
            if (window.FandomCSCore) FandomCSCore.setLoading(true);

            try {
                const yahooQuery = `${query} site:fandom.com`;
                const foundDomains = await this._executeYahooScrape(yahooQuery);

                const results = [];
                const cleanDomains = [...foundDomains].filter(domain => {
                    const subdomain = domain.replace('.fandom.com', '');
                    if (subdomain === 'www') return false;
                    if (subdomain.length > 3 && subdomain.startsWith('f')) {
                        const withoutF = subdomain.slice(1) + '.fandom.com';
                        if (foundDomains.has(withoutF)) return false;
                    }
                    return true;
                });

                cleanDomains.forEach(domain => {
                    const subdomain = domain.replace('.fandom.com', '');
                    const name = subdomain.charAt(0).toUpperCase() + subdomain.slice(1).replace(/-/g, ' ');
                    results.push({
                        title: `${name} Wiki`,
                        link: `https://${domain}`,
                        htmlTitle: `<b>${name}</b> Wiki`,
                        snippet: `Community wiki for ${name}. Found via Yahoo Search.`,
                        displayLink: domain,
                        pagemap: null
                    });
                });

                if (results.length > 0) {
                    console.log('FandomCSScraper: Yahoo fallback found:', results.length, 'wikis');
                    if (window.FandomCSUI) FandomCSUI.displayResults(results, 1);
                } else {
                    if (window.FandomCSUI) FandomCSUI.showInfoMessage('<p>No results found via Yahoo fallback.</p>');
                }
            } catch (e) {
                console.error('Yahoo fallback failed:', e);
                if (window.FandomCSUI) FandomCSUI.showManualSearchMessage(query);
            }

            if (window.FandomCSCore) FandomCSCore.setLoading(false);
        },

        /**
         * Execute Yahoo Scrape
         */
        _executeYahooScrape: async function (query) {
            const targetUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
            const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            let proxyUrl;
            if (isLocalServer) {
                proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            } else {
                proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            }

            console.log(`FandomCSScraper: Scraping Yahoo via ${isLocalServer ? 'local' : 'public'} proxy`);

            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Yahoo Scrape failed: ${response.status}`);
                const html = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const foundDomains = new Set();

                const links = doc.querySelectorAll('h3 a, .algo a, a[href*="fandom.com"]');

                links.forEach(link => {
                    try {
                        let url = link.href;
                        if (url.includes('r.search.yahoo.com')) {
                            const ruMatch = url.match(/RU=([^/]+)/);
                            if (ruMatch) url = decodeURIComponent(ruMatch[1]);
                        }

                        const urlObj = new URL(url);
                        if (urlObj.hostname.endsWith('fandom.com')) {
                            foundDomains.add(urlObj.hostname);
                        }
                    } catch (e) { }
                });

                const domainMatches = html.match(/([a-z][a-z0-9-]*[a-z0-9])\.fandom\.com/gi);
                if (domainMatches) {
                    domainMatches.forEach(match => {
                        const domain = match.toLowerCase();
                        const subdomain = domain.replace('.fandom.com', '');
                        if (subdomain.length > 2 && !subdomain.startsWith('www') && !subdomain.startsWith('community')) {
                            foundDomains.add(domain);
                        }
                    });
                }

                return foundDomains;
            } catch (error) {
                console.error("Proxy Fetch Error:", error);
                throw error;
            }
        }
    };

    window.ScraperYahoo = ScraperYahoo;
})();
