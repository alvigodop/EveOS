/**
 * Error Notifier Module (Facade)
 * Displays user-friendly error messages and troubleshooting tips.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - ErrorNotifierUI: Handles rendering and styles.
 * - ErrorNotifierCore: Handles logic and helpers.
 * 
 * @version 1.0.0-facade
 */
const ErrorNotifier = {
    version: '1.0.0-facade',
    _initialized: false,

    /**
     * Initialize the error notifier
     */
    init: function () {
        if (this._initialized) return;

        console.log('ErrorNotifier (Facade) initializing...');

        // Initialize components
        if (window.ErrorNotifierUI && typeof ErrorNotifierUI.init === 'function') {
            ErrorNotifierUI.init();
        }

        if (window.ErrorNotifierCore && typeof ErrorNotifierCore.init === 'function') {
            ErrorNotifierCore.init();
        }

        this._initialized = true;
    },

    /**
     * Show an error notification with troubleshooting steps
     * @param {Object} options - Configuration options
     * @returns {HTMLElement} The notification element
     */
    showError: function (options) {
        if (window.ErrorNotifierUI) {
            return ErrorNotifierUI.showError(options);
        } else {
            console.error('ErrorNotifierUI not loaded');
            // Fallback: simpler alert if critical UI is missing
            console.warn('Error Notifier Fallback:', options.message);
            return null;
        }
    },

    /**
     * Show a Google Search specific error notification
     * @param {Object} options - Configuration options
     * @returns {HTMLElement} The notification element
     */
    showGoogleSearchError: function (options) {
        if (window.ErrorNotifierCore) {
            return ErrorNotifierCore.showGoogleSearchError(options);
        } else {
            console.error('ErrorNotifierCore not loaded');
            return null;
        }
    }
};

// Initialize when the document is ready
if (document.readyState === 'complete') {
    ErrorNotifier.init();
} else {
    window.addEventListener('DOMContentLoaded', () => {
        ErrorNotifier.init();
    });
}

// Expose module globally
window.ErrorNotifier = ErrorNotifier; 