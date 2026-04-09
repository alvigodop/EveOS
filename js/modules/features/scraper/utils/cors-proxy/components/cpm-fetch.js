/**
 * CORS Proxy Manager Fetch
 * 
 * Handles the fetch logic, proxy rotation, and fallbacks.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CPMFetch = {

        /**
         * Fetch a URL using the best available proxy, rotating through them on failure
         */
        fetch: async function (url, options = {}) {
            if (!url) {
                throw new Error('CPMFetch.fetch: No URL provided');
            }

            // Check dependencies
            if (!window.CPMUtils || !window.CPMState) {
                throw new Error('CPMFetch: Dependencies (CPMUtils, CPMState) not loaded');
            }

            // If local dev mode and target is local, try direct fetch first
            if (CPMUtils.isLocalDevMode() && (url.includes('localhost') || url.includes('127.0.0.1'))) {
                try {
                    const response = await fetch(url, options);
                    if (response.ok) return response;
                } catch (e) {
                    console.warn('Local fetch failed, falling back to proxies if applicable', e);
                }
            }

            const wikimediaFetch = window.EveOS?.API?.Core?.fetchWikimediaResponse;
            const isWikimediaTarget = typeof window.EveOS?.API?.Core?.isWikimediaUrl === 'function'
                ? window.EveOS.API.Core.isWikimediaUrl(url)
                : false;
            if (isWikimediaTarget && typeof wikimediaFetch === 'function') {
                return wikimediaFetch(url, options);
            }

            // OPTIMIZATION: For URLs with origin=* (Fandom/Wikipedia APIs), try direct fetch first
            // These APIs support CORS natively, so proxies are unnecessary and slow
            const hasOriginParam = url.includes('origin=*');
            if (hasOriginParam) {
                try {
                    const response = await fetch(url, options);
                    if (response.ok) {
                        return response;
                    }
                    console.warn('CORSProxyManager: Direct fetch for origin=* URL failed with status:', response.status);
                } catch (e) {
                    console.warn('CORSProxyManager: Direct fetch for origin=* URL failed:', e.message);
                    // Fall through to proxy fallback
                }
            }

            const proxiesToTry = [...CPMState.getProxies()];
            // Sort proxies using state logic (which should be sorted already, but safe to ensure)
            // leveraging established sort if available, or just using current order

            let lastError = null;

            for (const proxy of proxiesToTry) {
                try {
                    const proxyUrlBase = proxy.url;
                    const proxyUrl = CPMUtils.constructProxyUrl(url, proxyUrlBase);
                    console.log(`CORSProxyManager: Fetching via ${proxyUrlBase} -> ${proxyUrl}`);

                    // Merge default headers
                    const fetchOptions = { ...options };
                    fetchOptions.headers = {
                        'X-Requested-With': 'XMLHttpRequest', // Common bypass for some proxies
                        ...fetchOptions.headers
                    };

                    const response = await fetch(proxyUrl, fetchOptions);

                    // Check for proxy-specific error responses that return 200 OK but contain errors
                    if (!response.ok) {
                        console.warn(`CORSProxyManager: Proxy ${proxyUrlBase} returned ${response.status}`);

                        // Mark proxy as potentially non-working if it's a 5xx or connection error
                        if (response.status >= 500 || response.status === 429) {
                            CPMState.markProxyStatus(proxyUrlBase, false);
                        }

                        lastError = new Error(`HTTP ${response.status}`);
                        continue;
                    }

                    // Success!
                    CPMState.markProxyStatus(proxyUrlBase, true);
                    return response;

                } catch (error) {
                    console.warn(`CORSProxyManager: Error with proxy ${proxy.url}:`, error);
                    CPMState.markProxyStatus(proxy.url, false);
                    lastError = error;
                }
            }

            throw new Error(`CORSProxyManager: All proxies failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
        }
    };

    window.CPMFetch = CPMFetch;
})();
