/**
 * Wiki Discovery Integration - Wikipedia Module
 * 
 * Handles Wikipedia article and category search logic.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WDIWikipedia = {
        /**
         * Search for Wikipedia articles
         */
        searchWikiArticles: async function () {
            const searchTerm = document.getElementById('wikiDiscoveryInput').value.trim();

            if (!searchTerm) {
                return;
            }

            // Show loading indicator
            if (window.WDIUI) WDIUI.updateLoadingIndicator(true, 'Searching for Wikipedia articles...');

            try {
                // Save the search term to cache
                if (window.CacheManager) {
                    CacheManager.logSearch(searchTerm, 'wikipedia');
                }

                // Use WikipediaDiscovery module directly
                if (window.WikipediaDiscovery && typeof WikipediaDiscovery.discover === 'function') {
                    // Use the callback version of discover, wrapped in a Promise
                    let results = await new Promise((resolve) => {
                        WikipediaDiscovery.discover(searchTerm, (res) => resolve(res || []));
                    });

                    console.log('WDIWikipedia: Wikipedia search results:', results);

                    // Fetch thumbnails AND extracts (description)
                    if (window.WikipediaDiscovery && typeof WikipediaDiscovery.fetchThumbnails === 'function') {
                        results = await WikipediaDiscovery.fetchThumbnails(results);
                    }

                    // Enrich with content types
                    if (window.ResultProcessor && typeof ResultProcessor.enrich === 'function') {
                        results = ResultProcessor.enrich(results);
                    }

                    console.log('WDIWikipedia: Wikipedia search results (enriched):', results);

                    if (results && results.length > 0) {
                        // Hide loading indicator on success
                        if (window.WDIUI) WDIUI.updateLoadingIndicator(false);

                        // Render results using SearchUIRenderer mechanism
                        const container = document.getElementById('wikiDiscoveryResults');
                        if (container && window.SearchUIRenderer) {
                            SearchUIRenderer.renderWikipediaDiscoveryResults(results, container, {
                                isAdded: (item) => window.WikiManager && WikiManager.wikiEntries.some(entry => entry.title === item.title),
                                onAdd: (title, thumb, btnElement) => {
                                    // Call the facade/public method for consistency
                                    const newEntry = window.WikiDiscoveryIntegration ? WikiDiscoveryIntegration.addWikiEntryFromDiscovery(title, thumb) : null;

                                    // Update button
                                    if (newEntry && btnElement && window.WDIUI) {
                                        WDIUI.markButtonAsAdded(btnElement);
                                    }
                                },
                                onItemClick: (e, url) => {
                                    if (window.WikiManager) WikiManager.handleWikiResultClick(e, url);
                                }
                            });
                        }
                    } else {
                        // Hide loading indicator
                        if (window.WDIUI) WDIUI.updateLoadingIndicator(false);

                        console.error('WDIWikipedia: WikipediaDiscovery returned no results or an invalid format.');
                        const container = document.getElementById('wikiDiscoveryResults');
                        if (container) container.innerHTML = '<p class="info">No Wikipedia articles found for this term.</p>';
                    }
                } else {
                    // Hide loading indicator if module not found
                    if (window.WDIUI) WDIUI.updateLoadingIndicator(false);

                    console.error('WikipediaDiscovery module not found.');
                    if (window.WDIUI) WDIUI.showError('wikiDiscoveryResults', 'Error: Wikipedia discovery module is not available.');

                    if (window.ErrorNotifier) ErrorNotifier.showError('WikipediaDiscovery module not found.', { recovery: 'Ensure wikipedia-discovery.js is loaded.' });
                }
            } catch (error) {
                console.error('Error searching for articles:', error);
                if (window.WDIUI) WDIUI.updateLoadingIndicator(false);
                if (window.WDIUI) WDIUI.showError('wikiDiscoveryResults', `Error searching for articles: ${error.message}`);
            }
        },

        /**
         * Add a Wikipedia entry from discovery results
         * @param {string} title 
         * @param {string} imageUrl 
         */
        addWikiEntryFromDiscovery: function (title, imageUrl) {
            if (!window.WikiManager) return null;

            const newEntry = WikiManager.addWikiEntry(title, null, imageUrl);
            if (newEntry) {
                // Find and update the button using WDIUI
                if (window.WDIUI) {
                    WDIUI.updateDiscoveryButtonStatus('wikipedia', title, true);
                }
            }
            return newEntry;
        },

        /**
         * Search Wikipedia Categories
         */
        searchWikiCategories: async function () {
            const searchTerm = document.getElementById('wikiDiscoveryInput').value.trim();
            const resultsDiv = document.getElementById('wikiDiscoveryResults');

            if (!searchTerm) {
                alert('Please enter a search term');
                return;
            }

            if (resultsDiv) resultsDiv.innerHTML = '<div class="loading">Searching categories...</div>';

            try {
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Category:${encodeURIComponent(searchTerm)}&format=json&origin=*&srnamespace=14`;
                const response = await fetch(searchUrl);
                const data = await response.json();

                if (resultsDiv) {
                    if (!data.query || !data.query.search || data.query.search.length === 0) {
                        resultsDiv.innerHTML = 'No categories found.';
                        return;
                    }

                    const categories = data.query.search;

                    // Delegate rendering to UI module
                    if (window.WDIUI) {
                        WDIUI.renderCategoryResults(categories, resultsDiv);
                    }
                }
            } catch (error) {
                console.error('Error searching categories:', error);
                if (resultsDiv) resultsDiv.innerHTML = 'Error searching categories.';
            }
        }
    };

    window.WDIWikipedia = WDIWikipedia;

})();
