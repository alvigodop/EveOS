/**
 * CORS Proxy Tester Logic Component
 * Handles the core testing logic for proxies.
 */
const CPTTester = {
    /**
     * Test a single proxy for basic functionality
     * @param {string} proxyUrl - The proxy URL to test
     * @param {string} testTargetUrl - URL to test against (default: example.com)
     * @returns {Promise<Object>} - Results of the proxy test
     */
    async testProxy(proxyUrl, testTargetUrl = 'https://example.com') {
        const result = {
            working: false,
            responseTime: 0,
            error: null
        };

        if (!window.CPTCommon) {
            console.error('CPTTester: CPTCommon module not loaded');
            result.error = 'Missing dependencies';
            return result;
        }

        try {
            // Set up a controlled fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            // Build proxy URL based on its format
            const constructedUrl = CPTCommon.constructProxyUrl(testTargetUrl, proxyUrl);
            const startTime = performance.now();

            const response = await fetch(constructedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                signal: controller.signal
            });

            const endTime = performance.now();
            result.responseTime = Math.round(endTime - startTime);

            // Clear the timeout since our request completed
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} returned HTTP ${response.status}`);
                result.error = `HTTP ${response.status}`;
                return result;
            }

            const html = await response.text();

            // Verify the response has expected content
            if (html.length > 500 && (html.includes('<html') || html.includes('Example Domain'))) {
                result.working = true;
            } else {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} returned unexpected content, length: ${html.length}`);
                result.error = 'Unexpected content';
            }

            return result;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} timed out after 5 seconds`);
                result.error = 'Timeout';
            } else {
                console.error(`CORSProxyTester: Error testing proxy ${proxyUrl}:`, error);
                result.error = error.message;
            }
            return result;
        }
    },

    /**
     * Test if a proxy can access Google
     * @param {string} proxyUrl - The proxy URL to test
     * @returns {Promise<Object>} - Results of the Google access test
     */
    async testGoogleAccess(proxyUrl) {
        const result = {
            accessible: false,
            captchaDetected: false,
            responseTime: 0,
            error: null
        };

        if (!proxyUrl) {
            console.error('CORSProxyTester: Invalid proxy passed to testGoogleAccess');
            result.error = 'No proxy URL provided';
            return result;
        }

        if (!window.CPTCommon) {
            console.error('CPTTester: CPTCommon module not loaded');
            result.error = 'Missing dependencies';
            return result;
        }

        console.log(`CORSProxyTester: Testing Google access with proxy: ${proxyUrl}`);

        const googleUrl = 'https://www.google.com/search?q=fandom+wiki+test';
        const testUrl = CPTCommon.constructProxyUrl(googleUrl, proxyUrl);

        try {
            const startTime = performance.now();

            // Use minimal headers to avoid CORS preflight issues
            const response = await fetch(testUrl, {
                method: 'GET',
                credentials: 'omit',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            const endTime = performance.now();
            result.responseTime = Math.round(endTime - startTime);

            if (!response.ok) {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} returned status ${response.status} for Google access test`);
                result.error = `HTTP ${response.status}`;
                return result;
            }

            const html = await response.text();

            // Make sure it's actually Google content and not an error/captcha page
            if (html.length < 1000) {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} response too short (less than 1000 chars)`);
                result.error = 'Response too short';
                return result;
            }

            if (!html.includes('<html') || !html.includes('google')) {
                console.warn(`CORSProxyTester: Proxy ${proxyUrl} did not return Google HTML`);
                result.error = 'Non-Google content';
                return result;
            }

            if (html.includes('captcha') ||
                html.includes('unusual traffic') ||
                html.includes('automated requests') ||
                html.includes('detected unusual traffic')) {
                console.warn(`CORSProxyTester: Google returned a CAPTCHA/block page via proxy ${proxyUrl}`);
                result.captchaDetected = true;
                result.error = 'CAPTCHA detected';
                return result;
            }

            console.log(`CORSProxyTester: Successfully accessed Google via proxy ${proxyUrl}`);
            result.accessible = true;
            return result;

        } catch (error) {
            console.warn(`CORSProxyTester: Error testing Google access with proxy ${proxyUrl}:`, error);
            result.error = error.message;
            return result;
        }
    }
};

window.CPTTester = CPTTester;
