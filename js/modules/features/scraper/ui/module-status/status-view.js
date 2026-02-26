/**
 * Status View
 * HTML generation for module status display
 * Refactored to delegate to StatusHTMLGenerator
 * 
 * @version 1.0.1
 */

const StatusView = {
    version: '1.0.1',
    _initialized: false,

    /**
     * Initialize StatusView
     */
    init: function () {
        this._initialized = true;
        return this;
    },

    /**
     * Generate the status content HTML
     * @param {Object} statusInfo - The module status information
     * @returns {string} - The HTML content
     */
    generateStatusContent: function (statusInfo) {
        if (window.StatusHTMLGenerator) {
            return window.StatusHTMLGenerator.generateStatusContent(statusInfo);
        } else {
            console.error('StatusHTMLGenerator not loaded');
            return '<div class="error">Status view components not loaded.</div>';
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('StatusView', StatusView);
}

// Make globally available
window.StatusView = StatusView;

// Self-initialize
StatusView.init();
