/**
 * Connectivity Google Module (Facade)
 * 
 * Handles Google-specific connectivity testing including JavaScript rendering.
 * Delegates to sub-modules: Core, API, UI.
 * 
 * @version 1.1.0
 */

const ConnectivityGoogle = {
    version: '1.1.0',
    _initialized: false,

    /**
     * Initialize the module
     */
    init() {
        if (this._initialized) return this;
        console.log('ConnectivityGoogle (Facade) initializing...');

        // Initialize sub-modules if present (they usually auto-init, but good practice)
        if (window.ConnectivityGoogleCore && typeof ConnectivityGoogleCore.init === 'function') {
            ConnectivityGoogleCore.init();
            ConnectivityGoogleCore._initialized = true;
        }
        if (window.ConnectivityGoogleAPI && typeof ConnectivityGoogleAPI.init === 'function') {
            ConnectivityGoogleAPI.init();
            ConnectivityGoogleAPI._initialized = true;
        }
        if (window.ConnectivityGoogleUI && typeof ConnectivityGoogleUI.init === 'function') {
            ConnectivityGoogleUI.init();
            ConnectivityGoogleUI._initialized = true;
        }

        this._initialized = true;
        console.log('ConnectivityGoogle (Facade) initialized');
        return this;
    },

    /**
     * Get current test results
     */
    getTestResults() {
        if (window.ConnectivityGoogleCore) {
            return ConnectivityGoogleCore.getTestResults();
        }
        return {};
    },

    /**
     * Update a specific test result
     */
    updateTestResult(key, value) {
        if (window.ConnectivityGoogleCore) {
            ConnectivityGoogleCore.updateTestResult(key, value);
        }
    },

    /**
     * Test Google JavaScript rendering capability
     */
    async testJsRendering() {
        if (window.ConnectivityGoogleUI) {
            return await ConnectivityGoogleUI.testJsRendering();
        }
        // Fallback
        return {
            jsRenderingWorking: false,
            error: 'ConnectivityGoogleUI not loaded'
        };
    },

    /**
     * Test basic connectivity to Google (no proxy)
     */
    async testBasicConnectivity() {
        if (window.ConnectivityGoogleAPI) {
            return await ConnectivityGoogleAPI.testBasicConnectivity();
        }
        return { accessible: false, error: 'ConnectivityGoogleAPI not loaded' };
    },

    /**
     * Test if Google is accessible through a proxy
     */
    async testViaProxy(proxyUrl) {
        if (window.ConnectivityGoogleAPI) {
            return await ConnectivityGoogleAPI.testViaProxy(proxyUrl);
        }
        return { accessible: false, error: 'ConnectivityGoogleAPI not loaded' };
    },

    /**
     * Test Google connectivity (basic access and rendering capabilities)
     * Orchestrates the test suite.
     */
    async testConnectivity() {
        console.log('ConnectivityGoogle: Starting Google connectivity test suite');

        // Check if we're actively using Google CSE
        const isUsingGoogleCSE = document.getElementById('google-searchbox-container') !== null &&
            document.getElementById('google-results-container') !== null;

        if (isUsingGoogleCSE) {
            console.log('ConnectivityGoogle: Skipping Google connectivity tests because Google CSE is active');
            const results = {
                accessible: true,
                accessMethod: 'direct',
                jsRendering: true,
                jsRenderingRequired: true,
                captchaDetected: false,
                error: null
            };
            if (window.ConnectivityGoogleCore) {
                ConnectivityGoogleCore.updateTestResult('googleAccess', true);
                ConnectivityGoogleCore.updateTestResult('googleAccessMethod', 'direct');
                ConnectivityGoogleCore.updateTestResult('googleJsRendering', true);
            }
            return results;
        }

        // 1. Basic Connectivity
        let basicTest = { accessible: false };
        if (window.ConnectivityGoogleAPI) {
            basicTest = await ConnectivityGoogleAPI.testBasicConnectivity();
        }

        // 2. Proxy Fallback
        if (!basicTest.accessible) {
            console.log('ConnectivityGoogle: Basic Google access failed, trying proxy...');
            let proxyTest = { accessible: false };

            if (window.ConnectivityGoogleAPI) {
                proxyTest = await ConnectivityGoogleAPI.testViaProxy();
            }

            if (!proxyTest.accessible) {
                console.warn('ConnectivityGoogle: All Google access methods failed');
                return {
                    accessible: false,
                    accessMethod: 'none',
                    jsRendering: false,
                    jsRenderingRequired: true,
                    captchaDetected: basicTest.captchaDetected || proxyTest.captchaDetected,
                    error: proxyTest.error || basicTest.error
                };
            }

            basicTest.accessible = true;
            basicTest.accessMethod = 'proxy';
            basicTest.error = null;
        }

        // 3. JS Rendering (only if accessible)
        if (basicTest.accessible) {
            if (window.ConnectivityGoogleUI) {
                const renderingTest = await ConnectivityGoogleUI.testJsRendering();
                return {
                    accessible: basicTest.accessible,
                    accessMethod: basicTest.accessMethod,
                    jsRendering: renderingTest.jsRenderingWorking,
                    jsRenderingRequired: true,
                    captchaDetected: basicTest.captchaDetected,
                    error: renderingTest.error || basicTest.error
                };
            }
        }

        return basicTest;
    }
};

// Auto-initialize
ConnectivityGoogle.init();

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConnectivityGoogle', ConnectivityGoogle);
}

// Expose globally
window.ConnectivityGoogle = ConnectivityGoogle;

console.log('ConnectivityGoogle (Facade) loaded');
