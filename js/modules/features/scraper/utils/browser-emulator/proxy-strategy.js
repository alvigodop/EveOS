/**
 * BrowserEmulator Proxy Strategy
 * 
 * Extends BrowserEmulator with proxy rendering capabilities.
 */

(function () {
    // Determine if BrowserEmulator is loaded
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before proxy strategy');
        return;
    }

    // Add methods to the existing object
    Object.assign(window.BrowserEmulator, {
        /**
         * Try rendering using available proxy services
         * @private
         * @param {string} url - URL to render
         * @param {string} renderKey - Unique identifier for this rendering request
         * @param {Object} options - Rendering options
         * @returns {Promise<Object>} - Promise resolving to rendered content and method used
         */
        _tryRenderProxies: async function (url, renderKey, options) {
            console.log(`BrowserEmulator: Attempting to render using proxy services`);

            let lastError = null;
            let attempts = 0;

            // Filter out local proxies
            const remoteProxies = this._jsRenderProxies.filter(proxy => !proxy.startsWith('local://'));

            // Start with the last successful proxy if available
            let proxiesToTry = [...remoteProxies];
            if (this._proxyStats.lastSuccessful && remoteProxies.includes(this._proxyStats.lastSuccessful)) {
                // Move last successful to the front
                proxiesToTry = [
                    this._proxyStats.lastSuccessful,
                    ...proxiesToTry.filter(p => p !== this._proxyStats.lastSuccessful)
                ];
            }

            // Try CORSProxyManager if available
            if (window.CORSProxyManager && typeof CORSProxyManager.getRecommendedProxy === 'function') {
                try {
                    const recommendedProxy = await CORSProxyManager.getRecommendedProxy('js-render');
                    if (recommendedProxy && !proxiesToTry.includes(recommendedProxy)) {
                        console.log(`BrowserEmulator: Using recommended proxy from CORSProxyManager: ${recommendedProxy}`);
                        proxiesToTry.unshift(recommendedProxy);
                    }
                } catch (error) {
                    console.warn('BrowserEmulator: Failed to get recommended proxy from CORSProxyManager', error);
                }
            }

            // Try each proxy service
            for (const proxy of proxiesToTry) {
                attempts++;

                if (attempts > options.maxProxyRetries) {
                    console.warn(`BrowserEmulator: Exceeded maximum retry attempts (${options.maxProxyRetries})`);
                    break;
                }

                // Skip this proxy if it's failed too many times
                if (this._proxyStats.failed[proxy] && this._proxyStats.failed[proxy] >= 3) {
                    console.log(`BrowserEmulator: Skipping proxy ${proxy} due to previous failures`);
                    continue;
                }

                try {
                    console.log(`BrowserEmulator: Attempting render with proxy ${proxy} (attempt ${attempts})`);

                    // Build the proxy URL
                    // Check if proxy already has a query parameter ready (ends with =)
                    let proxyUrl;
                    if (proxy.endsWith('=') || proxy.endsWith('/')) {
                        proxyUrl = `${proxy}${encodeURIComponent(url)}`;
                    } else {
                        proxyUrl = `${proxy}?url=${encodeURIComponent(url)}`;
                    }

                    // Set up request with timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), options.proxyTimeout);

                    // Make the request
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        signal: controller.signal
                    });

                    // Clear the timeout
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new Error(`Proxy returned status ${response.status}`);
                    }

                    // Get the content
                    const content = await response.text();

                    // Validate the content has actual HTML
                    if (!content || content.length < 100 || !content.includes('<html')) {
                        throw new Error('Proxy returned invalid or empty content');
                    }

                    // Record successful proxy
                    this._recordSuccessfulProxy(proxy);

                    return {
                        content: content,
                        method: `proxy:${proxy}`
                    };
                } catch (error) {
                    lastError = error;
                    console.warn(`BrowserEmulator: Proxy ${proxy} failed: ${error.message}`);

                    // Record failed proxy
                    this._recordFailedProxy(proxy);

                    // Add delay between retries to avoid rate limiting
                    if (options.requestDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, options.requestDelay));
                    }
                }
            }

            // If we get here, all proxies failed
            throw new Error(`All proxy render methods failed: ${lastError ? lastError.message : 'Unknown error'}`);
        },

        /**
         * Record a successful proxy
         * @private
         * @param {string} proxy - The proxy URL that succeeded
         */
        _recordSuccessfulProxy: function (proxy) {
            // Add to successful list if not already there
            if (!this._proxyStats.successful.includes(proxy)) {
                this._proxyStats.successful.push(proxy);
            }

            // Set as last successful
            this._proxyStats.lastSuccessful = proxy;

            // Reset failure count if any
            if (this._proxyStats.failed[proxy]) {
                delete this._proxyStats.failed[proxy];
            }

            // Store successful proxies if enabled
            if (this._config.storeSuccessfulProxies && window.localStorage) {
                try {
                    localStorage.setItem('browserEmulator_successfulProxies',
                        JSON.stringify(this._proxyStats.successful));
                } catch (error) {
                    console.warn('BrowserEmulator: Failed to store successful proxies', error);
                }
            }
        },

        /**
         * Record a failed proxy
         * @private
         * @param {string} proxy - The proxy URL that failed
         */
        _recordFailedProxy: function (proxy) {
            if (!this._proxyStats.failed[proxy]) {
                this._proxyStats.failed[proxy] = 1;
            } else {
                this._proxyStats.failed[proxy]++;
            }

            // Remove from successful list if it's there
            const successIndex = this._proxyStats.successful.indexOf(proxy);
            if (successIndex !== -1) {
                this._proxyStats.successful.splice(successIndex, 1);

                // Update stored successful proxies
                if (this._config.storeSuccessfulProxies && window.localStorage) {
                    try {
                        localStorage.setItem('browserEmulator_successfulProxies',
                            JSON.stringify(this._proxyStats.successful));
                    } catch (error) {
                        console.warn('BrowserEmulator: Failed to update stored proxies', error);
                    }
                }
            }
        }
    });

    console.log('BrowserEmulator: Proxy strategy loaded');
})();
