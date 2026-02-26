/**
 * CORS Proxy Tester Module (Facade)
 * 
 * Handles testing of CORS proxies for connectivity and Google access.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - CPTCommon: Shared utilities.
 * - CPTTester: Core testing logic.
 * - CPTManager: High-level management and state.
 * 
 * @version 1.1.0-facade
 */

const CORSProxyTester = {
    version: '1.1.0-facade',
    _initialized: false,

    /**
     * Initialize the module
     */
    init: function () {
        if (this._initialized) return this;

        console.log('CORSProxyTester (Facade) initializing...');

        // Ensure sub-modules are ready (if they have init methods, though currently they are object literals)

        this._initialized = true;
        console.log('CORSProxyTester (Facade) initialized');
        return this;
    },

    /**
     * Get current testing status
     * Delegates to CPTManager
     */
    getStatus: function () {
        if (window.CPTManager) {
            return CPTManager.getStatus();
        }
        return {
            testingInProgress: false,
            error: 'CPTManager not loaded'
        };
    },

    /**
     * Test a single proxy for basic functionality
     * Delegates to CPTTester
     */
    testProxy: async function (proxyUrl, testTargetUrl = 'https://example.com') {
        if (window.CPTTester) {
            return await CPTTester.testProxy(proxyUrl, testTargetUrl);
        }
        console.error('CORSProxyTester: CPTTester module not loaded');
        return { working: false, error: 'Module not loaded' };
    },

    /**
     * Test if a proxy can access Google
     * Delegates to CPTTester
     */
    testGoogleAccess: async function (proxyUrl) {
        if (window.CPTTester) {
            return await CPTTester.testGoogleAccess(proxyUrl);
        }
        console.error('CORSProxyTester: CPTTester module not loaded');
        return { accessible: false, error: 'Module not loaded' };
    },

    /**
     * Test all proxies from a list
     * Delegates to CPTManager
     */
    testAllProxies: async function (proxies) {
        if (window.CPTManager) {
            return await CPTManager.testAllProxies(proxies);
        }
        console.error('CORSProxyTester: CPTManager module not loaded');
        return [];
    },

    /**
     * Test working proxies for Google access
     * Delegates to CPTManager
     */
    testGoogleAccessForProxies: async function (proxies) {
        if (window.CPTManager) {
            return await CPTManager.testGoogleAccessForProxies(proxies);
        }
        console.error('CORSProxyTester: CPTManager module not loaded');
        return [];
    }
};

// Check for legacy _constructProxyUrl use and warn
CORSProxyTester._constructProxyUrl = function (targetUrl, proxyBase) {
    console.warn('CORSProxyTester._constructProxyUrl is deprecated. Use CPTCommon.constructProxyUrl instead.');
    if (window.CPTCommon) {
        return CPTCommon.constructProxyUrl(targetUrl, proxyBase);
    }
    return null;
};

// Auto-initialize
CORSProxyTester.init();

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CORSProxyTester', CORSProxyTester);
}

// Expose globally
window.CORSProxyTester = CORSProxyTester;

console.log('CORSProxyTester (Facade) loaded');
