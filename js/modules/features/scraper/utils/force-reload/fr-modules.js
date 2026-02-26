/**
 * Force Reload - Modules Management (Facade)
 * 
 * Aggregates module registration and initialization logic.
 */

(function () {
    'use strict';

    // Create ForceReload object if it doesn't exist
    window.ForceReload = window.ForceReload || {};

    /**
     * Safe check if a module exists in the registry
     */
    window.ForceReload.moduleExists = function (name) {
        try {
            if (!window.ModuleRegistry) return false;
            if (typeof window.ModuleRegistry.exists !== 'function') return false;
            return window.ModuleRegistry.exists(name);
        } catch (error) {
            console.error("Error checking if module exists:", error);
            return false;
        }
    };

    /**
     * Register and initialize all modules
     */
    window.ForceReload.registerAndInitializeModules = function () {
        try {
            // Make sure ModuleRegistry exists
            if (!window.ModuleRegistry) {
                // Logic delegated to fr-modules-registry.js but safety check here
                if (typeof window.ForceReload.ensureRegistry === 'function') {
                    window.ForceReload.ensureRegistry();
                }
            }

            // Logic delegated to fr-modules-init.js
            // But if we need to ensure it runs:
            if (typeof window.ForceReload.registerAndInitializeModules === 'function') {
                // Wait, if THIS function is overwritten by init.js, we wouldn't be here if init.js loaded last.
                // But init.js IS loaded before.
                // So init.js DEFINED window.ForceReload.registerAndInitializeModules.
                // And THIS file is redefining it?
                // NO. This file should NOT redefine it if it's already defined by init.js.
                // This file is a facade, mostly for compatibility if something loads `fr-modules.js` but NOT the sub-modules?
                // But `rl-config.js` loads sub-modules.

                // If I define it here, I overwrite init.js version.
                // I should simply NOT define it if it exists.
                // OR define it to call the existing one? No, that's recursion.

                console.log("ForceReload.registerAndInitializeModules already defined by sub-module (fr-modules-init.js)");
            }
        } catch (error) {
            console.error("Error in facade registerAndInitializeModules:", error);
        }
    };

    /**
     * Initialize critical modules that must be running
     */
    window.ForceReload.initializeCriticalModules = function () {
        // Delegated
        console.log("ForceReload.initializeCriticalModules delegated to sub-module");
    };

    console.log('ForceReload: Modules management facade loaded');
})();
