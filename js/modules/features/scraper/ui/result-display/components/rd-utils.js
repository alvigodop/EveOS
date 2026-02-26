/**
 * Result Display Utils Module
 * 
 * Helper functions for result display (highlighting, formatting, etc.)
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const ResultDisplayUtils = {
        /**
         * Get default thumbnail for a result
         * @param {object} result - The search result
         * @returns {string} - URL of the default thumbnail
         */
        getDefaultThumbnail: function (result) {
            // Simple gray placeholder SVG
            return 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%20viewBox%3D%220%200%20200%20200%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20fill%3D%22%23cccccc%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20fill%3D%22%23666666%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
        },

        /**
         * Get icon for a result
         * @param {object} result - The search result
         * @returns {string} - HTML content of the icon
         */
        getIconForResult: function (result) {
            return '';
        },

        /**
         * Get a formatted source name for display
         * @param {object} result - The search result
         * @returns {string} - Formatted source name
         */
        getSourceName: function (result) {
            if (result.source === 'wikipedia') return 'Wikipedia';
            if (result.source === 'fandom' && result.domain) {
                // Convert fandom domain to readable name
                const domainParts = result.domain.split('.');
                if (domainParts.length > 1) {
                    return this.formatSourceName(domainParts[0]);
                }
                return this.formatSourceName(result.domain);
            }
            if (result.name) return result.name;

            return result.source ? this.formatSourceName(result.source) : 'Unknown';
        },

        /**
         * Format a source name for display
         * @param {string} source - The raw source name
         * @returns {string} - Formatted source name
         */
        formatSourceName: function (source) {
            // Split by non-word characters and capitalize each word
            return source.split(/[\s-_]+/).map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
        },

        /**
         * Highlight search query in text
         * @param {string} text - The text to highlight
         * @param {string} query - The query to highlight
         * @returns {string} - HTML string with highlighted query
         */
        highlightText: function (text, query) {
            if (!text || !query) return text;

            // Split query into words for better matching
            const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);

            // If no valid query words, return the original text
            if (queryWords.length === 0) return text;

            // Replace HTML tags to prevent XSS
            let safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Highlight each query word
            queryWords.forEach(word => {
                const regex = new RegExp(`(${word})`, 'gi');
                safeText = safeText.replace(regex, '<mark>$1</mark>');
            });

            return safeText;
        },

        /**
         * Highlight query terms in text
         * @param {string} text - The text to highlight
         * @param {string} query - The query to highlight
         * @returns {string} - HTML string with highlighted query
         */
        highlightQueryTerms: function (text, query) {
            if (!text || !query) return text;

            // First escape HTML to prevent XSS and ensure HTML tags don't display as text
            const escapeHtml = (unsafe) => {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            };

            // Escape the text first
            let safeText = escapeHtml(text);

            // Clean and normalize the query
            const cleanedQuery = query.toLowerCase().trim().replace(/[^\w\s-]/g, '');

            // Split query into words for better matching
            const queryWords = cleanedQuery.split(/\s+/).filter(word => word.length > 2);

            // If no valid query words, return the original text
            if (queryWords.length === 0) return safeText;

            // First highlight the full query if it's present (highest priority)
            if (cleanedQuery.length > 2) {
                const escapedFullQuery = cleanedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const fullQueryRegex = new RegExp(`(${escapedFullQuery})`, 'gi');
                safeText = safeText.replace(fullQueryRegex, '<span class="search-highlight">$1</span>');
            }

            // Sort words by length (longest first) to prevent nested highlights
            queryWords.sort((a, b) => b.length - a.length);

            // Then highlight individual words, avoiding already highlighted parts
            queryWords.forEach(word => {
                // Skip if word is too short or is the same as the full query
                if (word.length < 3 || word === cleanedQuery) return;

                // Split by existing highlights
                const parts = safeText.split('<span class="search-highlight">');
                let newText = parts[0];

                // Process each part
                for (let i = 1; i < parts.length; i++) {
                    const subParts = parts[i].split('</span>');
                    // Keep the highlighted part as is
                    newText += '<span class="search-highlight">' + subParts[0] + '</span>';

                    // Process remaining text
                    if (subParts.length > 1) {
                        // Escape special regex characters
                        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(${escapedWord})`, 'gi');
                        newText += subParts.slice(1).join('</span>').replace(regex, '<span class="search-highlight-secondary">$1</span>');
                    }
                }

                safeText = newText;
            });

            return safeText;
        }
    };

    // Make it globally available
    window.ResultDisplayUtils = ResultDisplayUtils;

})();
