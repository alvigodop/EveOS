/**
 * Result Display Filter Module
 * 
 * Handles filtering of search results, including specific logic for
 * Fandom discovery mode.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ResultDisplayFilter = {
        /**
         * Filter results based on options and mode
         * @param {Array} results - The raw search results
         * @param {object} options - Display options
         * @param {string} containerSelector - Selector of the container (used for contextual filtering)
         * @returns {Array} - Filtered results
         */
        filterResults: function (results, options, containerSelector) {
            let filteredResults = results;

            // Special filter for discovery mode - ONLY show main community pages
            if (options.mode === 'discovery' || (containerSelector && containerSelector.includes('discovery'))) {
                filteredResults = this._applyDiscoveryFilter(results);
            }

            return filteredResults;
        },

        /**
         * Apply specific filters for Fandom Discovery mode
         * @param {Array} results - Raw results
         * @returns {Array} - Filtered results (main community pages only)
         */
        _applyDiscoveryFilter: function (results) {
            console.log('Applying Fandom community filter for discovery mode');

            // Filter to only include main community pages and valid wiki domains
            const filtered = results.filter(result => {
                // Must have domain property
                if (!result.domain) return false;

                // Must be a fandom.com or wikia.com domain
                if (!result.domain.includes('fandom.com') && !result.domain.includes('wikia.com')) {
                    return false;
                }

                // Filter out known non-community subdomains
                if (result.domain === 'www.fandom.com' ||
                    result.domain === 'community.fandom.com' ||
                    result.domain === 'api.fandom.com') {
                    return false;
                }

                // Check for main community flag if it exists
                if (result.isMainCommunity === false) {
                    return false;
                }

                // Prefer results with community type
                if (result.type === 'community') {
                    return true;
                }

                // Accept results without explicit type field
                return true;
            });

            console.log(`Filtered to ${filtered.length} main Fandom community results`);
            return filtered;
        }
    };

    window.ResultDisplayFilter = ResultDisplayFilter;

})();
