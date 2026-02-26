/**
 * Connectivity Google - API Module
 * Handles API-based connectivity testing (fetch, proxy).
 */
const ConnectivityGoogleAPI = {
    /**
     * Initialize
     */
    init: function () {
        console.log('ConnectivityGoogleAPI initialized');
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('ConnectivityGoogleAPI', ConnectivityGoogleAPI);
        }
    },

    /**
     * Test basic connectivity to Google (no proxy)
     */
    testBasicConnectivity: async function () {
        console.log('ConnectivityGoogle: Testing basic Google connectivity (direct)...');
        const results = {
            accessible: false,
            accessMethod: 'none',
            jsRendering: false,
            jsRenderingRequired: true,
            captchaDetected: false,
            error: null
        };

        try {
            const response = await fetch('https://www.google.com/search?q=test', {
                method: 'GET',
                mode: 'no-cors',
                credentials: 'omit',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            results.accessible = true;
            results.accessMethod = 'direct';
            console.log('ConnectivityGoogle: Basic Google connectivity check succeeded (opaque)');
            return results;
        } catch (e) {
            console.warn('ConnectivityGoogle: Basic Google connectivity check failed:', e);
            results.error = e.message;
            return results;
        }
    },

    /**
     * Test if Google is accessible through a proxy
     */
    testViaProxy: async function (proxyUrl) {
        // If no proxy URL provided, try to get one from CORSProxyManager
        if (!proxyUrl && window.CORSProxyManager) {
            const proxies = CORSProxyManager.getProxies();
            if (proxies && proxies.length > 0) {
                proxyUrl = proxies[0];
            }
        }

        if (!proxyUrl) {
            console.warn('ConnectivityGoogle: No proxy URL available for testing');
            return {
                accessible: false,
                accessMethod: 'none',
                captchaDetected: false,
                error: 'No proxy available'
            };
        }

        console.log(`ConnectivityGoogle: Testing Google access through proxy: ${proxyUrl}`);

        // Construct the Google test URL with the proxy
        let testUrl;
        if (proxyUrl.endsWith('?')) {
            testUrl = `${proxyUrl}${encodeURIComponent('https://www.google.com/search?q=test')}`;
        } else if (proxyUrl.includes('${url}')) {
            testUrl = proxyUrl.replace('${url}', encodeURIComponent('https://www.google.com/search?q=test'));
        } else if (proxyUrl.includes('url=')) {
            const urlParam = 'url=';
            const urlParamIndex = proxyUrl.indexOf(urlParam) + urlParam.length;
            testUrl = proxyUrl.slice(0, urlParamIndex) + encodeURIComponent('https://www.google.com/search?q=test') + proxyUrl.slice(urlParamIndex);
        } else {
            testUrl = `${proxyUrl}${proxyUrl.endsWith('/') ? '' : '/'}https://www.google.com/search?q=test`;
        }

        try {
            const response = await fetch(testUrl, {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (!response.ok) {
                console.warn(`ConnectivityGoogle: Failed to access Google through proxy ${proxyUrl}: ${response.status}`);
                return {
                    accessible: false,
                    accessMethod: 'none',
                    captchaDetected: false,
                    error: `HTTP ${response.status}`
                };
            }

            const html = await response.text();

            // Check if this is really a Google result (not a CAPTCHA page)
            if (html.length < 1000) {
                console.warn(`ConnectivityGoogle: Proxy ${proxyUrl} returned invalid Google HTML (possibly captcha/block)`);
                return {
                    accessible: false,
                    accessMethod: 'none',
                    captchaDetected: true,
                    error: 'Response too short'
                };
            }

            if (html.includes('captcha') || html.includes('unusual traffic') ||
                html.includes('automated requests') || html.includes('detected unusual traffic')) {
                console.warn(`ConnectivityGoogle: Google returned CAPTCHA/block via proxy ${proxyUrl}`);
                return {
                    accessible: false,
                    accessMethod: 'none',
                    captchaDetected: true,
                    error: 'CAPTCHA detected'
                };
            }

            if (!html.includes('<html') || !html.includes('google')) {
                console.warn(`ConnectivityGoogle: Proxy ${proxyUrl} returned non-Google content`);
                return {
                    accessible: false,
                    accessMethod: 'none',
                    captchaDetected: false,
                    error: 'Non-Google content'
                };
            }

            console.log(`ConnectivityGoogle: Successfully accessed Google through proxy: ${proxyUrl}`);

            // Update Core if available
            if (window.ConnectivityGoogleCore) {
                ConnectivityGoogleCore.updateTestResult('workingGoogleProxy', proxyUrl);
                ConnectivityGoogleCore.updateTestResult('googleAccessibleViaProxy', true);
            }

            return {
                accessible: true,
                accessMethod: 'proxy',
                captchaDetected: false,
                error: null
            };

        } catch (error) {
            console.warn(`ConnectivityGoogle: Failed to access Google through proxy ${proxyUrl}:`, error);
            return {
                accessible: false,
                accessMethod: 'none',
                captchaDetected: false,
                error: error.message
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.ConnectivityGoogleAPI = ConnectivityGoogleAPI;
    ConnectivityGoogleAPI.init();
}
