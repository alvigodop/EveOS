/**
 * Module Registry Protection - Monitor Component
 * 
 * Monitors the registry for stuck recursion flags and call stack depth issues,
 * utilizing the shared RPState logic to reset them.
 */
(function () {
    'use strict';

    const RPMonitor = {
        /**
         * Start the monitoring interval
         * @param {object} registry - The registry object (usually window.ModuleRegistry)
         */
        startMonitoring: function (registry) {

            // Set up an emergency reset timer
            setInterval(() => {
                // If registry reference is stale or missing, try to update it
                const target = window.ModuleRegistry;

                // Check if we have recursion flags set that might be stuck
                if (target &&
                    (target._registering === true ||
                        target._gettingModule === true ||
                        target._checkingExists === true)) {

                    console.warn('Detected stuck recursion flags in ModuleRegistry, resetting');
                    if (window.RPState) {
                        window.RPState.resetFlags(target);
                    }
                }

                // Also check global method call depth
                if (window._moduleRegistryCallDepth) {
                    const depths = Object.values(window._moduleRegistryCallDepth);
                    if (depths.some(depth => depth > 2)) {
                        console.warn('Detected potential call stack issue, resetting registry call depth');
                        if (window.RPState) {
                            window.RPState.clearGlobalCounters();
                        }
                    }
                }
            }, 1000); // Check every second for faster response

            // Reset flags initially
            setTimeout(() => {
                if (window.RPState) {
                    window.RPState.resetFlags(window.ModuleRegistry);
                }
            }, 100);
        }
    };

    window.RPMonitor = RPMonitor;
})();
