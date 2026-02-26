/**
 * Google Scraper UI - Toggles
 * 
 * Handles initialization of search toggles.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSUToggles = {
        version: '1.0.0',

        init: function () {
            console.log('GSUToggles initialized');
            this.searchOptions = {
                googleSearchEnabled: true,
                prioritizeGoogleSearch: true
            };
            return this;
        },

        /**
         * Initialize search toggle controls
         */
        initSearchToggles: function () {
            // Google search ON by default, with no fallback
            const googleSearchEnabled = true;

            // Initialize toggle UI elements
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', this._setupToggles.bind(this));
            } else {
                this._setupToggles();
            }

            if (window.GoogleSearchScraper) {
                window.GoogleSearchScraper.searchOptions = this.searchOptions;
            }
        },

        _setupToggles: function () {
            const googleToggle = document.getElementById('google-search-toggle');

            if (googleToggle) {
                googleToggle.checked = true; // Always checked
                googleToggle.disabled = false; // Not disabled

                // Update the toggle label to indicate it's the only option
                const label = document.querySelector('label[for="google-search-toggle"]');
                if (label) {
                    label.textContent = 'Google Search';
                }

                // Add the event listener, but don't allow toggling off
                googleToggle.addEventListener('change', function () {
                    if (!this.checked) {
                        // If user tries to uncheck, force it back on
                        this.checked = true;
                        console.log('GSUToggles: Google search must remain enabled');
                    }
                });
            }

            // Remove any Fandom Direct Search toggle if it exists
            const fandomToggle = document.getElementById('fandom-direct-search-toggle');
            if (fandomToggle) {
                // Hide the toggle instead of removing it to prevent layout issues
                const fandomToggleParent = fandomToggle.parentElement;
                if (fandomToggleParent) {
                    fandomToggleParent.style.display = 'none';
                }
            }
        }
    };

    // Expose globally
    window.GSUToggles = GSUToggles;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSUToggles', GSUToggles);
    }

    // Auto-init
    GSUToggles.init();
})();
