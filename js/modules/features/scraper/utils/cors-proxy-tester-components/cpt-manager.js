/**
 * CORS Proxy Tester Manager Component
 * Handles high-level testing operations and state management.
 */
const CPTManager = {
    _status: {
        testingInProgress: false,
        lastTestTime: null,
        workingProxiesCount: 0,
        googleCapableProxiesCount: 0
    },

    /**
     * Get current testing status
     * @returns {Object} Current testing status
     */
    getStatus() {
        return { ...this._status };
    },

    /**
     * Test all proxies from a list
     * @param {Array} proxies - Array of proxy objects with url property
     * @returns {Promise<Array>} - Array of test results
     */
    async testAllProxies(proxies) {
        if (!proxies || !Array.isArray(proxies)) {
            console.error('CORSProxyTester: Invalid proxies array');
            return [];
        }

        if (!window.CPTTester) {
            console.error('CPTManager: CPTTester module not loaded');
            return [];
        }

        console.log(`CORSProxyTester: Testing ${proxies.length} proxies...`);
        this._status.testingInProgress = true;

        const results = [];

        for (let i = 0; i < proxies.length; i++) {
            const proxy = proxies[i];
            const proxyUrl = typeof proxy === 'string' ? proxy : proxy.url;

            console.log(`CORSProxyTester: Testing proxy ${i + 1}/${proxies.length}: ${proxyUrl}`);

            try {
                const result = await CPTTester.testProxy(proxyUrl);
                results.push({
                    url: proxyUrl,
                    ...result
                });

                if (result.working) {
                    console.log(`✓ Proxy ${proxyUrl} is working (${result.responseTime}ms)`);
                } else {
                    console.log(`✗ Proxy ${proxyUrl} is not working: ${result.error}`);
                }
            } catch (error) {
                console.error(`CORSProxyTester: Error testing proxy ${proxyUrl}:`, error);
                results.push({
                    url: proxyUrl,
                    working: false,
                    error: error.message
                });
            }
        }

        this._status.testingInProgress = false;
        this._status.lastTestTime = new Date();
        this._status.workingProxiesCount = results.filter(r => r.working).length;

        console.log(`CORSProxyTester: Testing complete. ${this._status.workingProxiesCount}/${proxies.length} working.`);
        return results;
    },

    /**
     * Test working proxies for Google access
     * @param {Array} proxies - Array of proxy objects with url property (only working ones should be passed)
     * @returns {Promise<Array>} - Array of Google access test results
     */
    async testGoogleAccessForProxies(proxies) {
        if (!proxies || !Array.isArray(proxies)) {
            console.error('CORSProxyTester: Invalid proxies array');
            return [];
        }

        if (!window.CPTTester) {
            console.error('CPTManager: CPTTester module not loaded');
            return [];
        }

        console.log(`CORSProxyTester: Testing ${proxies.length} proxies for Google access...`);
        const results = [];
        let googleCapableCount = 0;

        for (const proxy of proxies) {
            const proxyUrl = typeof proxy === 'string' ? proxy : proxy.url;

            try {
                const result = await CPTTester.testGoogleAccess(proxyUrl);
                results.push({
                    url: proxyUrl,
                    ...result
                });

                if (result.accessible) {
                    googleCapableCount++;
                    console.log(`✓ Proxy ${proxyUrl} can access Google!`);
                } else {
                    console.log(`✗ Proxy ${proxyUrl} cannot access Google: ${result.error}`);
                }
            } catch (error) {
                console.error(`CORSProxyTester: Error testing Google access with proxy ${proxyUrl}:`, error);
                results.push({
                    url: proxyUrl,
                    accessible: false,
                    error: error.message
                });
            }
        }

        this._status.googleCapableProxiesCount = googleCapableCount;
        console.log(`CORSProxyTester: Found ${googleCapableCount}/${proxies.length} Google-capable proxies`);

        return results;
    }
};

window.CPTManager = CPTManager;
