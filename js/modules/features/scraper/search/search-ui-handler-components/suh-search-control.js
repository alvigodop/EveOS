/**
 * Search UI Handler - Search Control
 * 
 * Manages search inputs, forms, and initiation events.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SUHSearchControl = {
        version: '1.0.0',

        init: function () {
            console.log('SUHSearchControl initialized');
            this.setupSearchForm();
            this.setupToggles();
            this.setupSearchButtons();
            this.setupEventBus();
            return this;
        },

        setupSearchForm: function () {
            // Find and set up the search form
            const searchForm = document.getElementById('search-form');
            if (searchForm) {
                console.log('SUHSearchControl: Found search form, attaching event listener');
                searchForm.addEventListener('submit', function (e) {
                    e.preventDefault();
                    console.log('SUHSearchControl: Form submit event intercepted');
                    if (window.SearchManager && typeof SearchManager._handleSearchSubmit === 'function') {
                        SearchManager._handleSearchSubmit(e);
                    }
                    return false;
                });
            }
        },

        setupToggles: function () {
            // Attach listeners for search toggle buttons
            const googleToggle = document.getElementById('google-search-toggle');
            const fandomToggle = document.getElementById('fandom-direct-search-toggle');

            if (googleToggle && fandomToggle) {
                console.log('SUHSearchControl: Attaching toggle listeners');

                // Make the toggles mutually exclusive (radio button behavior)
                googleToggle.addEventListener('change', () => {
                    if (googleToggle.checked) {
                        fandomToggle.checked = false;
                        console.log('SUHSearchControl: Google Search enabled');
                    } else {
                        // Ensure at least one is always checked
                        fandomToggle.checked = true;
                        console.log('SUHSearchControl: Fandom Direct Search enabled (default)');
                    }
                });

                fandomToggle.addEventListener('change', () => {
                    if (fandomToggle.checked) {
                        googleToggle.checked = false;
                        console.log('SUHSearchControl: Fandom Direct Search enabled');
                    } else {
                        // Ensure at least one is always checked
                        googleToggle.checked = true;
                        console.log('SUHSearchControl: Google Search enabled (default)');
                    }
                });
            }
        },

        setupSearchButtons: function () {
            // Attach search button click handler
            const searchButton = document.getElementById('search-button');
            if (searchButton) {
                console.log('SUHSearchControl: Attaching search button listener');
                searchButton.addEventListener('click', (e) => {
                    if (window.SearchManager && typeof SearchManager._handleSearchSubmit === 'function') {
                        SearchManager._handleSearchSubmit(e);
                    }
                });
            }

            // Add listener for the main search button
            const mainSearchBtn = document.getElementById('searchBtn'); // ID from current ScraperTest.html
            if (mainSearchBtn && !mainSearchBtn._searchManagerHandlerInstalled) {
                mainSearchBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('SUHSearchControl: Main search button clicked.');
                    // Delegate to SearchManager private handler for main search
                    if (window.SearchManager && typeof SearchManager._handleMainSearch === 'function') {
                        SearchManager._handleMainSearch();
                    }
                });
                mainSearchBtn._searchManagerHandlerInstalled = true;
            } else if (mainSearchBtn && mainSearchBtn._searchManagerHandlerInstalled) {
                console.log('SUHSearchControl: Main search button handler already installed, skipping');
            }

            // Add listener for Enter key in the main search input
            const mainSearchInput = document.getElementById('searchInput'); // ID from current ScraperTest.html
            if (mainSearchInput && !mainSearchInput._searchManagerHandlerInstalled) {
                mainSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        console.log('SUHSearchControl: Enter key pressed in main search input.');
                        if (window.SearchManager && typeof SearchManager._handleMainSearch === 'function') {
                            SearchManager._handleMainSearch();
                        }
                    }
                });
                mainSearchInput._searchManagerHandlerInstalled = true;
            } else if (mainSearchInput && mainSearchInput._searchManagerHandlerInstalled) {
                console.log('SUHSearchControl: Main search input handler already installed, skipping');
            }
        },

        setupEventBus: function () {
            // Subscribe to search requests from the UI/Utilities
            if (window.EventBus && typeof EventBus.subscribe === 'function') {
                EventBus.subscribe('ui:searchRequested', (eventData) => {
                    console.log('SUHSearchControl: Received ui:searchRequested event:', eventData);
                    if (eventData && eventData.query) {
                        // Determine search type (default to 'all' if not specified)
                        const searchType = eventData.type || 'all';
                        // Update the input field visually (optional)
                        const searchInput = document.getElementById('search-input');
                        if (searchInput) searchInput.value = eventData.query;
                        // Trigger the actual search
                        if (window.SearchManager) {
                            SearchManager.search(eventData.query, searchType);
                        }
                    }
                });
                console.log('SUHSearchControl: Subscribed to ui:searchRequested events.');
            } else {
                console.warn('SUHSearchControl: EventBus not available, cannot subscribe to ui:searchRequested.');
            }
        }
    };

    // Expose globally
    window.SUHSearchControl = SUHSearchControl;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SUHSearchControl', SUHSearchControl);
    }
})();
