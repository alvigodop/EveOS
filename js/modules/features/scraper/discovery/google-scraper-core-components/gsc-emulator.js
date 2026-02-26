/**
 * Google Scraper Core - Emulator
 * 
 * Handles BrowserEmulator checks and initialization.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GSCEmulator = {
        version: '1.0.0',

        init: function () {
            console.log('GSCEmulator initialized');
            return this;
        },

        /**
         * Check if the BrowserEmulator is ready for JS rendering
         * @returns {boolean} - Whether the BrowserEmulator is ready
         */
        isEmulatorReady: function () {
            console.log('GSCEmulator: Checking if BrowserEmulator is ready');

            // Check if BrowserEmulator exists and has the necessary functions
            const hasBrowserEmulator = typeof window.BrowserEmulator !== 'undefined';

            // If BrowserEmulator doesn't exist, try to load it
            if (!hasBrowserEmulator) {
                console.warn('GSCEmulator: BrowserEmulator not found, attempting to load it');
                // This will load asynchronously, so subsequent checks will still fail
                // until the script is loaded
                if (!document.querySelector('script[src*="browser-emulator.js"]')) {
                    const script = document.createElement('script');
                    script.src = 'js/modules/utils/browser-emulator.js';
                    script.async = true;
                    document.head.appendChild(script);
                }
                return false;
            }

            // Check if the necessary functions exist
            const hasRenderUrl = typeof BrowserEmulator.renderUrl === 'function';
            const hasParseGoogle = typeof BrowserEmulator.parseGoogleResults === 'function';

            // Log detailed status for debugging
            console.log(`GSCEmulator: BrowserEmulator available: ${hasBrowserEmulator}`);
            console.log(`GSCEmulator: BrowserEmulator.renderUrl available: ${hasRenderUrl}`);
            console.log(`GSCEmulator: BrowserEmulator.parseGoogleResults available: ${hasParseGoogle}`);

            // All required functions must be available
            const isReady = hasBrowserEmulator && hasRenderUrl && hasParseGoogle;

            // If not ready but BrowserEmulator exists, it might be missing functions
            if (!isReady && hasBrowserEmulator) {
                console.error('GSCEmulator: BrowserEmulator exists but is missing required functions:');
                if (!hasRenderUrl) console.error('  - Missing: BrowserEmulator.renderUrl');
                if (!hasParseGoogle) console.error('  - Missing: BrowserEmulator.parseGoogleResults');

                // Try to initialize BrowserEmulator if it's not initialized
                if (!BrowserEmulator._initialized && typeof BrowserEmulator.init === 'function') {
                    console.log('GSCEmulator: Attempting to initialize BrowserEmulator');
                    try {
                        BrowserEmulator.init();
                        // Check again after initialization
                        return this.isEmulatorReady();
                    } catch (error) {
                        console.error('GSCEmulator: Error initializing BrowserEmulator:', error);
                    }
                }
            }

            return isReady;
        }
    };

    // Expose globally
    window.GSCEmulator = GSCEmulator;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GSCEmulator', GSCEmulator);
    }
})();
