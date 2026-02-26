/**
 * Fandom Search Components - Utils
 * Handles text normalization and formatting.
 */
(function () {
    'use strict';

    // Ensure namespace exists
    window.FandomSearch = window.FandomSearch || {};
    const FandomSearch = window.FandomSearch;

    /**
     * Normalizes a search term by trimming, converting to lowercase, and removing excessive spaces
     * @param {string} searchTerm - The search term to normalize
     * @returns {string} - The normalized search term
     */
    FandomSearch.normalizeSearchTerm = function (searchTerm) {
        return searchTerm
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' '); // Replace multiple spaces with a single space
    };

    /**
     * Prepares search terms by splitting into individual words and creating a search terms object
     * @param {string} searchTerm - The normalized search term
     * @returns {Object} - Object with original term and array of individual terms
     */
    FandomSearch.prepareSearchTerms = function (searchTerm) {
        // Split the search term into individual words for multi-word searches
        const terms = searchTerm
            .split(' ')
            .filter(term => term.length > 0);

        return {
            original: searchTerm,
            terms: terms
        };
    };

    /**
     * Format a search term into a wiki name
     * @private
     * @param {string} searchTerm - The search term to format
     * @returns {string} Formatted wiki name
     */
    FandomSearch._formatWikiName = function (searchTerm) {
        if (!searchTerm) return 'Unnamed Wiki';

        // Format the display name
        const displayName = searchTerm.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        return `${displayName} Wiki`;
    };

    console.log('[FandomSearch.Utils] Loaded');
})();
