/**
 * Google Scraper UI - Display
 * 
 * Handles displaying standard search results.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSUDisplay = {
        version: '1.0.0',

        init: function () {
            console.log('GSUDisplay initialized');
            return this;
        },

        /**
         * Display search results in the specified container
         * @param {Array} results - Array of search results to display
         * @param {string} containerId - ID of the container element
         * @param {string} query - The search query
         */
        displayResults: function (results, containerId = 'search-results', query = '') {
            console.log(`GSUDisplay: Displaying ${results.length} results for query "${query}" in container #${containerId}`);

            // Find the container element
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`GSUDisplay: Container element #${containerId} not found`);
                return;
            }

            // Clear previous results
            container.innerHTML = '';

            // Check if we have results
            if (!results || results.length === 0) {
                container.innerHTML = `<div class="no-results">No Fandom community wikis found. Try a different search term.</div>`;
                return;
            }

            // Create result elements
            results.forEach(result => {
                // Create a container for this result
                const resultElement = document.createElement('div');
                resultElement.className = 'search-result-item';

                // Create favicon if available
                let faviconHtml = '';
                if (result.favicon) {
                    faviconHtml = `<img src="${result.favicon}" alt="Wiki favicon" class="wiki-favicon">`;
                }

                // Format the name 
                const name = result.name || result.title || '';

                // Format the description
                const description = result.description || '';

                // Format the URL 
                const url = result.url || '';

                // Build result HTML
                resultElement.innerHTML = `
                    <a href="${url}" target="_blank" class="wiki-link">
                        ${faviconHtml}
                        <div class="wiki-info">
                            <h3 class="wiki-title">${name}</h3>
                            <p class="wiki-description">${description}</p>
                            <span class="wiki-url">${url}</span>
                        </div>
                    </a>
                `;

                // Add the result to the container
                container.appendChild(resultElement);
            });

            // Update result count display if it exists
            const countElement = document.getElementById('resultCount');
            if (countElement) {
                countElement.textContent = results.length;
            }

            // Dispatch event that results were updated
            const event = new CustomEvent('searchResultsUpdated', {
                detail: {
                    query: query,
                    resultsCount: results.length
                }
            });
            document.dispatchEvent(event);
        }
    };

    // Expose globally
    window.GSUDisplay = GSUDisplay;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSUDisplay', GSUDisplay);
    }
})();
