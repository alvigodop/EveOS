/**
 * BrowserEmulator Local Strategy
 * 
 * Extends BrowserEmulator with local rendering capabilities and polyfills.
 */

(function () {
    // Determine if BrowserEmulator is loaded
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before local strategy');
        return;
    }

    // Add methods to the existing object
    Object.assign(window.BrowserEmulator, {
        /**
         * Set up the fetch polyfill for older browsers
         * @private
         */
        _setupFetchPolyfill: function () {
            if (!window.fetch) {
                window.fetch = function (url, options = {}) {
                    return new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open(options.method || 'GET', url);

                        if (options.headers) {
                            Object.keys(options.headers).forEach(key => {
                                xhr.setRequestHeader(key, options.headers[key]);
                            });
                        }

                        xhr.onload = function () {
                            const response = {
                                status: xhr.status,
                                statusText: xhr.statusText,
                                headers: new Headers(xhr.getAllResponseHeaders().split('\r\n').reduce((acc, current) => {
                                    const parts = current.split(': ');
                                    if (parts[0] && parts[1]) {
                                        acc[parts[0]] = parts[1];
                                    }
                                    return acc;
                                }, {})),
                                text: () => Promise.resolve(xhr.responseText),
                                json: () => Promise.resolve(JSON.parse(xhr.responseText))
                            };
                            resolve(response);
                        };

                        xhr.onerror = function () {
                            reject(new Error('Network request failed'));
                        };

                        xhr.send(options.body);
                    });
                };
            }
        },

        /**
         * Render a URL using local methods
         * @private
         * @param {string} url - URL to render
         * @param {string} renderKey - Unique identifier for this rendering request
         * @param {Object} options - Rendering options
         * @returns {Promise<string>} - Promise resolving to rendered HTML content
         */
        _renderLocally: function (url, renderKey, options) {
            console.log(`BrowserEmulator: Attempting local rendering for ${url}`);

            // Try several local rendering methods
            return new Promise(async (resolve, reject) => {
                let lastError = null;

                // 1. Try CORS Proxy Manager first (best chance of success)
                try {
                    if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                        console.log('BrowserEmulator: Trying CORSProxyManager.fetch for local rendering');
                        const response = await CORSProxyManager.fetch(url);
                        if (response.ok) {
                            const content = await response.text();
                            // Validate content
                            if (content && content.includes('<html')) {
                                console.log('BrowserEmulator: CORSProxyManager.fetch succeeded');
                                return resolve(content);
                            }
                        }
                    }
                } catch (error) {
                    lastError = error;
                    console.warn('BrowserEmulator: CORSProxyManager.fetch failed:', error.message);
                }

                // 1b. Try fetch with no-cors mode (legacy fallback)
                try {
                    const response = await fetch(url, {
                        mode: 'no-cors',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    // If we get here, the request didn't throw, but we can't read the response due to CORS
                    console.log('BrowserEmulator: no-cors fetch succeeded but content is opaque due to CORS');
                } catch (error) {
                    // Don't overwrite lastError from CORSProxyManager if it was more meaningful
                    if (!lastError) lastError = error;
                    console.warn('BrowserEmulator: no-cors fetch failed:', error.message);
                }

                // 2. Try XMLHttpRequest as fallback
                try {
                    const content = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', url);
                        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                        xhr.onload = function () {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve(xhr.responseText);
                            } else {
                                reject(new Error(`XMLHttpRequest failed with status ${xhr.status}`));
                            }
                        };

                        xhr.onerror = function () {
                            reject(new Error('XMLHttpRequest network error'));
                        };

                        xhr.timeout = options.proxyTimeout;
                        xhr.ontimeout = function () {
                            reject(new Error(`XMLHttpRequest timed out after ${options.proxyTimeout}ms`));
                        };

                        xhr.send();
                    });

                    // If we get content, resolve with it
                    if (content && content.includes('<html')) {
                        return resolve(content);
                    }
                } catch (error) {
                    lastError = error;
                    console.warn('BrowserEmulator: XMLHttpRequest fallback failed:', error.message);
                }

                // 3. Try dynamic script injection
                try {
                    const content = await new Promise((resolveScript, rejectScript) => {
                        // Create script element
                        const script = document.createElement('script');
                        script.src = `${url}?callback=window.renderCallback${renderKey}`;

                        // Set up timeout
                        const scriptTimeout = setTimeout(() => {
                            cleanup();
                            rejectScript(new Error(`Script injection timed out after ${options.proxyTimeout}ms`));
                        }, options.proxyTimeout);

                        // Cleanup function
                        function cleanup() {
                            clearTimeout(scriptTimeout);
                            delete window[`renderCallback${renderKey}`];
                            if (script.parentNode) {
                                script.parentNode.removeChild(script);
                            }
                        }

                        // Set up callback function
                        window[`renderCallback${renderKey}`] = function (data) {
                            cleanup();
                            resolveScript(data);
                        };

                        // Handle errors
                        script.onerror = function (error) {
                            cleanup();
                            rejectScript(new Error('Script injection failed'));
                        };

                        // Add script to document
                        document.head.appendChild(script);
                    });

                    // If we get content, resolve with it
                    if (typeof content === 'string' && content.includes('<html')) {
                        return resolve(content);
                    }
                } catch (error) {
                    lastError = error;
                    console.warn('BrowserEmulator: Script injection fallback failed:', error.message);
                }

                // If we get here, all local methods failed
                reject(new Error(`All local rendering methods failed: ${lastError ? lastError.message : 'Unknown error'}`));
            });
        }
    });

    console.log('BrowserEmulator: Local strategy loaded');
})();
