/**
 * Connectivity Test Module (Facade)
 * 
 * Tests connectivity to the internet and specific services.
 * Orchestrates ConnectivityCore, ConnectivityDiagnostics, and ConnectivityStatusUpdater.
 * 
 * @version 1.2.0 (Refactored)
 */

const ConnectivityTest = {
    version: '1.2.0',
    _initialized: false,

    // Legacy support: Proxy properties to Core
    get _connectionStatus() { return window.ConnectivityCore ? ConnectivityCore._connectionStatus : {}; },
    get _testResults() { return window.ConnectivityCore ? ConnectivityCore._testResults : {}; },
    get _functional() { return true; },

    /**
     * Initialize the module
     */
    init: function () {
        if (this._initialized) return this;
        console.log('ConnectivityTest (Facade): Initializing');

        // Ensure sub-modules are initialized
        // Ensure sub-modules are initialized
        if (window.ConnectivityCore && typeof ConnectivityCore.init === 'function') {
            ConnectivityCore.init();
        }

        // Set up online/offline detection listeners here
        // We handle listeners here to orchestrate the updates
        window.addEventListener('online', () => {
            console.log('Connection status: Online');
            if (window.ConnectivityCore) ConnectivityCore.setOnlineStatus(true);
            this.testConnection();
        });

        window.addEventListener('offline', () => {
            console.log('Connection status: Offline');
            if (window.ConnectivityCore) ConnectivityCore.setOnlineStatus(false);
            // We might want to trigger an update even offline to disable features
            this.updateModuleStatuses();
        });

        // Run an initial connection test
        this.testConnection();

        this._initialized = true;
        window.ConnectivityTest = this;
        return this;
    },

    /**
     * Test connection to the internet and specific services
     */
    testConnection: async function () {
        if (!window.ConnectivityCore) {
            console.warn('ConnectivityTest: ConnectivityCore not found');
            return {};
        }

        const status = await ConnectivityCore.runTests();

        // Update other modules
        this.updateModuleStatuses(status);

        return status;
    },

    /**
     * Update other modules based on status
     */
    updateModuleStatuses: function (statusVal) {
        if (window.ConnectivityStatusUpdater) {
            ConnectivityStatusUpdater.updateModules(statusVal || (window.ConnectivityCore ? ConnectivityCore.getStatus() : null));
        }
    },

    /**
     * Get the current connection status
     */
    getStatus: function () {
        return window.ConnectivityCore ? ConnectivityCore.getStatus() : {};
    },

    /**
     * Run a diagnostic test
     */
    diagnose: async function () {
        if (window.ConnectivityDiagnostics) {
            return await ConnectivityDiagnostics.diagnose();
        }
        console.warn('ConnectivityDiagnostics module not found');
        return null;
    },

    /**
     * Run a comprehensive connectivity test and fix modules
     */
    runComprehensiveTest: async function () {
        console.log('Running comprehensive connectivity test');
        const status = await this.testConnection();

        // Fix CORSProxyManager
        if (window.CORSProxyManager && typeof CORSProxyManager.testAllProxies === 'function') {
            await CORSProxyManager.testAllProxies();
        }

        // Fix DirectSearch
        if (window.DirectSearch) {
            if (typeof DirectSearch.checkFunctionality === 'function') {
                await DirectSearch.checkFunctionality();
            }
            if (!DirectSearch._functional && typeof DirectSearch.setupFallbackMethods === 'function') {
                DirectSearch.setupFallbackMethods();
            }
        }

        // Final update
        this.updateModuleStatuses(status);
        console.log('Comprehensive connectivity test completed');
    },

    /**
     * Legacy proxy methods
     */
    testUrl: async function (url, supportsOrigin) {
        return window.ConnectivityCore ? await ConnectivityCore.testUrl(url, supportsOrigin) : false;
    },

    testGoogleJsRendering: async function () {
        return window.ConnectivityCore ? await ConnectivityCore.testGoogleJsRendering() : {};
    },

    testGoogleConnectivity: async function () {
        return window.ConnectivityCore ? await ConnectivityCore.testGoogleConnectivity() : {};
    },

    updateTestResult: function (key, value) {
        if (window.ConnectivityCore) ConnectivityCore.updateTestResult(key, value);
    }
};

// Register
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConnectivityTest', ConnectivityTest);
}

// Initialize
ConnectivityTest.init();

// Global Exports
window.runConnectivityTest = () => ConnectivityTest.testConnection();
window.runConnectivityDiagnostic = () => ConnectivityTest.diagnose();
window.runComprehensiveConnectivityTest = () => ConnectivityTest.runComprehensiveTest();

console.log('ConnectivityTest module loaded.');