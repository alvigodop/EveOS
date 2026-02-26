/**
 * Google Scraper Core - Connectivity
 * 
 * Handles Google connectivity checks.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSCConnectivity = {
        version: '1.0.0',

        init: function () {
            console.log('GSCConnectivity initialized');
            return this;
        },

        /**
         * Check Google connectivity to help diagnose search issues
         */
        checkGoogleConnectivity: async function () {
            console.log('GSCConnectivity: Checking Google connectivity for search scraper...');

            // Use ConnectivityTest module if available
            if (window.ConnectivityTest && typeof ConnectivityTest.testGoogleConnectivity === 'function') {
                try {
                    const googleAccessible = await ConnectivityTest.testGoogleConnectivity();
                    console.log(`GSCConnectivity: Google connectivity test result: ${googleAccessible ? 'Accessible' : 'Not accessible'}`);

                    if (!googleAccessible) {
                        console.warn('GSCConnectivity: Warning: Google appears to be inaccessible, which may affect search functionality');
                        // UI updates handled by caller/observer
                    }
                } catch (error) {
                    console.error('GSCConnectivity: Error checking Google connectivity:', error);
                }
            } else {
                // Simple fallback check if ConnectivityTest is not available
                try {
                    const response = await fetch('https://www.google.com', {
                        method: 'HEAD',
                        mode: 'no-cors',
                        cache: 'no-store',
                        timeout: 5000
                    });
                    console.log('GSCConnectivity: Basic Google connectivity check completed');
                } catch (error) {
                    console.warn('GSCConnectivity: Basic Google connectivity check failed, which may affect search functionality:', error);
                }
            }
        }
    };

    // Expose globally
    window.GSCConnectivity = GSCConnectivity;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSCConnectivity', GSCConnectivity);
    }
})();
