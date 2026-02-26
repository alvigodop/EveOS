/**
 * Module Fix Component - Registry Shim
 * Ensures ModuleRegistry exists and has required methods
 */
(function () {
    'use strict';
    window.ModuleFixComponents = window.ModuleFixComponents || {};

    window.ModuleFixComponents.RegistryShim = {
        /**
         * Ensure ModuleRegistry exists and has required methods
         */
        ensureModuleRegistry: function () {
            // Create ModuleRegistry if it doesn't exist
            if (!window.ModuleRegistry) {
                console.log('Creating ModuleRegistry');
                window.ModuleRegistry = {
                    version: '1.0.2',
                    _modules: {},
                    _initialized: true,

                    // Basic registration function
                    register: function (name, module) {
                        if (!name || !module) {
                            console.warn(`Invalid module registration attempt: ${name}`);
                            return null;
                        }

                        console.log(`Registering module: ${name}`);
                        this._modules[name] = {
                            name: name,
                            instance: module,
                            version: module.version || '1.0.0',
                            registered: new Date(),
                            initialized: module._initialized === true || false
                        };
                        return module;
                    },

                    // Check if a module exists
                    exists: function (name) {
                        return !!this._modules[name];
                    },

                    // Get a module
                    get: function (name) {
                        return this._modules[name]?.instance || null;
                    },

                    // Check if a module is initialized
                    isInitialized: function (name) {
                        if (!this._modules[name]) return false;
                        return this._modules[name].initialized === true ||
                            (this._modules[name].instance && this._modules[name].instance._initialized === true);
                    },

                    // Alias for exists for backwards compatibility
                    isRegistered: function (name) {
                        return !!this._modules[name];
                    },

                    // Get all modules
                    getAllModules: function () {
                        return { ...this._modules };
                    },

                    // Initialize a module
                    initModule: function (name) {
                        if (!this._modules[name]) return null;

                        const module = this._modules[name].instance;
                        if (typeof module.init === 'function') {
                            try {
                                module.init();
                                this._modules[name].initialized = true;
                                module._initialized = true;
                                return module;
                            } catch (e) {
                                console.error(`Error initializing module ${name}:`, e);
                            }
                        }
                        return module;
                    }
                };
            }

            // Make sure ModuleRegistry has all the methods it needs
            const registry = window.ModuleRegistry;

            // Add exists method if missing
            if (!registry.exists) {
                registry.exists = function (name) {
                    return !!this._modules[name];
                };
            }

            // Add isRegistered as alias for exists if missing
            if (!registry.isRegistered) {
                registry.isRegistered = function (name) {
                    return this.exists(name);
                };
            }

            // Add initModule method if missing
            if (!registry.initModule) {
                registry.initModule = function (name) {
                    if (!this._modules[name]) return null;

                    const module = this._modules[name].instance;
                    if (typeof module.init === 'function') {
                        try {
                            module.init();
                            this._modules[name].initialized = true;
                            module._initialized = true;
                            return module;
                        } catch (e) {
                            console.error(`Error initializing module ${name}:`, e);
                        }
                    }
                    return module;
                };
            }

            // Add getAllModules method if missing
            if (!registry.getAllModules) {
                registry.getAllModules = function () {
                    return { ...this._modules };
                };
            }

            // Make sure it's initialized
            registry._initialized = true;

            // Register the ModuleRegistry itself
            registry.register('ModuleRegistry', registry);

            // Register ModuleFix if available (will be handled by main module)
            // registry.register('ModuleFix', this);

            console.log('ModuleRegistry is ready (via RegistryShim)');
        }
    };
})();
