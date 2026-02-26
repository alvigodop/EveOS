/**
 * HTML Script Loader Module (Facade)
 * 
 * Delegates to LoadCore, LoadUI, LoadData, LoadMonitor.
 * Main entry point for script loading and page utilities.
 * 
 * @version 1.1.0-modular
 */
(function () {
    'use strict';

    // Create the facade
    const HtmlScriptLoader = {};

    /**
     * Initialize the HTML script loader
     */
    HtmlScriptLoader.init = function () {
        if (window.LoadCore && typeof LoadCore.init === 'function') {
            LoadCore.init();
        } else {
            console.error('LoadCore module not found');
        }
        this._initialized = true;
        return this;
    };

    /**
     * Set up event listeners for DOM loaded events
     */
    HtmlScriptLoader.setupEventListeners = function () {
        if (window.LoadCore) LoadCore.setupEventListeners();
    };

    /**
     * Set up a mutation observer to hide error sections 
     */
    HtmlScriptLoader.setupErrorSectionRemover = function () {
        if (window.LoadMonitor) LoadMonitor.setupErrorSectionRemover();
    };

    /**
     * Load scripts in proper order with cache busting
     */
    HtmlScriptLoader.loadScriptsInOrder = function () {
        if (window.LoadCore) LoadCore.loadScriptsInOrder();
    };

    /**
     * Check if running locally
     */
    HtmlScriptLoader.checkIfLocal = function () {
        return window.LoadCore ? LoadCore.checkIfLocal() : false;
    };

    /**
     * Utility function to dynamically load a script with timestamp
     */
    HtmlScriptLoader.addScriptWithTimestamp = function (src, async = true, defer = true) {
        if (window.LoadCore) LoadCore.addScriptWithTimestamp(src, async, defer);
    };

    /**
     * Promise-based script loader
     */
    HtmlScriptLoader.loadScript = function (url) {
        return window.LoadCore ? LoadCore.loadScript(url) : Promise.reject('LoadCore not loaded');
    };

    /**
     * Tab switching functionality
     */
    HtmlScriptLoader.switchTab = function (tabName) {
        if (window.LoadUI) LoadUI.switchTab(tabName);
    };

    /**
     * Show cache information
     */
    HtmlScriptLoader.showCache = function () {
        if (window.LoadData) LoadData.showCache();
    };

    /**
     * Clear all application data
     */
    HtmlScriptLoader.clearData = function () {
        if (window.LoadData) LoadData.clearData();
    };

    /**
     * Show a custom confirmation modal dialog
     */
    HtmlScriptLoader._showConfirmModal = function (title, message, onConfirm, onCancel) {
        if (window.LoadUI) LoadUI._showConfirmModal(title, message, onConfirm, onCancel);
    };

    /**
     * Show a toast notification
     */
    HtmlScriptLoader._showToast = function (message, type = 'info') {
        if (window.LoadUI) LoadUI._showToast(message, type);
    };

    /**
     * Close the data popup
     */
    HtmlScriptLoader.closeDataPopup = function () {
        if (window.LoadUI) LoadUI.closeDataPopup();
    };

    // Export utility functions to window for HTML access (maintain compatibility)
    window.switchTab = HtmlScriptLoader.switchTab;
    window.showCache = HtmlScriptLoader.showCache;
    window.clearData = HtmlScriptLoader.clearData;
    window.closeDataPopup = HtmlScriptLoader.closeDataPopup;
    window.loadScript = HtmlScriptLoader.loadScript;
    // Bind adds script to core context if needed, but here we just delegate
    window.addScriptWithTimestamp = function (src, async, defer) {
        HtmlScriptLoader.addScriptWithTimestamp(src, async, defer);
    };

    // Auto-register with ModuleRegistry if available
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('HtmlScriptLoader', HtmlScriptLoader);
    }

    // Make it globally available
    window.HtmlScriptLoader = HtmlScriptLoader;

    // Self-initialize (Core logic inside init handles dependency check somewhat, 
    // but modules might not be loaded yet if this runs too early. 
    // Usually ResourceLoader handles order. If standalone, might fail init.)
    // We defer slightly to ensure submodules loaded if simply included sequentially
    setTimeout(() => HtmlScriptLoader.init(), 0);

})();