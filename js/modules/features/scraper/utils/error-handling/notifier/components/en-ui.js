/**
 * Error Notifier UI Component (Facade)
 * Orchestrates error notifications by delegating to ErrorNotifierUIRenderer.
 */
const ErrorNotifierUI = {
    /**
     * Initialize the UI component
     */
    init: function () {
        if (window.ErrorNotifierUIRenderer) {
            window.ErrorNotifierUIRenderer.init();
            console.log('ErrorNotifierUI (Facade) initialized');
        } else {
            console.error('ErrorNotifierUIRenderer not found');
        }
    },

    /**
     * Show an error notification with troubleshooting steps
     * @param {Object} options - Configuration options
     * @returns {HTMLElement} The notification element
     */
    showError: function (options) {
        if (window.ErrorNotifierUIRenderer) {
            return window.ErrorNotifierUIRenderer.render(options);
        } else {
            console.error('ErrorNotifierUIRenderer not found, cannot show error:', options);
            return null;
        }
    },

    /**
     * Create CSS styles for notifications
     * @private
     */
    _createStyles: function () {
        // Delegated to Renderer in init(), but kept for compatibility
        if (window.ErrorNotifierUIRenderer && typeof window.ErrorNotifierUIRenderer._createStyles === 'function') {
            window.ErrorNotifierUIRenderer._createStyles();
        }
    }
};

window.ErrorNotifierUI = ErrorNotifierUI;
