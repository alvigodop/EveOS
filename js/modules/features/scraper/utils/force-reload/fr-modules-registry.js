/**
 * Force Reload - Module Registry Interaction
 * Handles checks and registration with the system ModuleRegistry.
 */
(function () {
    'use strict';

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
     * Ensure ModuleRegistry exists and is functional
     */
    window.ForceReload.ensureRegistry = function () {
        // Make sure ModuleRegistry exists
        if (!window.ModuleRegistry) {
            console.log("Creating temporary ModuleRegistry");
            window.ModuleRegistry = {
                _modules: {},
                register: function (name, module) {
                    console.log('Registering module:', name);
                    this._modules[name] = module;
                },
                get: function (name) {
                    return this._modules[name];
                },
                exists: function (name) {
                    return !!this._modules[name];
                }
            };
        }

        // If ModuleRegistry.exists is not a function, add it
        if (typeof window.ModuleRegistry.exists !== 'function') {
            console.log('Adding exists method to ModuleRegistry');
            window.ModuleRegistry.exists = function (name) {
                return !!this._modules[name];
            };
        }

        // Make sure ModuleRegistryFix is working properly
        if (window.ModuleRegistryFix) {
            console.log("Ensuring ModuleRegistryFix is functional");
            window.ModuleRegistryFix._initialized = true;

            // If it has a runFixes method, call it
            if (typeof ModuleRegistryFix.runFixes === 'function') {
                console.log("Running ModuleRegistryFix.runFixes()");
                ModuleRegistryFix.runFixes();
            }
        }
    };

    console.log('ForceReload: Registry module loaded');
})();
