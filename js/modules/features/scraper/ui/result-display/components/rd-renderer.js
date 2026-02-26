/**
 * Result Display Renderer Module
 * 
 * Handles DOM element creation for search results
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ResultDisplayRenderer = {
        /**
         * Create a result element based on the layout
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @returns {Element} - The created result element
         */
        createResultElement: function (result, options) {
            return options.layout === 'grid' ?
                this.createGridResultElement(result, options) :
                this.createListResultElement(result, options);
        },

        /**
         * Create a grid-style result element
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @returns {Element} - The created grid result element
         */
        createGridResultElement: function (result, options) {
            if (window.ViewGrid && typeof window.ViewGrid.createResultElement === 'function') {
                // Pass ResultDisplay as context if needed, or null
                // Note: The original code passed 'this' (ResultDisplay), so we might need to handle that.
                // Assuming ViewGrid expects the main facade or the utilities.
                // For now, passing window.ResultDisplay (which will be the facade).
                return window.ViewGrid.createResultElement(result, options, window.ResultDisplay);
            } else {
                console.error('ViewGrid module not loaded, fallback not available');
                const errorDiv = document.createElement('div');
                errorDiv.textContent = 'Error: ViewGrid module not loaded';
                return errorDiv;
            }
        },

        /**
         * Create a list-style result element
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @returns {Element} - The created list result element
         */
        createListResultElement: function (result, options) {
            if (window.ViewList && typeof window.ViewList.createResultElement === 'function') {
                return window.ViewList.createResultElement(result, options, window.ResultDisplay);
            } else {
                console.error('ViewList module not loaded, fallback not available');
                const errorDiv = document.createElement('div');
                errorDiv.textContent = 'Error: ViewList module not loaded';
                return errorDiv;
            }
        },

        /**
         * Display an empty results message
         * @param {Element} container - The container element
         * @param {string} message - The message to display
         */
        displayEmptyResults: function (container, message) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-results';
            emptyMessage.textContent = message;
            container.appendChild(emptyMessage);

            // Update the result count display if it exists
            const countElement = document.getElementById('resultCount');
            if (countElement) {
                countElement.textContent = '0';
            }
        }
    };

    // Make it globally available
    window.ResultDisplayRenderer = ResultDisplayRenderer;

})();
