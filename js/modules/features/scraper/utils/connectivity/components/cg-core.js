/**
 * Connectivity Google - Core Module
 * Manages state and test results for Google connectivity.
 */
const ConnectivityGoogleCore = {
    version: '1.0.0',
    _initialized: false,

    // Test results state
    _testResults: {
        directAccessGoogle: false,
        googleAccessible: false,
        googleAccessibleViaProxy: false,
        workingGoogleProxy: null,
        googleCaptcha: false,
        googleJsRendering: false,
        googleRequiresJsRendering: true,
        googleRenderingEnabled: false
    },

    /**
     * Initialize the core module
     */
    init: function () {
        if (this._initialized) return;
        console.log('ConnectivityGoogleCore initialized');
        this._initialized = true;

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('ConnectivityGoogleCore', ConnectivityGoogleCore);
        }
    },

    /**
     * Get current test results
     */
    getTestResults: function () {
        return { ...this._testResults };
    },

    /**
     * Update a specific test result
     */
    updateTestResult: function (key, value) {
        if (this._testResults && key) {
            this._testResults[key] = value;
            console.log(`ConnectivityGoogle: Updated test result ${key} = ${value}`);
        }
    }
};

// Initialize
if (typeof window !== 'undefined') {
    window.ConnectivityGoogleCore = ConnectivityGoogleCore;
    // Auto-init on load
    ConnectivityGoogleCore.init();
}
