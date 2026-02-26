/**
 * Direct Renderer - Events
 * Setup direct event handlers for critical buttons
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DREvents = {
        version: '1.0.0',

        init: function () {
            console.log('DREvents initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Setup direct event handlers for critical buttons
         */
        setupDirectEventHandlers: function () {
            this.setupSearchButton();
            this.setupFandomSearchButton();
            this.setupAddButtons();
        },

        /**
         * Setup search button handler
         */
        setupSearchButton: function () {
            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn && !window.SearchManager) {
                searchBtn.onclick = function () {
                    const searchInput = document.getElementById('searchInput');
                    const query = searchInput ? searchInput.value.trim() : '';

                    if (typeof window.searchContent === 'function') {
                        window.searchContent(query);
                    } else {
                        alert('Search function not available');
                    }
                };
            }
        },

        /**
         * Setup Fandom search button handler
         */
        setupFandomSearchButton: function () {
            const searchWikisBtn = document.getElementById('searchWikisBtn');
            if (!searchWikisBtn) return;

            searchWikisBtn.onclick = function () {
                const input = document.getElementById('discoveryInput');
                const query = input ? input.value.trim() : '';

                if (!query) {
                    alert('Please enter a search term');
                    return;
                }

                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'block';
                }

                const resultsContainer = document.getElementById('discoveryResults');
                if (resultsContainer) {
                    resultsContainer.innerHTML = '<div class="loading-message">Searching...</div>';
                }

                if (window.FandomDiscovery && typeof FandomDiscovery.searchFandom === 'function') {
                    FandomDiscovery.searchFandom(query)
                        .then(results => {
                            if (FandomDiscovery.displayResults) {
                                FandomDiscovery.displayResults(results);
                            }
                        })
                        .catch(error => {
                            console.error('Error in Fandom search:', error);
                            if (resultsContainer) {
                                resultsContainer.innerHTML = `<div class="error-message">Search failed: ${error.message}</div>`;
                            }
                        })
                        .finally(() => {
                            if (loadingIndicator) {
                                loadingIndicator.style.display = 'none';
                            }
                        });
                } else if (typeof window.directSearchFandom === 'function') {
                    window.directSearchFandom(query)
                        .then(results => {
                            if (typeof window.displayFandomSearchResults === 'function') {
                                window.displayFandomSearchResults(results, resultsContainer);
                            } else if (resultsContainer) {
                                resultsContainer.innerHTML = `Found ${results.length} results`;
                            }
                        })
                        .catch(error => {
                            console.error('Error in Fandom search:', error);
                            if (resultsContainer) {
                                resultsContainer.innerHTML = `<div class="error-message">Search failed: ${error.message}</div>`;
                            }
                        })
                        .finally(() => {
                            if (loadingIndicator) {
                                loadingIndicator.style.display = 'none';
                            }
                        });
                } else {
                    alert('Fandom search function not available');
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                }
            };
        },

        /**
         * Setup add buttons handlers
         */
        setupAddButtons: function () {
            const addWikiBtn = document.getElementById('addWikiBtn');
            if (addWikiBtn) {
                addWikiBtn.onclick = function () {
                    if (typeof window.directAddWikiEntry === 'function') {
                        window.directAddWikiEntry();
                    } else {
                        alert('Add wiki entry function not available');
                    }
                };
            }

            const addFandomBtn = document.getElementById('addFandomBtn');
            if (addFandomBtn) {
                addFandomBtn.onclick = function () {
                    if (typeof window.directAddFandomDomain === 'function') {
                        window.directAddFandomDomain();
                    } else {
                        alert('Add fandom domain function not available');
                    }
                };
            }
        }
    };

    // Expose globally
    window.DREvents = DREvents;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('DREvents', DREvents);
    }
})();
