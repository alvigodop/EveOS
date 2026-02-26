/**
 * BrowserEmulator Init Module
 * 
 * Handles module initialization and cleanup.
 */

(function () {
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before init module');
        return;
    }

    Object.assign(window.BrowserEmulator, {
        /**
         * Initialize the BrowserEmulator module
         * @param {Object} config - Optional configuration to override defaults
         * @returns {boolean} - Whether initialization was successful
         */
        init: function (config = {}) {
            console.log(`Initializing BrowserEmulator module v${this.version}`);

            // Merge provided config with defaults
            this._config = { ...this._config, ...config };

            // Check for dependencies
            if (window.fetch === undefined) {
                console.warn('BrowserEmulator: fetch API not available, falling back to XMLHttpRequest');
                if (this._setupFetchPolyfill) {
                    this._setupFetchPolyfill();
                }
            }

            // Initialize CORS Proxy Manager if available
            if (window.CORSProxyManager && typeof CORSProxyManager.init === 'function') {
                try {
                    CORSProxyManager.init();
                    // Get standard proxies from manager (assuming these can be used for rendering)
                    const additionalProxies = CORSProxyManager.getProxies();
                    if (additionalProxies && additionalProxies.length > 0) {
                        console.log(`BrowserEmulator: Adding ${additionalProxies.length} general CORS proxies from CORSProxyManager (may not all support JS rendering)`);
                        // Add only if they are not already in the list to avoid duplicates
                        additionalProxies.forEach(proxy => {
                            if (!this._jsRenderProxies.includes(proxy)) {
                                this._jsRenderProxies.push(proxy);
                            }
                        });
                    }
                } catch (error) {
                    console.warn('BrowserEmulator: Failed to initialize CORSProxyManager', error);
                }
            }

            // Set up event listeners for iframe method
            if (this._config.useIframeRendering && this._setupIframeListeners) {
                this._setupIframeListeners();
            }

            // Load stored successful proxies if enabled
            if (this._config.storeSuccessfulProxies && window.localStorage) {
                try {
                    const storedProxies = JSON.parse(localStorage.getItem('browserEmulator_successfulProxies'));
                    if (storedProxies && Array.isArray(storedProxies) && storedProxies.length > 0) {
                        console.log(`BrowserEmulator: Loaded ${storedProxies.length} stored successful proxies`);
                        this._proxyStats.successful = storedProxies;
                        // Prioritize successful proxies by moving them to the front
                        this._prioritizeSuccessfulProxies();
                    }
                } catch (error) {
                    console.warn('BrowserEmulator: Failed to load stored proxies', error);
                }
            }

            this._initialized = true;
            console.log('BrowserEmulator: Initialization complete');

            // Register browser test methods with ConnectivityTest if available
            if (window.ConnectivityTest && typeof ConnectivityTest.registerTestMethod === 'function') {
                ConnectivityTest.registerTestMethod('jsRendering', this.testJSRendering.bind(this));
            }

            return true;
        },

        /**
         * Clean up the module and release resources
         * @returns {boolean} - Whether cleanup was successful
         */
        cleanup: function () {
            // Clear any event listeners
            if (this._initialized) {
                // Store any state that needs to be persisted
                if (this._config.storeSuccessfulProxies && window.localStorage) {
                    try {
                        localStorage.setItem('browserEmulator_successfulProxies',
                            JSON.stringify(this._proxyStats.successful));
                    } catch (error) {
                        console.warn('BrowserEmulator: Failed to store successful proxies during cleanup', error);
                    }
                }

                // Clear cache
                this._renderCache = {};

                console.log('BrowserEmulator: Cleanup complete');
            }

            return true;
        }
    });

    console.log('BrowserEmulator: Init module loaded');

    // Auto-initialize if ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => window.BrowserEmulator.init(), 0);
    } else {
        document.addEventListener('DOMContentLoaded', () => window.BrowserEmulator.init());
    }
})();
