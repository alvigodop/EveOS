/**
 * API Test Diagnostics Component
 * Handles diagnostic tests for connectivity issues.
 */
const ApiTestDiagnostics = {};

/**
 * Initialize the module
 */
ApiTestDiagnostics.init = function () {
    console.log('ApiTestDiagnostics initialized');
};

/**
 * Run a comprehensive connectivity diagnostic test
 * @returns {Promise<Object>} Diagnostic results
 */
ApiTestDiagnostics.diagnoseConnectivity = async function () {
    console.log('Running comprehensive connectivity diagnostics...');

    const diagnostics = {
        browserInfo: null,
        networkInfo: null,
        corsProxies: null,
        apiEndpoints: null,
        recommendations: []
    };

    if (window.ApiTestInfo) {
        diagnostics.browserInfo = ApiTestInfo.getBrowserInfo();
        diagnostics.networkInfo = await ApiTestInfo.getNetworkInfo();
    } else {
        console.warn('ApiTestInfo not available for diagnostics');
    }

    // Test CORS proxies if available
    if (window.CORSProxyManager) {
        console.log('Testing CORS proxies...');
        await CORSProxyManager.retestProxies();
        diagnostics.corsProxies = CORSProxyManager.getProxyStatus();

        const workingProxies = diagnostics.corsProxies.filter(p => p.working).length;
        console.log(`Found ${workingProxies} working CORS proxies out of ${diagnostics.corsProxies.length}`);

        if (workingProxies === 0) {
            diagnostics.recommendations.push(
                'No working CORS proxies found. Try refreshing the page or adding new proxy services.'
            );
        }
    } else {
        diagnostics.recommendations.push(
            'CORS Proxy Manager not available. This may limit the application\'s ability to access external APIs.'
        );
    }

    // Test API endpoints
    if (window.ApiTestConnectivity) {
        diagnostics.apiEndpoints = await ApiTestConnectivity.testApiConnectivity();

        const criticalEndpointsFailure = diagnostics.apiEndpoints.details
            .filter(r => r.critical && !r.success)
            .length;

        if (criticalEndpointsFailure > 0) {
            diagnostics.recommendations.push(
                `${criticalEndpointsFailure} critical endpoints are not accessible. Check your internet connection or try using a different browser.`
            );
        }
    } else {
        console.error('ApiTestConnectivity not available for diagnostics');
    }

    // Check for specific issues
    if (diagnostics.networkInfo && diagnostics.networkInfo.isLocalFile) {
        diagnostics.recommendations.push(
            'Running from a local file system. CORS restrictions apply. Consider using a local web server or browser extension to disable CORS.'
        );
    }

    if (window.corsErrors && window.corsErrors.length > 0) {
        diagnostics.corsErrors = window.getGroupedCorsErrors ?
            window.getGroupedCorsErrors() :
            { count: window.corsErrors.length };

        diagnostics.recommendations.push(
            `Found ${window.corsErrors.length} CORS-related errors. Consider using a browser extension to disable CORS or run the app on a web server.`
        );
    }

    // Output detailed diagnostics
    console.log('=== Connectivity Diagnostics ===');
    console.log('Browser:', diagnostics.browserInfo);
    console.log('Network:', diagnostics.networkInfo);
    console.log('API Endpoints:', diagnostics.apiEndpoints);
    console.log('CORS Proxies:', diagnostics.corsProxies);

    if (diagnostics.recommendations.length > 0) {
        console.log('=== Recommendations ===');
        diagnostics.recommendations.forEach((rec, i) => {
            console.log(`${i + 1}. ${rec}`);
        });
    }

    return diagnostics;
};

window.ApiTestDiagnostics = ApiTestDiagnostics;
