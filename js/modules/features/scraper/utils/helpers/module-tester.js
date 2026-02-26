/**
 * Module Tester
 * Utilities for testing module functionality
 * Extracted from ui-module-status.js
 */

const ModuleTester = {
    version: '1.0.0',
    _initialized: false,

    /**
     * Initialize ModuleTester
     */
    init: function () {
        this._initialized = true;
        return this;
    },

    /**
     * Test if a module is functioning properly based on its expected functionality
     * @param {Object} module - The module to test
     * @param {string} name - The name of the module
     * @returns {boolean} Whether the module is functional
     */
    testModuleFunctionality: function (module, name) {
        try {
            // Basic tests for common modules
            switch (name) {
                case 'UI':
                    return typeof module.showResultsContainer === 'function' || typeof module.hideResultsContainer === 'function';
                case 'WikiManager':
                    return typeof module.addWikiEntry === 'function' || typeof module.removeWikiEntry === 'function';
                case 'SearchManager':
                    return typeof module.search === 'function' || typeof module.processSearchResults === 'function';
                case 'PopupManager':
                    return typeof module.showPopup === 'function' || typeof module.closePopup === 'function';
                case 'TabManager':
                    return typeof module.switchTab === 'function' || typeof module.getCurrentSource === 'function';
                case 'CacheManager':
                case 'StorageManager':
                    return typeof module.get === 'function' || typeof module.set === 'function';
                case 'DirectSearch':
                    return typeof module.searchFandom === 'function' || typeof module.discover === 'function';
                case 'ResultDisplay':
                    return typeof module.displayResults === 'function' || typeof module.init === 'function';
                default:
                    // General test: has at least one non-init function
                    if (!module) return false;
                    const hasFunctions = Object.keys(module).some(key =>
                        typeof module[key] === 'function' && key !== 'init');
                    return hasFunctions;
            }
        } catch (e) {
            return false;
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleTester', ModuleTester);
}

// Make globally available
window.ModuleTester = ModuleTester;

// Self-initialize
ModuleTester.init();

// Expose global helper if needed (backward compatibility)
window.testModuleFunctionality = function (module, name) {
    return ModuleTester.testModuleFunctionality(module, name);
};
