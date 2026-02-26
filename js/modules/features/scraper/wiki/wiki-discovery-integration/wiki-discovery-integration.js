/**
 * Wiki Discovery Integration Module (Facade)
 * 
 * Orchestrates discovery of new Wikis and Articles, integrating with external search APIs.
 * Delegates actual logic to sub-modules: wdi-fandom.js, wdi-wikipedia.js, wdi-ui.js
 * 
 * @version 1.0.1
 */

(function () {
    window.WikiDiscoveryIntegration = window.WikiDiscoveryIntegration || {};
    const WikiDiscoveryIntegration = window.WikiDiscoveryIntegration;

    /**
     * Search for Fandom wikis
     */
    WikiDiscoveryIntegration.searchFandomWikis = async function () {
        if (window.WDIFandom) {
            await WDIFandom.searchFandomWikis();
        } else {
            console.error('WDIFandom module not loaded');
        }
    };

    /**
     * Search for Wikipedia articles
     */
    WikiDiscoveryIntegration.searchWikiArticles = async function () {
        if (window.WDIWikipedia) {
            await WDIWikipedia.searchWikiArticles();
        } else {
            console.error('WDIWikipedia module not loaded');
        }
    };

    /**
     * Add a Fandom domain from discovery results
     */
    WikiDiscoveryIntegration.addFandomDomainFromDiscovery = function (url, name, imageUrl) {
        if (window.WDIFandom) {
            return WDIFandom.addFandomDomainFromDiscovery(url, name, imageUrl);
        } else {
            console.error('WDIFandom module not loaded');
            return null;
        }
    };

    /**
     * Add a Wikipedia entry from discovery results
     */
    WikiDiscoveryIntegration.addWikiEntryFromDiscovery = function (title, imageUrl) {
        if (window.WDIWikipedia) {
            return WDIWikipedia.addWikiEntryFromDiscovery(title, imageUrl);
        } else {
            console.error('WDIWikipedia module not loaded');
            return null;
        }
    };

    /**
     * Search Wikipedia Categories
     */
    WikiDiscoveryIntegration.searchWikiCategories = async function () {
        if (window.WDIWikipedia) {
            await WDIWikipedia.searchWikiCategories();
        } else {
            console.error('WDIWikipedia module not loaded');
        }
    };

    /**
     * Reset Wikipedia Discovery UI
     */
    WikiDiscoveryIntegration.resetWikiDiscovery = function () {
        if (window.WDIUI) {
            WDIUI.resetWikiDiscovery();
        }
    };

    /**
     * Update the state of a discovery result button (add/added)
     */
    WikiDiscoveryIntegration.updateDiscoveryButtonStatus = function (type, identifier, isAdded) {
        if (window.WDIUI) {
            WDIUI.updateDiscoveryButtonStatus(type, identifier, isAdded);
        }
    };

    // Register with ModuleRegistry
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('WikiDiscoveryIntegration', WikiDiscoveryIntegration);
    }


    // Global exports/aliases support
    window.addWikiFromDiscovery = WikiDiscoveryIntegration.addFandomDomainFromDiscovery;
    window.addWikiEntryFromDiscovery = WikiDiscoveryIntegration.addWikiEntryFromDiscovery;

    console.log('WikiDiscoveryIntegration facade loaded');

})();
