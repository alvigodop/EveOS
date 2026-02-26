/**
 * Module Registry Protection - State Component
 * 
 * Manages recursion flags and global counters for the protected registry.
 */
(function () {
    'use strict';

    const RPState = {
        /**
         * Reset all recursion flags on the registry object
         * @param {object} registry - The registry object (proxy or original)
         */
        resetFlags: function (registry) {
            console.log('Resetting ModuleRegistry recursion flags');

            if (registry) {
                // Reset direct flags in the registry proxy
                registry._registering = false;
                registry._gettingModule = false;
                registry._checkingExists = false;

                // Reset inner flags if present
                if (registry._inner) {
                    registry._inner._registering = false;
                    registry._inner._gettingModule = false;
                    registry._inner._checkingExists = false;
                }
            }

            this.clearGlobalCounters();
        },

        /**
         * Clear global method call counters
         */
        clearGlobalCounters: function () {
            window._registryMethodCalls = {};
            window._moduleRegistryCallDepth = {};

            // Force garbage collection with recursion-breaker objects
            setTimeout(function () {
                // console.log('Forcing recursion breaker cleanup');
                window._lastRegisteredModule = null;
                window._lastMethodCall = null;
            }, 0);
        }
    };

    window.RPState = RPState;
})();
