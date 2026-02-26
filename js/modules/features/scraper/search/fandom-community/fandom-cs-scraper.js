/**
 * Fandom Community Search Scraper Module
 * 
 * Handles fallback scraping mechanisms (Yahoo, Brave, Domain Guessing)
 * when Google API quota is exceeded or specific engines are selected.
 * 
 * Refactored to delegate to sub-modules: ScraperDomain, ScraperYahoo, ScraperBrave
 * 
 * @version 1.0.1-modular
 */

(function () {
    'use strict';

    if (!window.FandomCSScraper) {
        const FandomCSScraper = {
            version: '1.0.1-modular',
            _initialized: false,

            init: function () {
                console.log('Initializing FandomCSScraper');
                this._initialized = true;
                return this;
            },

            /**
             * Domain Guessing Search
             */
            performDomainGuessSearch: async function (query) {
                if (window.ScraperDomain) {
                    return ScraperDomain.performDomainGuessSearch(query);
                } else {
                    console.error('ScraperDomain module not loaded');
                    // Fallback or error handling if module missing
                    if (window.FandomCSUI) FandomCSUI.showError('ScraperDomain module missing');
                }
            },

            /**
             * Yahoo Search Fallback
             */
            performYahooSearchFallback: async function (query) {
                if (window.ScraperYahoo) {
                    return ScraperYahoo.performYahooSearchFallback(query);
                } else {
                    console.error('ScraperYahoo module not loaded');
                }
            },

            /**
             * Brave Search Fallback
             */
            performBraveSearchFallback: async function (query) {
                if (window.ScraperBrave) {
                    return ScraperBrave.performBraveSearchFallback(query);
                } else {
                    console.error('ScraperBrave module not loaded');
                }
            },

            // Helper for completeness if any legacy code calls direct validation (unlikely but safe to include if exported)
            // The original implementation had _validateDomainsDirectly as a private-ish method but attached to the object.
            _validateDomainsDirectly: async function (domains) {
                if (window.ScraperDomain && typeof ScraperDomain._validateDomainsDirectly === 'function') {
                    return ScraperDomain._validateDomainsDirectly(domains);
                }
                return [];
            },

            // Legacy helpers if needed by other modules (the implementation plan moved them entirely)
            // _executeYahooScrape and _executeBraveScrape were internal helpers, likely not called externally.
        };

        window.FandomCSScraper = FandomCSScraper;
        if (window.ModuleRegistry) {
            ModuleRegistry.register('FandomCSScraper', FandomCSScraper);
        }
    }
})();
