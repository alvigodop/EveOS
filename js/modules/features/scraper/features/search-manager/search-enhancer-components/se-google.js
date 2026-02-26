/**
 * Search Enhancer - Google
 * 
 * Handles Google Search delegation.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SEGoogle = {
        version: '1.0.0',

        init: function () {
            console.log('SEGoogle initialized');
            return this;
        },

        performGoogleSearch: function (query, container) {
            if (!window.GoogleSearchScraper || typeof GoogleSearchScraper.scrapeGoogleForFandomWikis !== 'function') {
                console.error('SEGoogle: GoogleSearchScraper not available');
                container.innerHTML = `
                    <div class="error">
                        <h3>Google Search is not available</h3>
                        <p>The required module for Google Search is missing.</p>
                        <p>Please refresh the page or check your internet connection.</p>
                    </div>`;
                return;
            }

            GoogleSearchScraper.scrapeGoogleForFandomWikis(query, {
                resultsContainer: container.id,
                fullPage: true
            })
                .then(response => {
                    console.log('SEGoogle: Google Search complete', response);

                    if (response.success && response.results && response.results.length > 0) {
                        if (GoogleSearchScraper.displayResults && typeof GoogleSearchScraper.displayResults === 'function') {
                            GoogleSearchScraper.displayResults(response.results, container.id, query);
                        } else if (window.ResultDisplay && typeof ResultDisplay.displayResults === 'function') {
                            ResultDisplay.displayResults(response.results, `#${container.id}`, {
                                query: query,
                                layout: 'grid',
                                mode: 'discovery'
                            });
                        } else {
                            // Fallback to basic display if Google Scraper UI is gone (delegated back to facade or local Helper)
                            // Ideally, this module shouldn't depend on facade, but let's assume SearchDisplay logic
                            if (window.SearchDisplay && typeof SearchDisplay.displayBasicResults === 'function') {
                                SearchDisplay.displayBasicResults(response.results, container, query);
                            } else {
                                this._displayBasicResultsFallback(response.results, container, query);
                            }
                        }
                    } else if (container.innerHTML.indexOf('error-message') === -1) {
                        container.innerHTML = `
                        <div class="no-results">
                            <h3>No results found</h3>
                            <p>No Fandom community wikis found matching "${query}".</p>
                            <p>Try a different search term.</p>
                        </div>`;
                    }
                })
                .catch(error => {
                    console.error('SEGoogle: Google Search error', error);
                    container.innerHTML = `
                    <div class="error">
                        <h3>Search Error</h3>
                        <p>${error.message || 'An error occurred while searching.'}</p>
                        <p>Please try again or check your internet connection.</p>
                    </div>`;
                });
        },

        _displayBasicResultsFallback: function (results, container, query) {
            // Basic fallback
            let html = `<div class="search-results-list">`;
            results.forEach(result => {
                html += `<div class="result-item">
                     <h3><a href="${result.url}">${result.title}</a></h3>
                     <p>${result.snippet || ''}</p>
                 </div>`;
            });
            html += `</div>`;
            container.innerHTML = html;
        }
    };

    // Expose globally
    window.SEGoogle = SEGoogle;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SEGoogle', SEGoogle);
    }
})();
