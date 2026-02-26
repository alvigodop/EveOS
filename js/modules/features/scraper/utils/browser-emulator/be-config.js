/**
 * BrowserEmulator Config Module
 * 
 * Handles configuration defaults and status reporting.
 */

(function () {
    if (!window.BrowserEmulator) {
        console.error('BrowserEmulator core must be loaded before config module');
        return;
    }

    // Default configuration
    window.BrowserEmulator._config = {
        // Rendering timeouts
        renderTimeout: 15000,          // Max time to wait for rendering (ms)
        iframeTimeout: 10000,          // Max time to wait for iframe rendering (ms)
        proxyTimeout: 7000,            // Max time to wait for proxy response (ms)

        // Rendering retries
        maxRenderRetries: 3,           // Maximum number of retries for rendering
        maxProxyRetries: 5,            // Maximum number of retries for proxies

        // Rate limiting
        requestDelay: 1000,            // Delay between requests to avoid rate limiting (ms)
        googleRequestDelay: 2000,      // Additional delay for Google requests (ms)

        // Feature flags
        useIframeRendering: true,      // Whether to use iframe rendering as fallback
        useLocalRendering: true,       // Whether to use local rendering methods
        useCORSProxies: true,          // Whether to use CORS proxies
        storeSuccessfulProxies: true,  // Whether to save successful proxies

        // Security and cache
        enforceCSP: false,             // Enforce Content Security Policy
        cacheResults: true,            // Cache rendered results
        cacheTimeToLive: 3600000,      // Cache TTL (1 hour)

        // Validation
        validateRenderedContent: true,  // Validate that rendered content is valid
        requireRenderSignature: false,  // Require signature in rendered content

        // Testing
        debugMode: false,              // Enable debug logging

        // New fields
        disabledDomains: ['gstatic.com', 'googleapis.com'], // Domains to avoid processing
    };

    // Add status method
    window.BrowserEmulator.getStatus = function () {
        return {
            initialized: this._initialized,
            version: this.version,
            proxyCount: this._jsRenderProxies ? this._jsRenderProxies.length : 0,
            successfulProxies: (this._proxyStats && this._proxyStats.successful) ? this._proxyStats.successful.length : 0,
            failedProxies: (this._proxyStats && this._proxyStats.failed) ? Object.keys(this._proxyStats.failed).length : 0,
            cacheEntries: this._renderCache ? Object.keys(this._renderCache).length : 0,
            lastSuccessfulProxy: (this._proxyStats) ? this._proxyStats.lastSuccessful : null
        };
    };

    console.log('BrowserEmulator: Config module loaded');
})();
