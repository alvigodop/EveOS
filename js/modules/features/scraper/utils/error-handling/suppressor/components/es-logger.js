/**
 * Error Suppressor - Logger Component
 * 
 * Handles error reporting to the UI.
 * 
 * @version 1.0.0
 */

const ESLogger = {
    /**
     * Report an error to the UI Monitor
     * @param {string} message - Error message
     * @param {string} category - Error category
     * @param {string} source - Error source
     */
    reportError: function (message, category = 'Error', source = '') {
        // Send directly to the Search Monitor
        if (window.UI && typeof UI.showErrorInMonitor === 'function') {
            const displayMessage = source ? `${category}: ${message} (${source})` : `${category}: ${message}`;
            UI.showErrorInMonitor(displayMessage);
        } else {
            // Fallback if UI is not ready
            // console.warn('ErrorSuppressor: UI Monitor not ready. Error:', message);
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ESLogger', ESLogger);
}

window.ESLogger = ESLogger;
