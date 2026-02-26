/**
 * API Test Script (Facade)
 * 
 * Tests connectivity to key API endpoints used by the application.
 * Provides diagnostics for CORS issues and proxy availability.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - ApiTestConnectivity: Connectivity testing
 * - ApiTestDiagnostics: Diagnostic tools
 * - ApiTestInfo: System information
 * 
 * @version 1.2.0-facade
 */

const ApiTest = {
    version: '1.2.0-facade',
    _initialized: false,

    init: function () {
        console.log('Initializing ApiTest module (Facade)');
        this._initialized = true;

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('ApiTest', ApiTest);
        }

        // Initialize sub-modules
        if (window.ApiTestConnectivity && typeof ApiTestConnectivity.init === 'function') {
            ApiTestConnectivity.init();
        }
        if (window.ApiTestDiagnostics && typeof ApiTestDiagnostics.init === 'function') {
            ApiTestDiagnostics.init();
        }
        if (window.ApiTestInfo && typeof ApiTestInfo.init === 'function') {
            ApiTestInfo.init();
        }

        // Make the test function available globally
        window.testApiConnectivity = this.testApiConnectivity.bind(this);
        window.diagnoseConnectivity = this.diagnoseConnectivity.bind(this);

        return this;
    },

    /**
     * Test API connectivity to critical endpoints
     * @returns {Promise<Object>} Test results
     */
    testApiConnectivity: async function () {
        if (window.ApiTestConnectivity) {
            return ApiTestConnectivity.testApiConnectivity();
        }
        console.error('ApiTestConnectivity module missing');
        return { success: 0, failure: 0, details: [] };
    },

    /**
     * Run a comprehensive CORS diagnostic test
     * @returns {Promise<Object>} Diagnostic results
     */
    diagnoseConnectivity: async function () {
        if (window.ApiTestDiagnostics) {
            return ApiTestDiagnostics.diagnoseConnectivity();
        }
        console.error('ApiTestDiagnostics module missing');
        return null;
    },

    /**
     * Get browser information
     * @returns {Object} Browser information
     */
    getBrowserInfo: function () {
        if (window.ApiTestInfo) {
            return ApiTestInfo.getBrowserInfo();
        }
        return {};
    },

    /**
     * Get network information
     * @returns {Promise<Object>} Network information
     */
    getNetworkInfo: async function () {
        if (window.ApiTestInfo) {
            return ApiTestInfo.getNetworkInfo();
        }
        return {};
    }
};

// Initialize the module
ApiTest.init();

// Export globally
window.ApiTest = ApiTest;

// Run the test automatically if auto-test flag is set
if (window.AUTO_TEST_API) {
    if (document.readyState === 'complete') {
        window.testApiConnectivity();
    } else {
        window.addEventListener('load', () => {
            window.testApiConnectivity();
        });
    }
}

console.log('API test functions loaded. Run window.testApiConnectivity() or window.diagnoseConnectivity() to test connectivity.');