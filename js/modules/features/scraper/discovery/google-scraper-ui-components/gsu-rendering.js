/**
 * Google Scraper UI - Rendering
 * 
 * Handles rendering of Google-style search results.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSURendering = {
        version: '1.0.0',

        init: function () {
            console.log('GSURendering initialized');
            return this;
        },

        /**
         * Render search results in Google-like style
         */
        renderGoogleStyleResults: function (results, searchTerm, container) {
            if (!container) return;

            // Clear any existing content
            const existingLoading = container.querySelector('.google-loading');
            if (existingLoading) {
                existingLoading.remove();
            }

            const existingError = container.querySelector('.google-search-error');
            if (existingError) {
                existingError.remove();
            }

            // Create the Google-style results container
            const resultsContainer = document.createElement('div');
            resultsContainer.className = 'google-style-results';

            // Add search info
            const searchInfo = document.createElement('div');
            searchInfo.className = 'google-search-info';
            searchInfo.innerHTML = `About ${results.length} results for <b>${searchTerm}</b>`;
            resultsContainer.appendChild(searchInfo);

            if (results.length > 0) {
                // Create ordered results list
                const resultsList = document.createElement('div');
                resultsList.className = 'google-search-results-list';

                // Add each result in Google style
                results.forEach(result => {
                    const resultElement = document.createElement('div');
                    resultElement.className = 'google-search-result';

                    // Format URL for display
                    const displayUrl = result.url.replace(/^https?:\/\//i, '').substring(0, 50) +
                        (result.url.replace(/^https?:\/\//i, '').length > 50 ? '...' : '');

                    // Create favicon element
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${result.domain}&sz=32`;

                    // HTML for the result
                    resultElement.innerHTML = `
                        <div class="google-result-url">
                            <img src="${faviconUrl}" alt="" class="google-result-favicon">
                            <span class="google-result-domain">${displayUrl}</span>
                        </div>
                        <h3 class="google-result-title">
                            <a href="${result.url}" target="_blank">${this.highlightSearchTerm(result.name, searchTerm)}</a>
                        </h3>
                        <div class="google-result-description">${this.highlightSearchTerm(result.description, searchTerm)}</div>
                    `;

                    resultsList.appendChild(resultElement);
                });

                resultsContainer.appendChild(resultsList);
            } else {
                // No results found
                const noResults = document.createElement('div');
                noResults.className = 'google-no-results';
                noResults.innerHTML = `
                    <div class="google-error-icon">⚠️</div>
                    <div class="google-error-content">
                        <h3>No results found</h3>
                        <p>Your search - <b>${searchTerm}</b> - did not match any documents.</p>
                        <p>Suggestions:</p>
                        <ul>
                            <li>Make sure all words are spelled correctly.</li>
                            <li>Try different keywords.</li>
                            <li>Try more general keywords.</li>
                        </ul>
                    </div>
                `;
                resultsContainer.appendChild(noResults);
            }

            // Append to container
            container.appendChild(resultsContainer);
        },

        /**
         * Highlight search terms in title and description
         */
        highlightSearchTerm: function (text, searchTerm) {
            if (!text || !searchTerm) return text || '';

            const searchTerms = searchTerm.toLowerCase().split(/\s+/);
            let highlightedText = text;

            searchTerms.forEach(term => {
                if (term.length < 3) return; // Skip short terms

                const regex = new RegExp(`(${term})`, 'gi');
                highlightedText = highlightedText.replace(regex, '<b>$1</b>');
            });

            return highlightedText;
        }
    };

    // Expose globally
    window.GSURendering = GSURendering;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSURendering', GSURendering);
    }
})();
