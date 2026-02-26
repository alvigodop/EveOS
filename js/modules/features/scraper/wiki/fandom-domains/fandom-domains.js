/**
 * Fandom Domains Module (Facade)
 * 
 * Manages Fandom domain list, additions, and removals.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - FandomDomainsStorage: Manages data persistence.
 * - FandomDomainsAPI: Handles data fetching (logos).
 * - FandomDomainsOperations: Handles business logic (add/remove).
 */

(function () {
    const FandomDomains = {
        name: 'FandomDomains',
        version: '1.2.0-facade',
        _initialized: false,

        /**
         * Initialize the FandomDomains module
         */
        init: function () {
            if (this._initialized) return;

            // Initialize sub-modules if available
            if (window.FandomDomainsStorage && typeof FandomDomainsStorage.init === 'function') {
                FandomDomainsStorage.init();
            }
            if (window.FandomDomainsAPI && typeof FandomDomainsAPI.init === 'function') {
                FandomDomainsAPI.init();
            }
            if (window.FandomDomainsOperations && typeof FandomDomainsOperations.init === 'function') {
                FandomDomainsOperations.init();
            }

            this._initialized = true;
            console.log('FandomDomains (Facade) initialized');
        },

        /**
         * Add a Fandom domain to the managed list
         * Delegates to FandomDomainsOperations
         */
        addDomain: function (domain, name, imageUrl) {
            if (window.FandomDomainsOperations) {
                return FandomDomainsOperations.addDomain(
                    domain,
                    name,
                    imageUrl,
                    this.getDomains.bind(this),
                    this.saveDomains.bind(this),
                    this.updateFandomData.bind(this)
                );
            } else {
                console.error('FandomDomainsOperations not loaded');
                return null;
            }
        },

        /**
         * Remove a Fandom domain from the managed list
         * Delegates to FandomDomainsOperations
         */
        removeDomain: function (domain) {
            if (window.FandomDomainsOperations) {
                return FandomDomainsOperations.removeDomain(
                    domain,
                    this.getDomains.bind(this),
                    this.saveDomains.bind(this)
                );
            } else {
                console.error('FandomDomainsOperations not loaded');
            }
        },

        /**
         * Fetch generic data (logo) for a Fandom domain
         * Delegates to FandomDomainsAPI
         */
        updateFandomData: function (domain) {
            if (window.FandomDomainsAPI) {
                return FandomDomainsAPI.updateFandomData(
                    domain,
                    this.getDomains.bind(this),
                    this.saveDomains.bind(this)
                );
            } else {
                console.warn('FandomDomainsAPI not loaded, cannot update data');
            }
        },

        /**
         * Helper to get domains from storage
         * Delegates to FandomDomainsStorage
         */
        getDomains: function () {
            if (window.FandomDomainsStorage) {
                return FandomDomainsStorage.getDomains();
            }
            // Fallback if module missing
            if (window.WikiManager && WikiManager.fandomDomains) {
                return WikiManager.fandomDomains;
            }
            const data = localStorage.getItem('fandomDomains');
            return data ? JSON.parse(data) : [];
        },

        /**
         * Helper to save domains to storage
         * Delegates to FandomDomainsStorage
         */
        saveDomains: function (domains) {
            if (window.FandomDomainsStorage) {
                return FandomDomainsStorage.saveDomains(domains);
            }
            // Fallback if module missing
            if (window.WikiManager) {
                WikiManager.fandomDomains = domains;
            }
            localStorage.setItem('fandomDomains', JSON.stringify(domains));
        }
    };

    // Initialize
    window.FandomDomains = FandomDomains;

    // Auto-init on load
    if (document.readyState === 'complete') {
        FandomDomains.init();
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            FandomDomains.init();
        });
    }

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('FandomDomains', FandomDomains);
    }
})();
