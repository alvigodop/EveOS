/**
 * Result Display Module (Facade)
 * 
 * Handles displaying search results in various formats.
 * Delegates to:
 * - ResultDisplayManager: Orchestration
 * - ResultDisplayFilter: Filtering
 * - ResultDisplayData: Data processing/Grouping
 * - ResultDisplayRenderer: HTML Generation
 * 
 * @version 1.0.3
 */

(function () {
    'use strict';

    // Create ResultDisplay object if it doesn't exist or is incomplete
    if (!window.ResultDisplay || typeof window.ResultDisplay.displayResults !== 'function') {
        const ResultDisplay = window.ResultDisplay = {
            version: '1.0.3',

            /**
             * Initialize the module
             */
            init: function () {
                // Initialize core if available
                if (window.ResultDisplayCore) {
                    window.ResultDisplayCore.init();
                }

                // Allow chaining
                return this;
            },

            /**
             * Check if initialized
             */
            get _initialized() {
                return window.ResultDisplayCore ? window.ResultDisplayCore.isInitialized() : false;
            },

            /**
             * Display search results in the specified container
             * @param {Array} results - The search results to display
             * @param {string} containerSelector - The selector for the container element
             * @param {object} options - Display options (layout, groupBy, etc.)
             */
            displayResults: function (results, containerSelector = '#results', options = {}) {
                if (window.ResultDisplayManager) {
                    window.ResultDisplayManager.displayResults(results, containerSelector, options);
                } else {
                    console.error('ResultDisplayManager not loaded');
                }
            },

            /**
             * Display grouped results
             * @param {Array} results - The search results
             * @param {Element} container - The container element
             * @param {object} options - Display options
             */
            displayGroupedResults: function (results, container, options) {
                if (window.ResultDisplayManager) {
                    window.ResultDisplayManager.displayGroupedResults(results, container, options);
                } else {
                    console.error('ResultDisplayManager not loaded');
                }
            },

            /**
             * Group results by the specified property
             * @param {Array} results - The search results
             * @param {string} groupBy - The property to group by
             * @returns {object} - Object with groups as keys and arrays of results as values
             */
            groupResults: function (results, groupBy) {
                return window.ResultDisplayData ?
                    window.ResultDisplayData.groupResults(results, groupBy) : {};
            },

            /**
             * Format group name for display
             * @param {string} groupName - The raw group name
             * @param {string} groupBy - The grouping type
             * @returns {string} - Formatted group name
             */
            formatGroupName: function (groupName, groupBy) {
                return window.ResultDisplayData ?
                    window.ResultDisplayData.formatGroupName(groupName, groupBy) : groupName;
            },

            /**
             * Get content type for a result
             * @param {object} result - The search result
             * @returns {string} - Content type category
             */
            getContentType: function (result) {
                return window.ResultDisplayData ?
                    window.ResultDisplayData.getContentType(result) : 'articles';
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
             * Create a grid-style result element
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @returns {Element} - The created grid result element
             */
            createGridResultElement: function (result, options) {
                return window.ResultDisplayRenderer ?
                    window.ResultDisplayRenderer.createGridResultElement.call(window.ResultDisplayRenderer, result, options) : document.createElement('div');
            },

            /**
             * Create a list-style result element
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @returns {Element} - The created list result element
             */
            createListResultElement: function (result, options) {
                return window.ResultDisplayRenderer ?
                    window.ResultDisplayRenderer.createListResultElement.call(window.ResultDisplayRenderer, result, options) : document.createElement('div');
            },

            /**
             * Display an empty results message
             * @param {Element} container - The container element
             * @param {string} message - The message to display
             */
            displayEmptyResults: function (container, message) {
                if (window.ResultDisplayManager) {
                    window.ResultDisplayManager.displayEmptyResults(container, message);
                } else if (window.ResultDisplayRenderer) {
                    window.ResultDisplayRenderer.displayEmptyResults(container, message);
                }
            },

            /**
             * Get a formatted source name for display
             * @param {object} result - The search result
             * @returns {string} - Formatted source name
             */
            getSourceName: function (result) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.getSourceName(result) : '';
            },

            /**
             * Format a source name for display
             * @param {string} source - The raw source name
             * @returns {string} - Formatted source name
             */
            formatSourceName: function (source) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.formatSourceName(source) : source;
            },

            /**
             * Highlight search query in text
             * @param {string} text - The text to highlight
             * @param {string} query - The query to highlight
             * @returns {string} - HTML string with highlighted query
             */
            highlightText: function (text, query) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.highlightText(text, query) : text;
            },

            /**
             * Highlight query terms in text
             * @param {string} text - The text to highlight
             * @param {string} query - The query to highlight
             * @returns {string} - HTML string with highlighted query
             */
            highlightQueryTerms: function (text, query) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.highlightQueryTerms(text, query) : text;
            },

            /**
             * Get default thumbnail for a result
             * @param {object} result - The search result
             * @returns {string} - URL of the default thumbnail
             */
            getDefaultThumbnail: function (result) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.getDefaultThumbnail(result) : '';
            },

            /**
             * Get icon for a result
             * @param {object} result - The search result
             * @returns {string} - HTML content of the icon
             */
            getIconForResult: function (result) {
                return window.ResultDisplayUtils ?
                    window.ResultDisplayUtils.getIconForResult(result) : '';
            },

            /**
             * Add a wiki to the user's collection
             * @param {object} result - The search result
             */
            addWikiToCollection: function (result) {
                console.log('Adding wiki to collection:', result);
            }
        };

        // Initialize the module when loaded
        ResultDisplay.init();

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            try {
                window.ModuleRegistry.register('ResultDisplay', ResultDisplay);
            } catch (error) {
                console.error('Error registering ResultDisplay with ModuleRegistry:', error);
            }
        }

        // Make it globally available
        window.ResultDisplay = ResultDisplay;
    } else {
        // Module already exists, ensure it's initialized
        if (!window.ResultDisplay._initialized && typeof window.ResultDisplay.init === 'function') {
            window.ResultDisplay.init();
        }
    }

    console.log('ResultDisplay module loaded (Facade)');

})();