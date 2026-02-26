/**
 * Module Registry Fix - Registry Enhancements
 * Extends ModuleRegistry with missing methods and ensures existence.
 */
const ModuleRegistryFixRegistry = {
    _initialized: false,

    init: function () {
        if (this._initialized) return;

        this.ensureRegistryExists();
        this.extendRegistry();

        this._initialized = true;
        console.log('ModuleRegistryFixRegistry initialized');

        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('ModuleRegistryFixRegistry', ModuleRegistryFixRegistry);
        }
    },

    ensureRegistryExists: function () {
        // Ensure ModuleRegistry exists
        if (!window.ModuleRegistry) {
            console.error('ModuleRegistry is not available, creating it via Fix');
            window.ModuleRegistry = {
                version: '1.0.2',
                _modules: {},
                _initialized: true,

                register: function (name, module) {
                    if (!name || !module) return null;

                    this._modules[name] = {
                        name: name,
                        instance: module,
                        version: module.version || '1.0.0',
                        registered: new Date()
                    };
                    return module;
                },

                get: function (name) {
                    return this._modules[name]?.instance || null;
                },

                exists: function (name) {
                    return !!this._modules[name];
                },

                isInitialized: function (name) {
                    if (!this._modules[name]) return false;
                    return this._modules[name].initialized === true ||
                        (this._modules[name].instance && this._modules[name].instance._initialized === true);
                },

                isRegistered: function (name) {
                    return !!this._modules[name];
                }
            };
        }
    },

    extendRegistry: function () {
        if (!window.ModuleRegistry) return;

        // Ensure exists/isRegistered alias
        if (!ModuleRegistry.exists && ModuleRegistry._modules) {
            ModuleRegistry.exists = function (name) { return !!this._modules[name]; };
        }
        if (!ModuleRegistry.isRegistered) {
            ModuleRegistry.isRegistered = function (name) { return this.exists(name); };
        }

        // Add getAllModules method if it doesn't exist
        if (typeof window.ModuleRegistry.getAllModules !== 'function') {
            window.ModuleRegistry.getAllModules = function () {
                const result = {};

                // If using modules object
                if (this.modules) {
                    Object.keys(this.modules).forEach(name => {
                        result[name] = {
                            name: name,
                            instance: this.modules[name],
                            version: this.modules[name].version || 'unknown',
                            initialized: this.modules[name]._initialized || false
                        };
                    });
                }
                // If using _modules object
                else if (this._modules) {
                    Object.keys(this._modules).forEach(name => {
                        result[name] = this._modules[name];
                    });
                }

                return result;
            };
        }

        // Add initModule method if it doesn't exist
        if (typeof window.ModuleRegistry.initModule !== 'function') {
            window.ModuleRegistry.initModule = function (moduleName) {
                // Get the module instance
                let module;
                if (this.modules && this.modules[moduleName]) {
                    module = this.modules[moduleName];
                } else if (this._modules && this._modules[moduleName]) {
                    module = this._modules[moduleName].instance;
                } else {
                    console.error(`Module ${moduleName} not found`);
                    return false;
                }

                // Skip if already initialized
                if (module._initialized) {
                    return true;
                }

                // Initialize the module if it has an init function
                if (typeof module.init === 'function') {
                    try {
                        module.init();
                        module._initialized = true;

                        // Also mark it as initialized in the registry
                        if (this._modules && this._modules[moduleName]) {
                            this._modules[moduleName].initialized = true;
                        }

                        return true;
                    } catch (e) {
                        console.error(`Error initializing module ${moduleName}:`, e);
                        return false;
                    }
                }

                return false;
            };
        }

        // Add initAllModules method to ModuleRegistry if it doesn't exist
        if (typeof window.ModuleRegistry.initAllModules !== 'function') {
            window.ModuleRegistry.initAllModules = function (options = {}) {
                let modules = this.getAllModules();

                // Normalize to array if it's an object (Legacy ModuleRegistry compatibility)
                if (modules && !Array.isArray(modules) && typeof modules === 'object') {
                    modules = Object.keys(modules).map(key => {
                        const mod = modules[key];
                        return {
                            name: mod.name || key,
                            instance: mod.instance || mod,
                            initialized: (mod.instance && mod.instance._initialized) || mod._initialized || false
                        };
                    });
                }

                if (!Array.isArray(modules)) {
                    console.warn('initAllModules: Unable to retrieve modules list');
                    return { success: 0, failed: 0, total: 0 };
                }

                let initCount = 0;
                let failCount = 0;

                modules.forEach(moduleData => {
                    if (!moduleData.initialized) {
                        try {
                            if (this.initModule(moduleData.name)) {
                                initCount++;
                            } else {
                                failCount++;
                            }
                        } catch (e) {
                            console.error(`Error initializing ${moduleData.name}:`, e);
                            failCount++;
                        }
                    }
                });

                return {
                    success: initCount,
                    failed: failCount,
                    total: modules.length
                };
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.ModuleRegistryFixRegistry = ModuleRegistryFixRegistry;
    ModuleRegistryFixRegistry.init();
}
