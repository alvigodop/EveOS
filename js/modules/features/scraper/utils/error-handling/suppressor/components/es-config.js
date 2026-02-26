/**
 * Error Suppressor - Configuration Component
 * 
 * Manages configuration and error filtering patterns.
 * 
 * @version 1.0.0
 */

const ESConfig = {
    defaults: {
        // General configuration
        ignoreNonCriticalErrors: true,

        // Error type configuration
        suppressCORSErrors: true,
        suppressNetworkErrors: true,
        suppressModuleLoadErrors: true,
        suppressResourceLoadErrors: true,
        suppressConsoleErrors: false,

        // Categories to suppress
        suppressCategories: [
            'CORS', 'Network', 'Resource', 'Module', 'Render', 'Timeout', 'External'
        ],

        // Error messages to ignore (regular expressions)
        ignorePatterns: [
            /favicon\.ico/i,
            /Script error\./i,
            /ResizeObserver loop/i,
            /Loading chunk \d+ failed/i,
            /Component of type .* is missing/i,
            /Cannot register GlobalFix/i,
            /Missing critical modules/i,
            /An iframe which has both allow-scripts and allow-same-origin/i,
            /searchbox is missing/i,
            /results is missing/i,
            /Identifier 'ErrorSuppressor' has already been declared/i,
            // Fandom / Ad-related patterns
            /googletag/i,
            /gpt\.js/i,
            /tracking/i,
            /beacon/i,
            /quantcast/i,
            /prebid/i,
            /bidders/i,
            /scorecardresearch/i,
            /moatpixel/i,
            /gumgum/i,
            /amazon-ad-system/i,
            /Invalid request url: file:/i, // "Local Context" file:// protocol errors
            /blocked by client/i,
            /Slot .* not found/i,
            /Odyssey/i,
            /Bad Request/i // Generic bad requests from trackers
        ]
    },

    /**
     * Check if an error should be ignored based on config
     * @param {Object} eventOrMessage - The error event or message string
     * @param {Object} currentConfig - The active configuration
     * @returns {boolean} - Whether the error should be ignored
     */
    shouldIgnore: function (eventOrMessage, currentConfig) {
        const config = currentConfig || this.defaults;

        // Handle event vs string
        let errorMessage = 'Unknown error';
        if (typeof eventOrMessage === 'string') {
            errorMessage = eventOrMessage;
        } else if (eventOrMessage && typeof eventOrMessage === 'object') {
            errorMessage = eventOrMessage.message ||
                (eventOrMessage.reason ? (eventOrMessage.reason.message || String(eventOrMessage.reason)) : '') ||
                'Unknown error';
        }

        // Check against ignore patterns
        for (const pattern of config.ignorePatterns) {
            if (pattern.test(errorMessage)) {
                return true;
            }
        }

        return false;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ESConfig', ESConfig);
}

window.ESConfig = ESConfig;
