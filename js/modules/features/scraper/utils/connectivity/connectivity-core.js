/**
 * Connectivity Core Module
 * 
 * Handles the actual connectivity testing logic and state.
 * Use this module to check connection status without side effects.
 * 
 * @version 1.0.0
 */

const ConnectivityCore = {
    _initialized: false,

    // Test URLs
    _testUrls: {
        wikipedia: 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=general&format=json&origin=*',
        fandom: 'https://www.fandom.com',
        google: 'https://www.google.com',
        general: 'https://httpbin.org/get'
    },

    // Connection test results
    _connectionStatus: {
        online: navigator.onLine,
        lastCheck: null,
        canAccessWikipedia: false,
        canAccessFandom: false,
        canAccessGeneral: false,
        canAccessGoogle: false,
        needsCorsProxy: true
    },

    // Test results for specific services
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
        this._initialized = true;
        console.log('ConnectivityCore: Initialized');

        // Initial online status
        this._connectionStatus.online = navigator.onLine;
        return this;
    },

    /**
     * Set online status manually (called by facade/listeners)
     * @param {boolean} isOnline 
     */
    setOnlineStatus: function (isOnline) {
        this._connectionStatus.online = isOnline;
        if (!isOnline) {
            this._connectionStatus.canAccessWikipedia = false;
            this._connectionStatus.canAccessFandom = false;
            this._connectionStatus.canAccessGeneral = false;
        }
    },

    /**
     * Run connectivity tests
     * @returns {Promise<Object>} The connection status object
     */
    runTests: async function () {
        // Skip test if we're offline
        if (!navigator.onLine) {
            this._connectionStatus.online = false;
            this._connectionStatus.lastCheck = new Date();
            console.log('ConnectivityCore: Test skipped (offline)');
            return this._connectionStatus;
        }

        console.log('ConnectivityCore: Testing internet connectivity...');

        // Update last check time
        this._connectionStatus.lastCheck = new Date();
        this._connectionStatus.online = true;

        // Check environment
        const isFileProtocol = location.protocol === 'file:';
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const skipProxyTests = isFileProtocol || isLocalhost;

        if (isFileProtocol) {
            console.log('ConnectivityCore: Running from file:// - skipping proxy tests');
        } else if (isLocalhost) {
            console.log('ConnectivityCore: Running on localhost - skipping proxy tests');
        }

        // Test each endpoint
        try {
            // Wikipedia test always runs
            this._connectionStatus.canAccessWikipedia = await this.testUrl(this._testUrls.wikipedia, true);
            console.log(`Wikipedia API access: ${this._connectionStatus.canAccessWikipedia ? 'Available' : 'Unavailable'}`);
        } catch (e) {
            console.warn('Wikipedia connectivity test failed:', e);
            this._connectionStatus.canAccessWikipedia = false;
        }

        // Skip proxy-dependent tests when running locally
        if (!skipProxyTests) {
            try {
                this._connectionStatus.canAccessFandom = await this.testUrl(this._testUrls.fandom);
                console.log(`Fandom access: ${this._connectionStatus.canAccessFandom ? 'Available' : 'Unavailable'}`);
            } catch (e) {
                console.warn('Fandom connectivity test failed:', e);
                this._connectionStatus.canAccessFandom = false;
            }

            try {
                this._connectionStatus.canAccessGeneral = await this.testUrl(this._testUrls.general);
            } catch (e) {
                this._connectionStatus.canAccessGeneral = false;
            }

            try {
                this._connectionStatus.canAccessGoogle = await this.testUrl(this._testUrls.google);
            } catch (e) {
                this._connectionStatus.canAccessGoogle = false;
            }
        } else {
            // Assume available for local dev
            this._connectionStatus.canAccessFandom = true;
            this._connectionStatus.canAccessGeneral = true;
            this._connectionStatus.canAccessGoogle = true;
        }

        // Determine if CORS proxy is needed
        this._connectionStatus.needsCorsProxy = !skipProxyTests && !(
            this._connectionStatus.canAccessWikipedia ||
            this._connectionStatus.canAccessFandom
        );

        console.log(`CORS proxy needed: ${this._connectionStatus.needsCorsProxy ? 'Yes' : 'No'}`);

        return this._connectionStatus;
    },

    /**
     * Test if a URL is accessible
     * @param {string} url 
     * @param {boolean} supportsOrigin 
     */
    testUrl: async function (url, supportsOrigin = false) {
        try {
            // Direct fetch if origin supported
            if (supportsOrigin) {
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store',
                    timeout: 5000
                });
                return response.ok;
            }

            // Use CORS Proxy if available
            if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                try {
                    const response = await CORSProxyManager.fetch(url, {
                        method: 'GET',
                        cache: 'no-store',
                        timeout: 5000
                    });
                    return response.ok;
                } catch (e) {
                    // Fall through
                }
            }

            // Fallback: no-cors HEAD request
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store',
                timeout: 5000
            });
            return true; // Opulence response implies success
        } catch (error) {
            return false;
        }
    },

    /**
     * Update a specific test result
     */
    updateTestResult: function (key, value) {
        if (this._testResults && key) {
            this._testResults[key] = value;
        }
        // Sync with Google module if applicable
        if (window.ConnectivityGoogle && key.toLowerCase().includes('google')) {
            ConnectivityGoogle.updateTestResult(key, value);
        }
    },

    /**
     * Get current status
     */
    getStatus: function () {
        return { ...this._connectionStatus };
    },

    // Delegate methods for Google Connectivity

    async testGoogleJsRendering() {
        if (window.ConnectivityGoogle && typeof ConnectivityGoogle.testJsRendering === 'function') {
            const results = await ConnectivityGoogle.testJsRendering();
            this._testResults.googleJsRendering = results.jsRenderingWorking;
            this._testResults.directAccessGoogle = results.directAccessible;
            return results;
        }
        return { jsRenderingWorking: false, error: 'ConnectivityGoogle not available' };
    },

    async testGoogleConnectivity() {
        if (window.ConnectivityGoogle && typeof ConnectivityGoogle.testConnectivity === 'function') {
            const results = await ConnectivityGoogle.testConnectivity();
            this._testResults.googleAccessible = results.accessible;
            return results;
        }
        return { accessible: false, error: 'ConnectivityGoogle not available' };
    }
};

// Register
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('ConnectivityCore', ConnectivityCore);
}

window.ConnectivityCore = ConnectivityCore;
