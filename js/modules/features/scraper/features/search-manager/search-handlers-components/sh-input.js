/**
 * Search Handlers - Input
 * 
 * Handles search input validation and submission logic.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SHInput = {
        version: '1.0.0',

        init: function () {
            console.log('SHInput initialized');
            return this;
        },

        handleSearchSubmit: function (e) {
            if (e) e.preventDefault();

            console.log('SHInput: Search form submitted');

            const searchInput = document.getElementById('search-input');
            if (!searchInput) {
                console.error('SHInput: Search input not found');
                return;
            }

            const searchTerm = searchInput.value.trim();
            if (!searchTerm) {
                console.warn('SHInput: Empty search term, not performing search');
                return;
            }

            console.log(`SHInput: Searching for "${searchTerm}"`);

            const resultsContainer = document.getElementById('search-results');
            if (!resultsContainer) {
                console.error('SHInput: Search results container not found');
                return;
            }

            if (window.UI && typeof UI.updateLoadingIndicator === 'function') {
                UI.updateLoadingIndicator(true, 'loading-indicator', 'Searching...');
            } else {
                resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
            }

            // Delegate to SearchEnhancer for Google Search (as per original logic using _performGoogleSearch)
            if (window.SearchEnhancer && typeof SearchEnhancer._performGoogleSearch === 'function') {
                SearchEnhancer._performGoogleSearch(searchTerm, resultsContainer);
            } else {
                console.error("SHInput: SearchEnhancer not available for Google Search");
                resultsContainer.innerHTML = '<div class="error">Search functionality unavailable</div>';
            }
        },

        handleSearchButtonClick: function (event) {
            if (window.SearchDiscoveryBroker && typeof SearchDiscoveryBroker.handleSearchButtonClick === 'function') {
                // Pass SearchManager as context if needed, or null
                SearchDiscoveryBroker.handleSearchButtonClick(event, window.SearchManager);
            } else {
                console.error('SHInput: SearchDiscoveryBroker not available');
            }
        }
    };

    // Expose globally
    window.SHInput = SHInput;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SHInput', SHInput);
    }
})();
