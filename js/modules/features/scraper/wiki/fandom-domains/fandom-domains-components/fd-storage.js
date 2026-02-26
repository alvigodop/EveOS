/**
 * Fandom Domains Storage Component
 * Handles local storage operations for Fandom domains.
 */
const FandomDomainsStorage = {
    /**
     * Initialize the storage component
     */
    init: function () {
        console.log('FandomDomainsStorage initialized');
    },

    /**
     * Helper to get domains from storage
     * @returns {Array} List of stored domains
     */
    getDomains: function () {
        if (window.WikiManager && WikiManager.fandomDomains) {
            return WikiManager.fandomDomains;
        }
        const data = localStorage.getItem('fandomDomains');
        return data ? JSON.parse(data) : [];
    },

    /**
     * Helper to save domains to storage
     * @param {Array} domains - List of domains to save
     */
    saveDomains: function (domains) {
        if (window.WikiManager) {
            WikiManager.fandomDomains = domains;
        }
        localStorage.setItem('fandomDomains', JSON.stringify(domains));
    }
};

window.FandomDomainsStorage = FandomDomainsStorage;
