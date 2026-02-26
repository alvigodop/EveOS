/**
 * Event Manager - Input Sub-module
 * Handles keyboard shortcuts and generic input events
 */

window.EventManagerInput = window.EventManagerInput || {};

(function (module) {

    /**
     * Set up input events like Enter key support
     * NOTE: Main searchInput is handled by setupSearchButton or SearchManager
     */
    module.setupInputEvents = function () {
        // NOTE: Do NOT add searchInput handler here - it's handled by setupSearchButton or SearchManager

        // Discovery input for Wikipedia (Enter key)
        const wikiDiscoveryInput = document.getElementById('wikiDiscoveryInput');
        if (wikiDiscoveryInput && !wikiDiscoveryInput._eventManagerEnterHandler) {
            wikiDiscoveryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const searchBtn = document.getElementById('searchWikiArticlesBtn');
                    if (searchBtn) {
                        searchBtn.click();
                    }
                }
            });
            wikiDiscoveryInput._eventManagerEnterHandler = true;
        }

        // Discovery input for Fandom (Enter key)
        const discoveryInput = document.getElementById('discoveryInput');
        if (discoveryInput && !discoveryInput._eventManagerEnterHandler) {
            discoveryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const searchBtn = document.getElementById('searchWikisBtn');
                    if (searchBtn) {
                        searchBtn.click();
                    }
                }
            });
            discoveryInput._eventManagerEnterHandler = true;
        }
    };

    /**
     * Set up module status button events
     */
    module.setupModuleStatusEvents = function () {
        // Add keyboard shortcut (Alt+M) for module status
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'm') {
                if (window.UI && typeof window.UI.showModuleStatus === 'function') {
                    window.UI.showModuleStatus();
                } else {
                    console.error('Module status function not available');
                }
            }
        });
    };

    /**
     * Set up keyboard shortcuts
     */
    module.setupKeyboardShortcuts = function () {
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Alt+R to reload the page
            if (e.altKey && e.key === 'r') {
                this.reloadApp();
            }

            // Alt+S to focus search input
            if (e.altKey && e.key === 's') {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                }
            }
        });
    };

    /**
     * Reload the application
     */
    module.reloadApp = function () {
        window.location.reload();
    };

})(window.EventManagerInput);
