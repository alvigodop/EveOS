/**
 * Registry Guard - Safe Register
 * Creates a safe register method that prevents recursion
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const RGSafeRegister = {
        version: '1.0.0',

        init: function () {
            console.log('RGSafeRegister initialized');
            return this;
        },

        /**
         * Create a safer register method that won't cause recursion
         * @param {Object} registry - The registry to protect
         * @returns {Function} - The safe register function
         */
        createSafeRegister: function (registry) {
            // Save the original method if it exists
            const originalRegister = typeof registry.register === 'function' ? registry.register : null;

            // Return a safe implementation that prevents recursion
            return function safeRegister(name, module) {
                // Skip if already in a register call
                if (this._safeRegisterActive === true) {
                    console.log(`RGSafeRegister: Prevented recursive register for ${name}`);
                    return module;
                }

                // Set recursion protection flag
                this._safeRegisterActive = true;

                try {
                    // Direct implementation for safety
                    if (!this.modules) {
                        this.modules = {};
                    }

                    // Store the module directly
                    this.modules[name] = module;

                    // Store in _modules format if that structure exists
                    if (this._modules) {
                        this._modules[name] = {
                            name: name,
                            instance: module,
                            version: module.version || '1.0.0',
                            registered: new Date(),
                            initialized: module._initialized === true
                        };
                    }

                    // Clear flag and return
                    this._safeRegisterActive = false;

                    // If module doesn't exist in global space, add it
                    if (window[name] === undefined && module) {
                        window[name] = module;
                    }

                    return module;
                } catch (e) {
                    console.error('RGSafeRegister: Error in safe register', e);
                    this._safeRegisterActive = false;

                    // Always store the module even on error
                    if (name && module) {
                        if (!this.modules) this.modules = {};
                        this.modules[name] = module;

                        if (!this._modules) this._modules = {};
                        this._modules[name] = {
                            name: name,
                            instance: module,
                            version: module.version || '1.0.0',
                            registered: new Date(),
                            initialized: module._initialized === true
                        };
                    }

                    return module;
                }
            };
        },

        /**
         * Reset ModuleRegistry flags
         * @param {Object} registry - The registry to reset
         */
        resetFlags: function (registry) {
            if (!registry) return false;

            // Clear recursion flags
            if (registry._registering) registry._registering = false;
            if (registry._gettingModule) registry._gettingModule = false;
            if (registry._checkingExists) registry._checkingExists = false;
            if (registry._safeRegisterActive) registry._safeRegisterActive = false;

            // Clear inner flags if they exist
            if (registry._inner) {
                if (registry._inner._registering) registry._inner._registering = false;
                if (registry._inner._gettingModule) registry._inner._gettingModule = false;
                if (registry._inner._checkingExists) registry._inner._checkingExists = false;
                if (registry._inner._safeRegisterActive) registry._inner._safeRegisterActive = false;
            }

            // Reset method call tracking
            window._registryMethodCalls = {};
            window._moduleRegistryCallDepth = {};

            return true;
        },

        /**
         * Check if registry has stuck flags
         * @param {Object} registry - The registry to check
         * @returns {boolean} - True if stuck flags detected
         */
        hasStuckFlags: function (registry) {
            if (!registry) return false;
            return (
                registry._registering === true ||
                registry._gettingModule === true ||
                registry._checkingExists === true ||
                registry._safeRegisterActive === true
            );
        }
    };

    // Expose globally
    window.RGSafeRegister = RGSafeRegister;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('RGSafeRegister', RGSafeRegister);
    }
})();
