/**
 * Fandom CS Scraper - Domain Strategy
 * 
 * Handles domain guessing logic for Fandom wikis.
 */
(function () {
    'use strict';

    const ScraperDomain = {
        /**
         * Domain Guessing Search
         */
        performDomainGuessSearch: async function (query) {
            console.log('FandomCSScraper: Starting domain validation...');

            if (window.FandomCSCore) FandomCSCore.setLoading(true);

            const cleanQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
            const queryParts = query.toLowerCase().split(/\s+/);

            const potentialDomains = [];
            potentialDomains.push(`${cleanQuery}.fandom.com`);
            potentialDomains.push(`${cleanQuery}wiki.fandom.com`);

            if (queryParts.length > 1) {
                potentialDomains.push(`${queryParts.join('')}.fandom.com`);
                potentialDomains.push(`${queryParts.join('-')}.fandom.com`);
                potentialDomains.push(`${queryParts[0]}.fandom.com`);
            }

            if (queryParts[0] === 'the' && queryParts.length > 1) {
                const partsWithoutThe = queryParts.slice(1);
                potentialDomains.push(`${partsWithoutThe.join('')}.fandom.com`);
                potentialDomains.push(`${partsWithoutThe.join('-')}.fandom.com`);
            }

            if (!cleanQuery.includes('wiki') && !cleanQuery.includes('pedia')) {
                potentialDomains.push(`${cleanQuery}pedia.fandom.com`);
            }

            const uniqueGuesses = [...new Set(potentialDomains)];
            console.log('FandomCSScraper: Guessing domains:', uniqueGuesses);

            try {
                const validatedResults = await this._validateDomainsDirectly(uniqueGuesses);

                if (validatedResults.length > 0) {
                    console.log('FandomCSScraper: Domain guess found:', validatedResults.length);
                    if (window.FandomCSUI) FandomCSUI.displayResults(validatedResults, 1);
                } else {
                    if (window.FandomCSUI) {
                        FandomCSUI.showInfoMessage(
                            '<p>No exact wiki match found via domain guessing.</p>' +
                            '<p>Try the <strong>Google Search</strong> option for broader results.</p>'
                        );
                    }
                }
            } catch (e) {
                console.error('Direct Validation Failed', e);
                if (window.FandomCSUI) FandomCSUI.showError('Validation Failed: ' + e.message);
            }

            // Always ensure loading is turned off, unless we found results and they are rendering? 
            // Original code turns it off at the end.
            if (window.FandomCSCore) FandomCSCore.setLoading(false);
        },

        /**
         * Helper to validate domains directly via Image check
         */
        _validateDomainsDirectly: async function (domains) {
            const validatedResults = [];
            const uniqueDomains = [...new Set(domains)];

            console.log(`FandomCSScraper: Validating ${uniqueDomains.length} domains...`);

            await Promise.all(uniqueDomains.map(async (domain) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    let finished = false;
                    const timeoutId = setTimeout(() => { if (!finished) { finished = true; resolve(); } }, 2000);

                    img.onload = () => {
                        if (!finished) {
                            finished = true;
                            clearTimeout(timeoutId);
                            const subdomain = domain.replace('.fandom.com', '');
                            const siteName = subdomain.charAt(0).toUpperCase() + subdomain.slice(1).replace(/-/g, ' ');
                            validatedResults.push({
                                title: `${siteName} Wiki`,
                                link: `https://${domain}`,
                                htmlTitle: `<b>${siteName}</b> Wiki`,
                                snippet: `Community wiki for ${siteName}. Found via domain check.`,
                                displayLink: domain,
                                pagemap: null
                            });
                            resolve();
                        }
                    };

                    img.onerror = () => { if (!finished) { finished = true; clearTimeout(timeoutId); resolve(); } };
                    img.src = `https://${domain}/favicon.ico?_=${Date.now()}`;
                });
            }));

            return validatedResults;
        }
    };

    window.ScraperDomain = ScraperDomain;
})();
