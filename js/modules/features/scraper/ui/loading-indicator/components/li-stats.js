/**
 * Loading Indicator - Stats Rendering
 * Handles the phase-based stats text generation for the loading indicator.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const LIStats = {
        version: '1.0.0',

        init: function () {
            // Stats are stateless/calculated on fly
            this._initialized = true;
            return this;
        },

        /**
         * Generates status text based on phase and current result
         * @param {string} phase - Search phase (cache, fetch, process, links, found, init, error)
         * @param {string} title - Current result title (optional)
         * @param {string} fallbackMessage - Fallback message if no phase matches
         * @returns {string} - Generated status text
         */
        getStatusText: function (phase, title, fallbackMessage) {
            if (title) {
                // Truncate long titles for display
                const displayTitle = title.length > 35
                    ? title.substring(0, 32) + '...'
                    : title;

                // Show different prefix based on phase
                switch (phase) {
                    case 'cache':
                        return `📦 Cached: ${displayTitle}`;
                    case 'fetch':
                        return `🔄 Fetching: ${displayTitle}`;
                    case 'process':
                        return `⚙️ Processing: ${displayTitle}`;
                    case 'links':
                        return `🔗 Link: ${displayTitle}`;
                    case 'found':
                        return `✨ Found: ${displayTitle}`;
                    default:
                        return `→ ${displayTitle}`;
                }
            } else {
                // No current result - show phase-based message
                switch (phase) {
                    case 'cache':
                        return '📦 Checking cache...';
                    case 'fetch':
                        return '🔄 Fetching data...';
                    case 'process':
                        return '⚙️ Processing results...';
                    case 'links':
                        return '🔗 Scanning links...';
                    case 'init':
                        return '🚀 Starting search...';
                    case 'error':
                        return '❌ Error';
                    default:
                        return fallbackMessage || 'Searching...';
                }
            }
        },

        /**
         * Formats wiki search progress
         * @param {number} wikisSearched - Number of wikis searched
         * @param {number} totalWikis - Total wikis to search
         * @returns {string} - Formatted progress string
         */
        formatWikiProgress: function (wikisSearched, totalWikis) {
            return `${wikisSearched || 0}/${totalWikis || 0}`;
        }
    };

    // Expose globally
    window.LIStats = LIStats;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('LIStats', LIStats);
    }
})();
