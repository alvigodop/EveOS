/**
 * CORS Proxy Manager - Testing Component
 * 
 * Handles proxy testing logic (latency, Google access).
 * 
 * @version 1.0.0
 */

const CPMTesting = {
    /**
     * Test all registered proxies
     * @param {Object} stateComponent - Reference to CPMState
     * @param {Object} manager - Reference to CORSProxyManager (for status updates)
     * @returns {Promise<Array>} Status list
     */
    testAllProxies: async function (stateComponent, manager) {
        console.log("CPMTesting: Testing all CORS proxies...");

        if (!stateComponent || !window.CORSProxyTester) {
            console.error("CPMTesting: Dependencies missing");
            return [];
        }

        const state = stateComponent.getStatus();

        if (state.proxiesTestingInProgress) {
            console.log("CPMTesting: Proxy testing already in progress, skipping");
            return manager.getProxyStatus();
        }

        state.proxiesTestingInProgress = true;

        try {
            const proxies = stateComponent.getProxies();
            const results = await CORSProxyTester.testAllProxies(proxies);

            // Update proxies with test results
            for (const result of results) {
                const proxy = proxies.find(p => p.url === result.url);
                if (proxy) {
                    proxy.working = result.working;
                    proxy.responseTime = result.responseTime;
                    proxy.lastTested = new Date();
                }
            }

            // Sort and count working proxies
            stateComponent.sortProxies();
            stateComponent.updateStatusCounts();

            // Test for Google access if we have working proxies
            if (stateComponent.hasWorkingProxies()) {
                console.log("CPMTesting: Testing working proxies for Google access...");
                await this.testGoogleProxies(stateComponent, manager);
            }

            state.allProxiesTested = true;
            state.proxiesTestingInProgress = false;
            state.lastTestTime = new Date();

            if (manager && typeof manager._updateModuleStatus === 'function') {
                manager._updateModuleStatus();
            }

            return manager.getProxyStatus();
        } catch (error) {
            console.error('CPMTesting: Error in testAllProxies:', error);
            state.proxiesTestingInProgress = false;
            return [];
        }
    },

    /**
     * Test working proxies for Google access capability
     * @param {Object} stateComponent - Reference to CPMState
     * @param {Object} manager - Reference to CORSProxyManager (for status updates)
     * @returns {Promise<number>} Number of Google-capable proxies
     */
    testGoogleProxies: async function (stateComponent, manager) {
        if (!stateComponent || !window.CORSProxyTester) return 0;

        console.log("CPMTesting: Testing proxies for Google access capability...");

        // Get only working proxies
        const proxies = stateComponent.getProxies();
        const workingProxies = proxies.filter(proxy => proxy.working);

        if (workingProxies.length === 0) {
            console.log("CPMTesting: No working proxies to test for Google access");
            return 0;
        }

        let googleCapableCount = 0;

        // Test each working proxy for Google access
        for (const proxyObj of workingProxies) {
            try {
                // console.log(`CPMTesting: Testing Google access with proxy: ${proxyObj.url}`);
                const result = await CORSProxyTester.testGoogleAccess(proxyObj.url);

                if (result && result.accessible) {
                    googleCapableCount++;
                    proxyObj.canAccessGoogle = true;
                    // console.log(`✓ Proxy ${proxyObj.url} can access Google!`);
                } else {
                    proxyObj.canAccessGoogle = false;
                    // console.log(`✗ Proxy ${proxyObj.url} cannot access Google`);
                }
            } catch (error) {
                console.error(`CPMTesting: Error testing Google access with proxy ${proxyObj.url}:`, error);
            }
        }

        console.log(`CPMTesting: Found ${googleCapableCount} Google-capable proxies`);

        // Re-sort proxies to prioritize Google-capable ones
        stateComponent.sortProxies();
        stateComponent.updateStatusCounts();

        // Update module status
        if (manager && typeof manager._updateModuleStatus === 'function') {
            manager._updateModuleStatus();
        }

        return googleCapableCount;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CPMTesting', CPMTesting);
}

window.CPMTesting = CPMTesting;
