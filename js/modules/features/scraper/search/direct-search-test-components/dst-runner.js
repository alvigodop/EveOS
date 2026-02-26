/**
 * DirectSearch Test Runner Component
 * Handles executing tests for the DirectSearch module.
 */
const DirectSearchTestRunner = {};

/**
 * Initialize the module
 */
DirectSearchTestRunner.init = function () {
    console.log('DirectSearchTestRunner initialized');
};

/**
 * Force DirectSearch into online mode
 */
DirectSearchTestRunner.forceOnlineMode = function () {
    if (window.DirectSearch) {
        console.log('Forcing DirectSearch into online mode');
        DirectSearch._offlineMode = false;
        DirectSearch._functional = true;
        return true;
    }
    return false;
};

/**
 * Force DirectSearch into offline mode
 */
DirectSearchTestRunner.forceOfflineMode = function () {
    if (window.DirectSearch) {
        console.log('Forcing DirectSearch into offline mode');
        DirectSearch._offlineMode = true;
        DirectSearch._functional = true; // Still functional in offline mode
        return true;
    }
    return false;
};

/**
 * Run tests on the DirectSearch module
 */
DirectSearchTestRunner.runTests = async function () {
    console.log('Running DirectSearch tests...');

    // 1. Check if DirectSearch module exists
    if (!window.DirectSearch) {
        console.error('DirectSearch module not found!');
        return {
            exists: false,
            functional: false,
            error: 'Module not found'
        };
    }

    console.log('DirectSearch module found');

    // 2. Check current status
    const initialStatus = {
        version: DirectSearch.version || 'unknown',
        initialized: !!DirectSearch._initialized,
        functional: !!DirectSearch._functional,
        offlineMode: !!DirectSearch._offlineMode
    };

    console.log('DirectSearch status:', initialStatus);

    // 3. Test online functionality if possible
    let onlineStatus = false;

    if (typeof DirectSearch.checkFunctionality === 'function') {
        try {
            console.log('Testing DirectSearch online capabilities...');
            onlineStatus = await DirectSearch.checkFunctionality();
            console.log(`Online functionality test result: ${onlineStatus ? 'Available' : 'Unavailable'}`);
        } catch (error) {
            console.error('Error testing DirectSearch online functionality:', error);
            onlineStatus = false;
        }
    } else {
        console.warn('DirectSearch.checkFunctionality() is not available');
    }

    // 4. Test search methods
    const methodTests = {
        hasSearchFandom: DirectSearch && typeof DirectSearch.searchFandom === 'function',
        hasDiscoverWikipedia: DirectSearch && typeof DirectSearch.discoverWikipedia === 'function',
        hasSetupFallbacks: typeof DirectSearch.setupFallbackMethods === 'function',
        hasTestEndpointAccess: typeof DirectSearch.testEndpointAccess === 'function'
    };

    console.log('Method availability tests:', methodTests);

    // 5. Try both Wikipedia and Fandom searches
    let searchTestResults = { wikipedia: null, fandom: null };

    if (methodTests.hasDiscoverWikipedia) {
        try {
            console.log('Running test Wikipedia search...');
            // Force binding this to DirectSearch for proper offline mode check
            const searchFunc = DirectSearch.discoverWikipedia.bind(DirectSearch);
            const results = await searchFunc('test');
            searchTestResults.wikipedia = {
                success: true,
                count: results ? results.length : 0,
                fallback: results && results.length > 0 ? !!results[0].fallback : false
            };
            console.log(`Wikipedia search test: ${results ? results.length : 0} results`);
        } catch (error) {
            console.error('Wikipedia search test failed:', error);
            searchTestResults.wikipedia = {
                success: false,
                error: error.message
            };
        }
    }

    if (methodTests.hasSearchFandom) {
        try {
            console.log('Running test Fandom search...');
            // Force binding this to DirectSearch for proper offline mode check
            const searchFunc = DirectSearch.searchFandom.bind(DirectSearch);
            const results = await searchFunc('test');
            searchTestResults.fandom = {
                success: true,
                count: results ? results.length : 0,
                fallback: results && results.length > 0 ? !!results[0].fallback : false
            };
            console.log(`Fandom search test: ${results ? results.length : 0} results`);
        } catch (error) {
            console.error('Fandom search test failed:', error);
            searchTestResults.fandom = {
                success: false,
                error: error.message
            };
        }
    }

    // 6. Collect connectivity information
    let connectivityInfo = null;

    if (window.ConnectivityTest && typeof ConnectivityTest.getStatus === 'function') {
        connectivityInfo = ConnectivityTest.getStatus();
        console.log('Connectivity status:', connectivityInfo);
    }

    // 7. Return full test results
    const testResults = {
        exists: true,
        status: initialStatus,
        onlineStatus: onlineStatus,
        methodTests: methodTests,
        searchTests: searchTestResults,
        connectivity: connectivityInfo,
        browserOnline: navigator.onLine
    };

    console.log('DirectSearch test completed. Full results:', testResults);

    // Display results in a more readable format in the console
    this._logReadableResults(testResults);

    return testResults;
};

/**
 * Helper to log results readably
 */
DirectSearchTestRunner._logReadableResults = function (testResults) {
    console.log('');
    console.log('=== DirectSearch Test Results ===');
    console.log(`Version: ${testResults.status.version}`);
    console.log(`Initialized: ${testResults.status.initialized}`);
    console.log(`Functional: ${testResults.status.functional}`);
    console.log(`Offline Mode: ${testResults.status.offlineMode}`);
    console.log(`Online Functionality: ${testResults.onlineStatus}`);
    console.log(`Browser Reports Online: ${testResults.browserOnline}`);
    console.log(`Has searchFandom: ${testResults.methodTests.hasSearchFandom ? 'Yes' : 'No'}`);
    console.log(`Has discoverWikipedia: ${testResults.methodTests.hasDiscoverWikipedia ? 'Yes' : 'No'}`);

    if (testResults.searchTests.wikipedia) {
        console.log(`Wikipedia Search Test: ${testResults.searchTests.wikipedia.success ? 'Success' : 'Failed'}`);
        if (testResults.searchTests.wikipedia.success) {
            console.log(`  Results: ${testResults.searchTests.wikipedia.count}`);
            console.log(`  Using Fallback: ${testResults.searchTests.wikipedia.fallback}`);
        }
    }

    if (testResults.searchTests.fandom) {
        console.log(`Fandom Search Test: ${testResults.searchTests.fandom.success ? 'Success' : 'Failed'}`);
        if (testResults.searchTests.fandom.success) {
            console.log(`  Results: ${testResults.searchTests.fandom.count}`);
            console.log(`  Using Fallback: ${testResults.searchTests.fandom.fallback}`);
        }
    }

    if (testResults.connectivity) {
        console.log('Connectivity Status:');
        console.log(`  Online: ${testResults.connectivity.online}`);
        console.log(`  Can Access Wikipedia: ${testResults.connectivity.canAccessWikipedia}`);
        console.log(`  Can Access Fandom: ${testResults.connectivity.canAccessFandom}`);
        console.log(`  Needs CORS Proxy: ${testResults.connectivity.needsCorsProxy}`);
    }
};

window.DirectSearchTestRunner = DirectSearchTestRunner;
