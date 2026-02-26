/**
 * Discovery UI Utils
 * Utility functions for search interface rendering
 */
const DUIUtils = {};

/**
 * Highlights search terms in text
 * @param {string} text - The text to highlight
 * @param {string} searchTerm - The search term
 * @returns {string} - Highlighted HTML
 */
DUIUtils.highlightSearchTerms = function (text, searchTerm) {
    if (!text || !searchTerm) return text || '';

    // Escape HTML
    const escapeHtml = (unsafe) => {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const escapedText = escapeHtml(text);
    const terms = searchTerm.toLowerCase().split(' ');

    let highlightedText = escapedText;

    // Highlight exact matches first
    const exactMatch = new RegExp(`(${escapeHtml(searchTerm)})`, 'gi');
    highlightedText = highlightedText.replace(exactMatch, '<b>$1</b>');

    // Then highlight individual terms
    terms.forEach(term => {
        if (term.length < 3) return; // Skip short terms

        const termRegex = new RegExp(`(${escapeHtml(term)})`, 'gi');
        // Only replace terms that aren't already highlighted
        highlightedText = highlightedText.replace(termRegex, (match, p1, offset) => {
            // Check if this match is already inside a <b> tag
            const prevText = highlightedText.substring(0, offset);
            const openTags = (prevText.match(/<b>/g) || []).length;
            const closeTags = (prevText.match(/<\/b>/g) || []).length;

            // If there are more opening tags than closing tags, we're inside a tag
            if (openTags > closeTags) {
                return match;
            } else {
                return `<b>${p1}</b>`;
            }
        });
    });

    return highlightedText;
};

// Ensure global availability
window.DUIUtils = DUIUtils;
console.log('[DUIUtils] Loaded');
