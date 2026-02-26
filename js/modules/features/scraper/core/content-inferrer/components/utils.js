/**
 * Content Utils
 * Utility functions for content inference and display
 */
const ContentUtils = {
    /**
     * Gets the appropriate icon emoji for a content type.
     * @param {string} contentType - The content type (e.g., 'character', 'location', 'story').
     * @returns {string} An emoji icon representing the content type.
     */
    getContentTypeIcon: function (contentType) {
        if (!contentType) return '📄';
        const type = contentType.toLowerCase();
        switch (type) {
            case 'character':
            case 'fictional-character':
                return '👤';
            case 'location':
                return '🗺️';
            case 'story':
                return '📖';
            case 'person':
            case 'real-person':
                return '👨‍💼';
            case 'technique':
                return '⚔️';
            case 'item':
                return '🔧';
            case 'manga':
                return '📚';
            case 'web novel':
                return '📝';
            case 'list':
                return '📋';
            case 'disambiguation':
                return '🔀';
            case 'category':
                return '🏷️';
            default:
                return '📄';
        }
    },

    /**
     * Creates a short snippet from text, ideally containing the query term.
     * @param {string} text - The full text content.
     * @param {string} query - The search query term.
     * @param {number} [maxLength=250] - Max length of the snippet.
     * @returns {string} The generated snippet.
     */
    createSnippet: function (text, query, maxLength = 250) {
        if (!text) return '';
        text = text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
        const queryLower = query ? query.toLowerCase() : '';
        let snippet = '';

        if (queryLower) {
            const textLower = text.toLowerCase();
            const queryIndex = textLower.indexOf(queryLower);

            if (queryIndex !== -1) {
                // Try to center the snippet around the query term
                const start = Math.max(0, queryIndex - Math.floor(maxLength / 2));
                const end = Math.min(text.length, queryIndex + query.length + Math.floor(maxLength / 2));

                snippet = text.substring(start, end);

                // Add ellipses if snippet is truncated
                if (start > 0) snippet = '... ' + snippet;
                if (end < text.length) snippet = snippet + ' ...';

            } else {
                // If query not found, just take the beginning
                snippet = text.substring(0, maxLength);
                if (text.length > maxLength) snippet += ' ...';
            }
        } else {
            // No query, just take the beginning
            snippet = text.substring(0, maxLength);
            if (text.length > maxLength) snippet += ' ...';
        }

        // Basic HTML tag stripping (can be improved)
        snippet = snippet.replace(/<\/?[^>]+(>|$)/g, "");

        return snippet;
    }
};

window.ContentUtils = ContentUtils;
