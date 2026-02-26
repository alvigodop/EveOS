/**
 * API Test Connectivity Component
 * component for API Test that handles connectivity checks.
 */
const ApiTestConnectivity = {};

/**
 * Initialize the module
 */
ApiTestConnectivity.init = function () {
    console.log('ApiTestConnectivity initialized');
};

// Test endpoints to check
ApiTestConnectivity._endpoints = [
    {
        name: 'Wikipedia API (Query)',
        url: 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=general&format=json&origin=*',
        critical: true,
        supportsOrigin: true
    },
    {
        name: 'Wikipedia API (Search)',
        url: 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=test&format=json&origin=*',
        critical: true,
        supportsOrigin: true
    },
    {
        name: 'Fandom Main Site',
        url: 'https://www.fandom.com',
        critical: true,
        supportsOrigin: false
    }
];

/**
 * Test API connectivity to critical endpoints
 * @returns {Promise<Object>} Test results
 */
ApiTestConnectivity.testApiConnectivity = async function () {
    console.log('Testing API connectivity...');

    // Results object
    const results = {
        success: 0,
        failure: 0,
        details: []
    };

    // Test each endpoint
    for (const endpoint of this._endpoints) {
        console.log(`Testing ${endpoint.name} (${endpoint.url})`);

        try {
            const startTime = performance.now();

            // Try to use origin=* if supported
            let response;
            if (endpoint.supportsOrigin) {
                response = await fetch(endpoint.url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } else if (window.CORSProxyManager && typeof CORSProxyManager.fetch === 'function') {
                // Use CORS proxy for endpoints that don't support origin=*
                response = await CORSProxyManager.fetch(endpoint.url, {
                    method: 'GET',
                    cache: 'no-store'
                });
            } else {
                // Fallback to normal fetch, likely to fail with CORS error
                response = await fetch(endpoint.url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-store'
                });
            }

            const endTime = performance.now();

            const result = {
                name: endpoint.name,
                url: endpoint.url,
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                latency: Math.round(endTime - startTime),
                critical: endpoint.critical,
                supportsOrigin: endpoint.supportsOrigin,
                headers: {}
            };

            // Get CORS headers
            const corsHeaders = [
                'access-control-allow-origin',
                'access-control-allow-methods',
                'access-control-allow-headers',
                'access-control-max-age'
            ];

            corsHeaders.forEach(header => {
                const value = response.headers.get(header);
                if (value) {
                    result.headers[header] = value;
                }
            });

            results.details.push(result);

            if (response.ok) {
                results.success++;
                console.log(`✅ ${endpoint.name} - Success (${response.status})`);
            } else {
                results.failure++;
                console.error(`❌ ${endpoint.name} - Failed (${response.status}): ${response.statusText}`);
            }
        } catch (error) {
            results.failure++;
            results.details.push({
                name: endpoint.name,
                url: endpoint.url,
                success: false,
                error: error.message,
                critical: endpoint.critical,
                supportsOrigin: endpoint.supportsOrigin
            });
            console.error(`❌ ${endpoint.name} - Error: ${error.message}`);
        }
    }

    // Log summary
    console.log(`
============ API Connectivity Test Results ============
Success: ${results.success} / ${results.success + results.failure}
Critical endpoints: ${results.details.filter(r => r.critical && r.success).length} / ${results.details.filter(r => r.critical).length}
==================================================
`);

    // Log detailed results
    console.table(results.details.map(r => ({
        Name: r.name,
        Success: r.success,
        Status: r.status || 'N/A',
        Latency: r.latency || 'N/A',
        'CORS Enabled': r.headers && r.headers['access-control-allow-origin'] ? 'Yes' : 'No'
    })));

    // Update DirectSearch functionality based on results
    if (window.DirectSearch) {
        const criticalEndpointsSuccess = results.details
            .filter(r => r.critical)
            .some(r => r.success);

        DirectSearch._functional = criticalEndpointsSuccess;
        console.log(`DirectSearch functionality updated to: ${criticalEndpointsSuccess}`);
    }

    // Update TabManager and SearchManager based on critical endpoint success
    if (window.TabManager) {
        TabManager._functional = true; // Tab switching doesn't depend on API availability
    }

    if (window.SearchManager) {
        // SearchManager is functional if at least one critical endpoint is accessible
        const criticalEndpointsSuccess = results.details
            .filter(r => r.critical)
            .some(r => r.success);

        SearchManager._functional = criticalEndpointsSuccess;
        console.log(`SearchManager functionality updated to: ${criticalEndpointsSuccess}`);
    }

    return results;
};

window.ApiTestConnectivity = ApiTestConnectivity;
