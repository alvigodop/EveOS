/**
 * Result Display Manager Module
 * 
 * Orchestrates the search result display process. 
 * Coordinates between Filter, Data, and Renderer modules.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ResultDisplayManager = {
        /**
         * Display search results in the specified container
         * @param {Array} results - The search results to display
         * @param {string} containerSelector - The selector for the container element
         * @param {object} options - Display options (layout, groupBy, etc.)
         */
        displayResults: function (results, containerSelector = '#results', options = {}) {
            console.log(`Displaying ${results.length} results`);

            // Default options
            const defaultOptions = {
                layout: 'grid', // grid or list
                groupBy: 'none', // none, source, type, domain
                sortBy: 'relevance', // relevance, title, date
                showImages: true,
                highlightQuery: true,
                query: '',
                emptyMessage: 'No results found. Try a different search.',
                mode: '', // '' or 'discovery' for special handling
            };

            // Merge default options with provided options
            const displayOptions = { ...defaultOptions, ...options };

            // Get the container element
            const container = document.querySelector(containerSelector);
            if (!container) {
                console.error(`Container element not found: ${containerSelector}`);
                return;
            }

            // Clear previous results
            container.innerHTML = '';

            // 1. Filtering Phase
            let filteredResults = results;
            if (window.ResultDisplayFilter) {
                filteredResults = window.ResultDisplayFilter.filterResults(results, displayOptions, containerSelector);
            } else {
                console.warn('ResultDisplayFilter not loaded, skipping filtering');
            }

            // Handle empty results
            if (!filteredResults || filteredResults.length === 0) {
                this.displayEmptyResults(container, displayOptions.emptyMessage);
                return;
            }

            // Update the result count display if it exists
            const countElement = document.getElementById('resultCount');
            if (countElement) {
                countElement.textContent = filteredResults.length;
            }

            // 2. Display Phase
            // Group results if needed
            if (displayOptions.groupBy !== 'none') {
                this.displayGroupedResults(filteredResults, container, displayOptions);
            } else {
                // Set layout class on container
                container.className = `results-container ${displayOptions.layout}-layout`;

                // Display each result
                filteredResults.forEach(result => {
                    const resultElement = this.createResultElement(result, displayOptions);
                    container.appendChild(resultElement);
                });
            }
        },

        /**
         * Display grouped results
         * @param {Array} results - The search results
         * @param {Element} container - The container element
         * @param {object} options - Display options
         */
        displayGroupedResults: function (results, container, options) {
            if (!window.ResultDisplayData) {
                console.error('ResultDisplayData not loaded');
                return;
            }

            // Group results based on the groupBy option
            const groupedResults = window.ResultDisplayData.groupResults(results, options.groupBy);

            // Create a section for each group
            Object.keys(groupedResults).forEach(groupName => {
                const groupContainer = document.createElement('div');
                groupContainer.className = 'result-group';

                // Create group header
                const groupHeader = document.createElement('h3');
                groupHeader.className = 'group-header';
                groupHeader.textContent = window.ResultDisplayData.formatGroupName(groupName, options.groupBy);
                groupContainer.appendChild(groupHeader);

                // Create results container for this group
                const groupResultsContainer = document.createElement('div');
                groupResultsContainer.className = `results-container ${options.layout}-layout`;

                // Add each result in this group
                groupedResults[groupName].forEach(result => {
                    const resultElement = this.createResultElement(result, options);
                    groupResultsContainer.appendChild(resultElement);
                });

                // Add the group results to the group container
                groupContainer.appendChild(groupResultsContainer);

                // Add the group container to the main container
                container.appendChild(groupContainer);
            });
        },

        /**
         * Create a result element based on the layout
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @returns {Element} - The created result element
         */
        createResultElement: function (result, options) {
            return window.ResultDisplayRenderer ?
                window.ResultDisplayRenderer.createResultElement.call(window.ResultDisplayRenderer, result, options) : document.createElement('div');
        },

        /**
         * Display an empty results message
         * @param {Element} container - The container element
         * @param {string} message - The message to display
         */
        displayEmptyResults: function (container, message) {
            if (window.ResultDisplayRenderer) {
                window.ResultDisplayRenderer.displayEmptyResults(container, message);
            } else {
                container.textContent = message;
            }
        }
    };

    window.ResultDisplayManager = ResultDisplayManager;

})();
