/**
 * Wiki Discovery Integration - Fandom Module
 * 
 * Handles Fandom wiki search and addition logic.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WDIFandom = {
        /**
         * Search for Fandom wikis
         */
        searchFandomWikis: async function () {
            const searchTerm = document.getElementById('discoveryInput').value.trim();

            if (!searchTerm) {
                // Silently return without alert
                return;
            }

            // Show loading indicator
            if (window.WDIUI) WDIUI.updateLoadingIndicator(true, 'Searching for Fandom community wikis...');

            try {
                // Use the FandomSearch module to search for wikis
                if (!window.FandomSearch) throw new Error('FandomSearch module not loaded');

                const results = await FandomSearch.search(searchTerm);

                // Hide loading indicator
                if (window.WDIUI) WDIUI.updateLoadingIndicator(false);

                // Display results
                const resultsContainer = document.getElementById('discoveryResults');
                if (resultsContainer && typeof FandomSearch.displayResults === 'function') {
                    FandomSearch.displayResults(results, searchTerm, resultsContainer);
                } else if (resultsContainer) {
                    resultsContainer.innerHTML = '<div class="error">FandomSearch display logic missing</div>';
                }
            } catch (error) {
                console.error('Error searching for Fandom wikis:', error);
                if (window.WDIUI) WDIUI.updateLoadingIndicator(false);
                if (window.WDIUI) WDIUI.showError('discoveryResults', `Error searching for wikis: ${error.message}`);
            }
        },

        /**
         * Add a Fandom domain from discovery results
         * @param {string} url - The URL of the wiki
         * @param {string} name - The name of the wiki
         * @param {string} imageUrl - The image URL
         */
        addFandomDomainFromDiscovery: function (url, name, imageUrl) {
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;

                let newDomain = null;
                if (window.WikiManager) {
                    newDomain = WikiManager.addFandomDomain(domain, name, imageUrl);
                } else {
                    console.error('WikiManager not available');
                    return null;
                }

                if (newDomain && window.WDIUI) {
                    // Update the specific button that was clicked
                    // Since we can't easily find the click target from here without passing event,
                    // we rely on WDIUI's selector strategy or trust that global update status handles it if triggered.
                    // But in the original code, it tried to find the button via selectors.
                    // Let's rely on WikiManager triggering `updateDiscoveryButtonStatus` via delegates eventually,
                    // but for immediate feedback on the specific button in the discovery list (which might not be in the main lists),
                    // we might need to do manual update here if `WikiManager.addFandomDomain` doesn't trigger a global refresh that covers discovery result tokens.

                    // Actually, WikiManager.addFandomDomain calls WikiManagerDelegates.updateDiscoveryButtonStatus.
                    // So we shouldn't duplicate logic if that path works.
                    // However, let's keep the defensive robust button identification from original if needed.
                    // Original code attempted to find button by onclick content.

                    // Ideally, FandomSearch.displayResults should render buttons with data attributes to make WDIUI.updateDiscoveryButtonStatus work.
                    // If FandomSearch.displayResults is old, it might not put data-domain.
                }
                return newDomain;
            } catch (error) {
                console.error('Error adding domain from discovery:', error);
                alert('Invalid URL format');
                return null;
            }
        }
    };

    window.WDIFandom = WDIFandom;

})();
