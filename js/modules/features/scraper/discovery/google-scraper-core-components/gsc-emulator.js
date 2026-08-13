/**
 * Google Scraper Core - Emulator
 * 
 * Handles BrowserEmulator checks and initialization.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const BROWSER_EMULATOR_MODULES = [
        'js/modules/features/scraper/utils/browser-emulator/core.js?v=b71beac60ee3',
        'js/modules/features/scraper/utils/browser-emulator/be-config.js?v=c8d45491d36b',
        'js/modules/features/scraper/utils/browser-emulator/be-utils.js?v=9a6fcb0f3ca2',
        'js/modules/features/scraper/utils/browser-emulator/be-proxy-manager.js?v=c97feebfeb58',
        'js/modules/features/scraper/utils/browser-emulator/be-render-orchestrator.js?v=ef31e9ae4837',
        'js/modules/features/scraper/utils/browser-emulator/be-init.js?v=338ce92b79ee',
        'js/modules/features/scraper/utils/browser-emulator/proxy-strategy.js?v=02e1ba81bb18',
        'js/modules/features/scraper/utils/browser-emulator/iframe-strategy.js?v=a4bd03ef8f3e',
        'js/modules/features/scraper/utils/browser-emulator/local-strategy.js?v=12f1bc1816dd'
    ];

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Unable to recover ${src}`));
            document.head.appendChild(script);
        });
    }

    function recoverBrowserEmulator() {
        if (window.__eveBrowserEmulatorRecoveryPromise) {
            return window.__eveBrowserEmulatorRecoveryPromise;
        }

        window.__eveBrowserEmulatorRecoveryPromise = BROWSER_EMULATOR_MODULES.reduce(
            (pending, src) => pending.then(() => loadScript(src)),
            Promise.resolve()
        ).catch((error) => {
            window.__eveBrowserEmulatorRecoveryPromise = null;
            console.error('GSCEmulator: BrowserEmulator recovery failed', error);
            return false;
        });
        return window.__eveBrowserEmulatorRecoveryPromise;
    }

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
                // Recovery is asynchronous; the caller's next readiness check observes it.
                recoverBrowserEmulator();
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
