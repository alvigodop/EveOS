/**
 * Connectivity Google - UI Module
 * Handles DOM-based connectivity tests (BrowserEmulator, Rendering).
 */
const ConnectivityGoogleUI = {
    /**
     * Initialize
     */
    init: function () {
        console.log('ConnectivityGoogleUI initialized');
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('ConnectivityGoogleUI', ConnectivityGoogleUI);
        }
    },

    /**
     * Test Google JavaScript rendering capability
     */
    testJsRendering: async function () {
        console.log('ConnectivityGoogle: Testing Google JavaScript rendering capability');

        const results = {
            directAccessible: false,
            jsRenderingWorking: false,
            jsRenderingRequired: false,
            renderedVia: 'none',
            error: null
        };

        try {
            // Skip Google rendering tests if we're actively using Google CSE
            const isUsingGoogleCSE = document.getElementById('google-searchbox-container') !== null &&
                document.getElementById('google-results-container') !== null;

            if (isUsingGoogleCSE) {
                console.log('ConnectivityGoogle: Skipping Google rendering test because Google CSE is active');
                results.directAccessible = true;
                results.jsRenderingWorking = true;

                if (window.ConnectivityGoogleCore) {
                    ConnectivityGoogleCore.updateTestResult('googleJsRendering', true);
                    ConnectivityGoogleCore.updateTestResult('googleDirectAccess', true);
                }
                return results;
            }

            // Skip proxy-based rendering tests when running from file:// protocol or localhost
            const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            if (location.protocol === 'file:' || isLocalhost) {
                const reason = location.protocol === 'file:' ? 'file:// protocol' : 'localhost';
                console.log(`ConnectivityGoogle: Skipping Google JS rendering test (${reason} - using local environment)`);
                results.directAccessible = true;
                results.jsRenderingWorking = isLocalhost;
                results.error = `Skipped for ${reason}`;

                if (window.ConnectivityGoogleCore) {
                    ConnectivityGoogleCore.updateTestResult('googleJsRendering', isLocalhost);
                    ConnectivityGoogleCore.updateTestResult('googleDirectAccess', true);
                }
                return results;
            }

            // Test direct access first (no JS rendering)
            if (window.ConnectivityGoogleAPI) {
                try {
                    await ConnectivityGoogleAPI.testBasicConnectivity();
                    results.directAccessible = true;
                } catch (e) { /* Ignore here, handled in detailed test */ }
            } else {
                // Fallback if API module missing (shouldn't happen in facade)
                try {
                    await fetch('https://www.google.com/search?q=test', { mode: 'no-cors' });
                    results.directAccessible = true;
                } catch (e) { }
            }

            // Test JavaScript rendering
            if (window.BrowserEmulator && typeof BrowserEmulator.renderUrl === 'function') {
                try {
                    console.log('ConnectivityGoogle: Testing Google rendering with BrowserEmulator');
                    const renderedContent = await BrowserEmulator.renderUrl('https://www.google.com', {
                        timeout: 15000,
                        method: 'proxy',
                        useCache: false
                    });

                    if (renderedContent && typeof renderedContent === 'string') {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(renderedContent, 'text/html');
                        const hasSearchBox = doc.querySelector('input[name="q"]') !== null;
                        const hasGoogleLogo = renderedContent.includes('google-logo') ||
                            renderedContent.includes('googlelogo');

                        results.jsRenderingWorking = hasSearchBox && hasGoogleLogo;
                        console.log(`ConnectivityGoogle: Google rendering test - search box: ${hasSearchBox}, logo: ${hasGoogleLogo}`);
                        console.log(`ConnectivityGoogle: Google rendering ${results.jsRenderingWorking ? 'succeeded' : 'failed'}`);
                    } else {
                        results.jsRenderingWorking = false;
                        console.warn('ConnectivityGoogle: Empty or invalid rendered content from BrowserEmulator');
                    }
                } catch (error) {
                    results.jsRenderingWorking = false;
                    results.error = error.message;
                    console.error('ConnectivityGoogle: Google JS rendering test failed:', error);
                }
            } else {
                console.warn('ConnectivityGoogle: BrowserEmulator not available, cannot test Google JS rendering');
                results.error = 'BrowserEmulator module not available';
            }

            if (window.ConnectivityGoogleCore) {
                ConnectivityGoogleCore.updateTestResult('googleJsRendering', results.jsRenderingWorking);
                ConnectivityGoogleCore.updateTestResult('googleDirectAccess', results.directAccessible);
            }
            console.log(`ConnectivityGoogle: Google connectivity test summary - Direct access: ${results.directAccessible}, JS rendering: ${results.jsRenderingWorking}`);

            return results;
        } catch (error) {
            console.error('ConnectivityGoogle: Error in Google JS rendering test:', error);
            results.error = error.message;
            results.jsRenderingWorking = false;

            if (window.ConnectivityGoogleCore) {
                ConnectivityGoogleCore.updateTestResult('googleJsRendering', false);
            }
            return results;
        }
    }
};

if (typeof window !== 'undefined') {
    window.ConnectivityGoogleUI = ConnectivityGoogleUI;
    ConnectivityGoogleUI.init();
}
