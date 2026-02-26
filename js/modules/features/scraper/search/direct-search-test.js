/**
 * DirectSearch Test Module (Facade)
 * 
 * Provides testing and diagnostic functions for the DirectSearch module.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - DirectSearchTestRunner: Test execution
 * - DirectSearchTestFixes: Diagnostic fixes
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    // Define the DirectSearchTest module
    const DirectSearchTest = {
        version: '1.1.0-facade',
        _initialized: false,

        /**
         * Initialize the module
         */
        init: function () {
            console.log('Initializing DirectSearchTest module (Facade)');

            if (window.ModuleRegistry) {
                window.ModuleRegistry.register('DirectSearchTest', DirectSearchTest);
            }

            // Initialize sub-modules
            if (window.DirectSearchTestRunner && typeof DirectSearchTestRunner.init === 'function') {
                DirectSearchTestRunner.init();
            }
            if (window.DirectSearchTestFixes && typeof DirectSearchTestFixes.init === 'function') {
                DirectSearchTestFixes.init();
            }

            // Register global test functions
            window.testDirectSearch = this.runTests.bind(this);
            window.fixDirectSearch = this.fixDirectSearch.bind(this);
            window.forceDirectSearchOnline = this.forceOnlineMode.bind(this);
            window.forceDirectSearchOffline = this.forceOfflineMode.bind(this);

            this._initialized = true;
            return this;
        },

        /**
         * Force DirectSearch into online mode
         */
        forceOnlineMode: function () {
            if (window.DirectSearchTestRunner) {
                return DirectSearchTestRunner.forceOnlineMode();
            }
            return false;
        },

        /**
         * Force DirectSearch into offline mode
         */
        forceOfflineMode: function () {
            if (window.DirectSearchTestRunner) {
                return DirectSearchTestRunner.forceOfflineMode();
            }
            return false;
        },

        /**
         * Run tests on the DirectSearch module
         */
        runTests: async function () {
            if (window.DirectSearchTestRunner) {
                return DirectSearchTestRunner.runTests();
            }
            console.error('DirectSearchTestRunner not available');
            return null;
        },

        /**
         * Fix DirectSearch module issues
         */
        fixDirectSearch: async function () {
            if (window.DirectSearchTestFixes) {
                return DirectSearchTestFixes.fixDirectSearch();
            }
            console.error('DirectSearchTestFixes not available');
            return false;
        }
    };

    // Make it globally available
    window.DirectSearchTest = DirectSearchTest;

    // Initialize (Auto-init)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => DirectSearchTest.init());
    } else {
        DirectSearchTest.init();
    }
})();