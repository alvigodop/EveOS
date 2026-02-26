/**
 * Error Notifier Core Component
 * Logic and helpers for notification management.
 */
const ErrorNotifierCore = {
    /**
     * Initialize the core component
     */
    init: function () {
        console.log('ErrorNotifierCore initialized');
    },

    /**
     * Show a Google Search specific error notification
     * Uses ErrorNotifierUI to display the error.
     * @param {Object} options - Configuration options
     * @param {string} options.message - Error message
     * @param {boolean} [options.addFixButton] - Whether to add a fix button
     * @returns {HTMLElement} The notification element
     */
    showGoogleSearchError: function (options) {
        const { message, addFixButton = true } = options;

        // Ensure UI component is available
        if (window.ErrorNotifierUI && typeof ErrorNotifierUI.showError === 'function') {
            return ErrorNotifierUI.showError({
                title: 'Google Search Error',
                message: message || 'There was an issue with Google Search.',
                tips: [
                    'Check if your connection to Google is working',
                    'Try enabling Fandom Direct Search to get results',
                    'Try clearing your browser cache and cookies',
                    'The browser may be blocking JavaScript rendering for Google search'
                ],
                onFix: addFixButton ? window.fixGoogleSearch : null,
                fixText: 'Auto-Fix Google Search'
            });
        } else {
            console.error('ErrorNotifierUI not available for showing Google Search error');
            // Fallback log
            console.warn('Google Search Error:', message);
            return null;
        }
    }
};

window.ErrorNotifierCore = ErrorNotifierCore;
