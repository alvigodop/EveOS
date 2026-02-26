/**
 * Status Data Module (Facade)
 * 
 * Handles data gathering and error formatting for module status.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - StatusDataCollector: Data gathering
 * - StatusDataFormatting: Error formatting
 * - StatusDataPreferences: User preferences
 * 
 * @version 1.1.0-facade
 */

const StatusData = {
    version: '1.1.0-facade',
    _initialized: false,

    /**
     * Initialize StatusData
     */
    init: function () {
        if (this._initialized) return;

        console.log('Initializing StatusData (Facade)');

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('StatusData', StatusData);
        }

        // Initialize sub-modules
        if (window.StatusDataCollector && typeof StatusDataCollector.init === 'function') {
            StatusDataCollector.init();
        }
        if (window.StatusDataFormatting && typeof StatusDataFormatting.init === 'function') {
            StatusDataFormatting.init();
        }
        if (window.StatusDataPreferences && typeof StatusDataPreferences.init === 'function') {
            StatusDataPreferences.init();
        }

        this._initialized = true;
    },

    /**
     * Get module status information
     * @param {Object} options - Options for status generation
     * @returns {Object} - Status information
     */
    getModuleStatusInfo: function (options = {}) {
        if (window.StatusDataCollector) {
            return StatusDataCollector.getModuleStatusInfo(options);
        }
        console.error('StatusDataCollector module missing');
        return {};
    },

    /**
     * Get module status information manually from window objects
     * @param {Object} info - Status information to populate
     */
    getModuleStatusManually: function (info) {
        if (window.StatusDataCollector) {
            StatusDataCollector.getModuleStatusManually(info);
        }
    },

    /**
     * Ensure errors are properly formatted
     */
    ensureErrorsFormatted: function () {
        if (window.StatusDataFormatting) {
            StatusDataFormatting.ensureErrorsFormatted();
        }
    },

    /**
     * Set and save CORS error visibility preference
     * @param {boolean} hide - Whether to hide CORS errors
     */
    setHideCorsErrors: function (hide) {
        if (window.StatusDataPreferences) {
            return StatusDataPreferences.setHideCorsErrors(hide);
        }
        return false;
    },

    /**
     * Permanently hide CORS errors and suppress existing ones
     */
    hideCorsErrorsPermanently: function () {
        if (window.StatusDataPreferences) {
            StatusDataPreferences.hideCorsErrorsPermanently();
        }
    }
};

// Expose to window
window.StatusData = StatusData;

// Register with ModuleRegistry
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('StatusData', StatusData);
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StatusData.init());
} else {
    StatusData.init();
}
