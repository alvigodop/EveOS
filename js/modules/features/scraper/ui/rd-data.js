/**
 * Result Display Data Module
 * 
 * Handles data processing for result display (grouping, content types)
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ResultDisplayData = {
        /**
         * Group results by the specified property
         * @param {Array} results - The search results
         * @param {string} groupBy - The property to group by
         * @param {object} context - Context object containing references to other methods if needed
         * @returns {object} - Object with groups as keys and arrays of results as values
         */
        groupResults: function (results, groupBy, context = {}) {
            const grouped = {};

            results.forEach(result => {
                let groupKey = '';

                switch (groupBy) {
                    case 'source':
                        groupKey = result.source || 'Unknown';
                        break;
                    case 'type':
                        groupKey = result.type || 'Other';
                        break;
                    case 'domain':
                        groupKey = result.domain ||
                            (result.url ? new URL(result.url).hostname : 'Unknown');
                        break;
                    case 'wiki':
                        groupKey = result.domain || 'Unknown';
                        break;
                    case 'contentType':
                        // Prioritize the pre-calculated contentType from the result object
                        groupKey = result.contentType ? result.contentType : this.getContentType(result);
                        break;
                    default:
                        groupKey = 'All Results';
                }

                // Initialize group if it doesn't exist
                if (!grouped[groupKey]) {
                    grouped[groupKey] = [];
                }

                // Add result to group
                grouped[groupKey].push(result);
            });

            return grouped;
        },

        /**
         * Get content type for a result
         * @param {object} result - The search result
         * @returns {string} - Content type category
         */
        getContentType: function (result) {
            if (result.type === 'fandom') return 'wikis';
            if (result.type === 'category') return 'categories';
            if (result.type === 'image' || result.thumbnailUrl) return 'images';
            return 'articles';
        },

        /**
         * Format group name for display
         * @param {string} groupName - The raw group name
         * @param {string} groupBy - The grouping type
         * @returns {string} - Formatted group name
         */
        formatGroupName: function (groupName, groupBy) {
            // Special formatting for certain group types
            switch (groupBy) {
                case 'source':
                    if (groupName === 'wikipedia') return 'Wikipedia';
                    if (groupName === 'fandom') return 'Fandom Wikis';
                    break;
                case 'type':
                    if (groupName === 'article') return 'Articles';
                    if (groupName === 'category') return 'Categories';
                    if (groupName === 'fandom') return 'Fandom Wikis';
                    break;
                case 'contentType':
                    if (groupName === 'articles') return 'Articles';
                    if (groupName === 'categories') return 'Categories';
                    if (groupName === 'images') return 'Images';
                    if (groupName === 'wikis') return 'Wikis';
                    break;
            }

            // Default formatting: capitalize first letter of each word
            return groupName.split(/[\s-_]+/).map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        }
    };

    // Make it globally available
    window.ResultDisplayData = ResultDisplayData;

})();
