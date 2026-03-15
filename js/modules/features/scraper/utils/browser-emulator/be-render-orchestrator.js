/**
 * BrowserEmulator Render Orchestrator Module
 * 
 * Manages the rendering process, strategies, and caching.
 */

(function () {
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before render orchestrator module');
        return;
    }

    // Cache for rendered content
    window.BrowserEmulator._renderCache = {};

    // Counters
    window.BrowserEmulator._renderCount = 0;

    Object.assign(window.BrowserEmulator, {
        /**
         * Render a URL in browser-like environment
         * @param {string} url - The URL to render
         * @param {Object} options - Options for rendering
         * @returns {Promise<string>} - Promise resolving to rendered HTML
         */
        renderUrl: async function (url, options = {}) {
            // Initialize if not already done
            if (!this._initialized) {
                this.init();
            }

            // Check if this is a disabled domain
            if (this._isDisabledDomain(url)) {
                console.log(`BrowserEmulator: Skipping disabled domain for URL: ${url}`);
                return Promise.reject(new Error(`BrowserEmulator: URL ${url} is from a disabled domain`));
            }

            // Set up render tracking
            this._renderCount++;
            const renderKey = `render_${Date.now()}_${this._renderCount}`;

            // Merge options with defaults
            const renderOptions = {
                method: options.method || 'auto', // auto, proxy, iframe, local
                timeout: options.timeout || this._config.renderTimeout,
                proxyTimeout: options.proxyTimeout || this._config.proxyTimeout,
                iframeTimeout: options.iframeTimeout || this._config.iframeTimeout,
                useCache: options.useCache !== undefined ? options.useCache : this._config.cacheResults,
                cacheKey: options.cacheKey || url,
                debugMode: options.debugMode || this._config.debugMode
            };

            console.log(`BrowserEmulator: Rendering URL: ${url} (method: ${renderOptions.method})`);

            // Check cache first if enabled
            if (renderOptions.useCache && window.CacheManager) {
                try {
                    const cachedContent = await CacheManager.get(`browserEmulator_${renderOptions.cacheKey}`);
                    if (cachedContent) {
                        console.log('BrowserEmulator: Using cached content');
                        return cachedContent;
                    }
                } catch (err) {
                    console.warn('BrowserEmulator: Cache retrieval error:', err);
                }
            }

            let content = null;
            let lastError = null;

            // Try each method based on options or auto-detection
            try {
                // Try rendering with proxies first if enabled
                if (this._config.useCORSProxies && this._jsRenderProxies.length > 0 && this._tryRenderProxies) {
                    try {
                        content = await this._tryRenderProxies(url, renderKey, renderOptions);
                        if (content) {
                            console.log('BrowserEmulator: Successfully rendered URL using proxy method');
                        }
                    } catch (proxyError) {
                        console.warn(`BrowserEmulator: Proxy rendering failed: ${proxyError.message}`);

                        // If method explicitly requested, throw error
                        if (renderOptions.method === 'proxy') {
                            throw proxyError;
                        }
                    }
                }

                // Try iframe rendering if proxy failed (or in auto mode/explicitly requested)
                if (!content && (renderOptions.method === 'auto' || renderOptions.method === 'iframe')) {
                    if (this._renderWithIframe) {
                        try {
                            content = await this._renderWithIframe(url, renderKey, renderOptions);
                            if (content) {
                                console.log('BrowserEmulator: Successfully rendered URL using iframe method');
                            }
                        } catch (err) {
                            lastError = err;
                            console.warn('BrowserEmulator: Iframe rendering failed:', err.message);

                            // If method explicitly requested, throw error
                            if (renderOptions.method === 'iframe') {
                                throw err;
                            }
                        }
                    }
                }

                // Try local rendering as last resort
                if (!content && (renderOptions.method === 'auto' || renderOptions.method === 'local')) {
                    if (this._renderLocally) {
                        try {
                            content = await this._renderLocally(url, renderKey, renderOptions);
                            if (content) {
                                console.log('BrowserEmulator: Successfully rendered URL using local method');
                            }
                        } catch (err) {
                            lastError = err;
                            console.warn('BrowserEmulator: Local rendering failed:', err.message);

                            // If method explicitly requested, throw error
                            if (renderOptions.method === 'local') {
                                throw err;
                            }
                        }
                    }
                }

                // If all methods failed, throw the last error
                if (!content) {
                    throw lastError || new Error('All rendering methods failed');
                }

                // Normalize content (strategies might return object or string)
                // _tryRenderProxies returns object, others return string
                const finalContent = (typeof content === 'object' && content.content) ? content.content : content;

                // Cache successful result
                if (renderOptions.useCache && finalContent && window.CacheManager) {
                    try {
                        // SIZE LIMIT: Don't cache if content is massive (>100KB) to prevent QuotaExceededError
                        if (finalContent.length > 102400) {
                            console.warn(`BrowserEmulator: Content size (${Math.round(finalContent.length / 1024)}KB) exceeds cache limit. Skipping persistent cache.`);
                        } else {
                            await CacheManager.set(`browserEmulator_${renderOptions.cacheKey}`, finalContent, this._config.cacheTimeToLive);
                        }
                    } catch (err) {
                        console.warn('BrowserEmulator: Cache storage error:', err);
                    }
                }

                return finalContent;
            } catch (error) {
                console.error(`BrowserEmulator: Error rendering URL ${url}:`, error);
                throw error;
            }
        },

        /**
         * Test if JavaScript rendering is working
         * @returns {Promise<boolean>} - Promise resolving to true if rendering works
         */
        testJSRendering: async function () {
            console.log('BrowserEmulator: Testing JavaScript rendering capability');

            // Test URL - a simple page that requires JS to render
            const testUrl = 'https://www.google.com/';

            try {
                // Try to render the test URL
                const content = await this.renderUrl(testUrl, {
                    renderTimeout: 10000,
                    validateRenderedContent: true
                });

                // Check if the content contains elements that would only be present after JS execution
                const jsContentPresent = content.includes('google') &&
                    (content.includes('<script') || content.includes('<input'));

                if (jsContentPresent) {
                    console.log('BrowserEmulator: JavaScript rendering test passed');
                    return true;
                } else {
                    console.warn('BrowserEmulator: JavaScript rendering test failed - content does not show JS execution');
                    return false;
                }
            } catch (error) {
                // console.error('BrowserEmulator: JavaScript rendering test failed:', error.message);
                // Non-critical failure for test
                return false;
            }
        }
    });

    console.log('BrowserEmulator: Render Orchestrator module loaded');
})();
