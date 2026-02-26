/**
 * Data Manager Module (Facade)
 * Handles data import/export and global data management operations
 * Delegates to specialized components
 */
const DataManager = {};

/**
 * Initialize the Data Manager
 */
DataManager.init = function () {
    console.log('Initializing DataManager (Facade)...');

    // Check if sub-modules are loaded
    if (window.DMExport && typeof DMExport.init === 'function') {
        DMExport.init();
        DMExport._initialized = true;
    }
    if (window.DMImport && typeof DMImport.init === 'function') {
        DMImport.init();
        DMImport._initialized = true;
    }
    if (window.DMReset && typeof DMReset.init === 'function') {
        DMReset.init();
        DMReset._initialized = true;
    }
    if (window.DMUtils && typeof DMUtils.init === 'function') {
        DMUtils.init();
        DMUtils._initialized = true;
    }

    this._initialized = true;
    return this;
};

// -- Delegation to DMExport --

/**
 * Export all application data to a JSON file
 */
DataManager.exportData = function () {
    if (window.DMExport) {
        return DMExport.exportData();
    } else {
        console.error('DataManager: DMExport module not loaded');
        this._showToast('Export module not loaded', 'error');
        return false;
    }
};

/**
 * Show export dialog
 * @private
 */
DataManager._showExportDialog = function (jsonStr, filename) {
    if (window.DMExport) {
        return DMExport._showExportDialog(jsonStr, filename);
    }
};

// -- Delegation to DMImport --

/**
 * Import data from a JSON file
 * @param {File} file - The file to import
 */
DataManager.importData = function (file) {
    if (window.DMImport) {
        return DMImport.importData(file);
    } else {
        console.error('DataManager: DMImport module not loaded');
        this._showToast('Import module not loaded', 'error');
    }
};

// -- Delegation to DMReset --

/**
 * Clear all application data
 */
DataManager.clearData = function () {
    if (window.DMReset) {
        return DMReset.clearData();
    } else {
        console.error('DataManager: DMReset module not loaded');
        this._showToast('Reset module not loaded', 'error');
    }
};

/**
 * Show confirm dialog
 * @private
 */
DataManager._showConfirmDialog = function (title, message, onConfirm) {
    if (window.DMReset) {
        return DMReset._showConfirmDialog(title, message, onConfirm);
    }
};

// -- Delegation to DMUtils --

/**
 * Show toast notification
 * @private (but widely used)
 */
DataManager._showToast = function (msg, type = 'info') {
    if (window.DMUtils) {
        return DMUtils.showToast(msg, type);
    } else {
        console.warn('DataManager: DMUtils not loaded, using fallback console log');
        console.log(`[TOAST-${type}]: ${msg}`);
    }
};

// Register module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DataManager', DataManager);
}

window.DataManager = DataManager;
console.log('DataManager module loaded (Facade)');

// Auto-initialize
if (DataManager.init) DataManager.init();
