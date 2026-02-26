/**
 * HTML Utils Module
 * Utility functions for handling HTML strings.
 * Extracted from ui-core.js
 */

const HtmlUtils = {
    version: '1.0.0',

    init: function () {
        console.log('HtmlUtils initialized');
        this._initialized = true;
        return this;
    },

    /**
     * Strips HTML tags from a string
     * @param {string} html - The HTML string to strip
     * @returns {string} - The stripped string
     */
    stripHtml: function (html) {
        if (!html) return '';
        return html.replace(/<\/?[^>]+(>|$)/g, '');
    },

    /**
     * Clean HTML snippets for safe display
     * @param {string} html - The HTML string to clean
     * @returns {string} - The cleaned string
     */
    cleanHtmlSnippet: function (html) {
        if (!html) return '';
        return html.replace(/<\/?[^>]+(>|$)/g, '');
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('HtmlUtils', HtmlUtils);
}

// Make globally available
window.HtmlUtils = HtmlUtils;

console.log('HtmlUtils module loaded');
