/**
 * Direct Search Core Module
 * 
 * Handles initialization, connectivity testing, and global state for Direct Search.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.DirectSearchCore) {
        const DirectSearchCore = {
            version: '1.0.0',
            _initialized: false,
            _functional: true, // Always start as functional and maintain this state
            _offlineMode: false, // Track if we're in offline mode

            /**
             * Initialize the module
             */
            init: function () {
                console.log('Initializing DirectSearchCore module');

                // Even though we have fallbacks, also do connectivity testing
                // to see if we can use online features
                setTimeout(() => {
                    this.checkFunctionality()
                        .then(isWorking => {
                            console.log(`DirectSearch functionality check completed: ${isWorking ? 'Functional (online)' : 'Functional (offline mode)'}`);
                            this._offlineMode = !isWorking;
                            // Always remain functional since we have fallbacks
                            this._functional = true;
                        })
                        .catch(err => {
                            console.error('Error during DirectSearch functionality check:', err);
                            this._offlineMode = true;
                            // Always remain functional
                            this._functional = true;
                        });
                }, 1000);

                this._initialized = true;
                return this;
            },

            /**
             * Check if the module is functional - now returns a promise for better async handling
             * This only tests online functionality, fallbacks ensure we're always functional
             * @returns {Promise<boolean>} Whether online functionality is available
             */
            checkFunctionality: async function () {
                try {
                    console.log('Checking DirectSearch online functionality');

                    // Test basic functionality
                    if (typeof fetch !== 'function') {
                        console.error('DirectSearch: fetch API not available, using offline mode');
                        this._offlineMode = true;
                        return false;
                    }

                    // If ConnectivityTest is available, use its results
                    if (window.ConnectivityTest && typeof ConnectivityTest.getStatus === 'function') {
                        const status = ConnectivityTest.getStatus();

                        // We can use online features if Wikipedia is directly accessible
                        if (status.canAccessWikipedia) {
                            console.log('DirectSearch: Wikipedia API is directly accessible');
                            this._offlineMode = false;
                            return true;
                        }

                        // Or if we have a working CORS proxy
                        if (window.CORSProxyManager && CORSProxyManager._functional) {
                            console.log('DirectSearch: CORS proxy is available');
                            this._offlineMode = false;
                            return true;
                        }
                    }

                    // Otherwise test Wikipedia API endpoint directly
                    const testResult = await this.testEndpointAccess();
                    this._offlineMode = !testResult;

                    console.log(`DirectSearch online functionality test result: ${testResult ? 'Available' : 'Unavailable, using offline mode'}`);
                    return testResult;
                } catch (e) {
                    console.error('Error checking DirectSearch functionality:', e);
                    this._offlineMode = true;
                    return false;
                }
            },

            /**
             * Test if we can access the required API endpoints
             * @returns {Promise<boolean>} Whether the endpoints are accessible
             */
            testEndpointAccess: async function () {
                try {
                    console.log('Testing DirectSearch endpoint access');

                    // Skip test if navigator says we're offline
                    if (!navigator.onLine) {
                        console.log('Browser reports offline status, skipping endpoint tests');
                        return false;
                    }

                    // Try various methods to test Wikipedia API

                    // 1. Direct access with origin=* parameter
                    try {
                        const wikiEndpoint = 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=general&format=json&origin=*';
                        const wikiResponse = await fetch(wikiEndpoint, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' },
                            mode: 'cors',
                            cache: 'no-store'
                        });

                        if (wikiResponse.ok) {
                            console.log('DirectSearch: Wikipedia API endpoint is directly accessible');
                            return true;
                        }
                    } catch (directError) {
                        console.log('DirectSearch: Direct Wikipedia API access failed:', directError.message);
                    }

                    // 2. Try using CORSProxyManager if available
                    if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                        try {
                            const wikiEndpoint = 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=general&format=json';
                            const wikiResponse = await CORSProxyManager.fetch(wikiEndpoint);

                            if (wikiResponse.ok) {
                                console.log('DirectSearch: Wikipedia API endpoint is accessible via CORS proxy');
                                return true;
                            }
                        } catch (proxyError) {
                            console.log('DirectSearch: CORS proxy access failed:', proxyError.message);
                        }
                    }

                    // 3. Try with no-cors mode as last resort
                    try {
                        await fetch('https://en.wikipedia.org', {
                            method: 'HEAD',
                            mode: 'no-cors',
                            cache: 'no-store'
                        });

                        // With no-cors, we can't check response.ok, but if fetch succeeds,
                        // we at least know the server is reachable
                        console.log('DirectSearch: Wikipedia is reachable with no-cors');
                        return true;
                    } catch (noCorsError) {
                        console.log('DirectSearch: no-cors test failed:', noCorsError.message);
                    }

                    // All methods failed
                    console.error('DirectSearch: All endpoint tests failed');
                    return false;
                } catch (error) {
                    console.error('Error testing API endpoints:', error);
                    return false;
                }
            },

            checkOfflineMode: function () {
                return this._offlineMode;
            }
        };

        window.DirectSearchCore = DirectSearchCore;

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
            ModuleRegistry.register('DirectSearchCore', DirectSearchCore);
        }
    }
})();
