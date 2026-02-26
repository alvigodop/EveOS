/**
 * Module Fix Component - Auto Recovery
 * Set up automatic repair of modules
 */
(function () {
    'use strict';
    window.ModuleFixComponents = window.ModuleFixComponents || {};

    window.ModuleFixComponents.AutoRecovery = {
        /**
         * Set up automatic repair of modules
         */
        setupAutoRepair: function () {
            // Prevent multiple runs - use global flag
            if (window._autoRecoveryHasRun) return;
            window._autoRecoveryHasRun = true;

            // Run repair after a delay to ensure all scripts are loaded
            setTimeout(function () {

                // If there's a repair function defined, use it
                if (typeof window.repairApplication === 'function') {
                    try {
                        window.repairApplication();
                    } catch (e) {
                        console.error('Error during automatic repair:', e);
                    }
                } else {
                    // Otherwise, run our own repair
                    if (window.ModuleFix && window.ModuleFix.forceRegisterAllModules) {
                        window.ModuleFix.forceRegisterAllModules();
                    }
                    if (window.ModuleFix && window.ModuleFix.initializeAllModules) {
                        window.ModuleFix.initializeAllModules();
                    }
                }

                // Run error display fix again after repair
                if (window.ModuleFix && window.ModuleFix.fixErrorDisplay) {
                    window.ModuleFix.fixErrorDisplay();
                }
            }, 2000);
        },

        /**
         * Force register any modules that appear to be modules but aren't registered
         */
        forceRegisterAllModules: function () {
            console.log('Attempting to force-register all module-like objects');

            // Find all potential module names in the global scope
            const potentialModuleNames = Object.keys(window).filter(key => {
                const obj = window[key];
                return typeof obj === 'object' &&
                    obj !== null &&
                    obj !== window &&
                    !Array.isArray(obj) &&
                    key.length > 2 && // Skip short names like 'i' or 'e'
                    key[0].toUpperCase() === key[0]; // Modules typically start with uppercase
            });

            let registered = 0;

            // Safely check if a module is registered
            const safeExists = function (name) {
                if (!window.ModuleRegistry) return false;
                if (typeof window.ModuleRegistry.exists === 'function') {
                    try {
                        return window.ModuleRegistry.exists(name);
                    } catch (e) {
                        return false;
                    }
                }
                // Fallback implementation if exists() is not a function
                return window.ModuleRegistry._modules && !!window.ModuleRegistry._modules[name];
            };

            // Safely register a module
            const safeRegister = function (name, module) {
                if (!window.ModuleRegistry) {
                    console.error('ModuleRegistry not available for registration');
                    return null;
                }

                try {
                    if (typeof window.ModuleRegistry.register === 'function') {
                        return window.ModuleRegistry.register(name, module);
                    } else {
                        console.warn('ModuleRegistry.register is not a function, using fallback');
                        if (!window.ModuleRegistry._modules) window.ModuleRegistry._modules = {};
                        window.ModuleRegistry._modules[name] = {
                            name: name,
                            instance: module,
                            version: module.version || '1.0.0',
                            registered: new Date(),
                            initialized: module._initialized === true || false
                        };
                        return module;
                    }
                } catch (e) {
                    console.error('Error in safeRegister:', e);
                    return null;
                }
            };

            potentialModuleNames.forEach(name => {
                const obj = window[name];

                // Skip if already registered
                if (safeExists(name)) {
                    return;
                }

                // Check if it looks like a module
                if ((obj.version || typeof obj.init === 'function' || obj._initialized !== undefined) &&
                    typeof obj !== 'function') {

                    try {
                        console.log(`Force-registering module: ${name}`);
                        safeRegister(name, obj);
                        registered++;
                    } catch (error) {
                        console.error(`Error registering module ${name}:`, error);
                    }
                }
            });

            console.log(`Forced registration of ${registered} modules`);
        },

        /**
         * Initialize all modules
         */
        initializeAllModules: function () {
            if (!window.ModuleRegistry) return;

            console.log('Initializing all modules');

            // getAllModules may return an object or array depending on implementation
            let modulesData = window.ModuleRegistry.getAllModules();

            // Convert to array if it's an object
            let modules;
            if (Array.isArray(modulesData)) {
                modules = modulesData;
            } else if (modulesData && typeof modulesData === 'object') {
                // getAllModules returns an object like {name: moduleData}
                modules = Object.entries(modulesData).map(([name, data]) => ({
                    name,
                    instance: data.instance || data,
                    initialized: data.initialized || data._initialized || false,
                    ...data
                }));
            } else {
                console.warn('getAllModules returned unexpected format, skipping initialization');
                return;
            }

            // First initialize core modules
            const coreModules = ['ModuleRegistry', 'StorageManager', 'CacheManager', 'EventBus'];
            coreModules.forEach(name => {
                try {
                    if (window.ModuleRegistry._modules[name] &&
                        !window.ModuleRegistry._modules[name].initialized) {
                        console.log(`Initializing core module: ${name}`);
                        window.ModuleRegistry.initModule(name);
                    }
                } catch (e) {
                    console.error(`Error initializing core module ${name}:`, e);
                }
            });

            // Then initialize UI modules
            const uiModules = ['UI', 'TabManager', 'PopupManager', 'ResultDisplay'];
            uiModules.forEach(name => {
                try {
                    if (window.ModuleRegistry._modules[name] &&
                        !window.ModuleRegistry._modules[name].initialized) {
                        console.log(`Initializing UI module: ${name}`);
                        window.ModuleRegistry.initModule(name);
                    }
                } catch (e) {
                    console.error(`Error initializing UI module ${name}:`, e);
                }
            });

            // Then initialize feature modules
            const featureModules = ['WikiManager', 'SearchManager', 'FandomSearch', 'Discovery'];
            featureModules.forEach(name => {
                try {
                    if (window.ModuleRegistry._modules[name] &&
                        !window.ModuleRegistry._modules[name].initialized) {
                        console.log(`Initializing feature module: ${name}`);
                        window.ModuleRegistry.initModule(name);
                    }
                } catch (e) {
                    console.error(`Error initializing feature module ${name}:`, e);
                }
            });

            // Initialize any remaining uninitialized modules
            for (const moduleData of modules) {
                try {
                    if (!moduleData.initialized &&
                        typeof moduleData.instance?.init === 'function' &&
                        !coreModules.includes(moduleData.name) &&
                        !uiModules.includes(moduleData.name) &&
                        !featureModules.includes(moduleData.name)) {

                        console.log(`Initializing module: ${moduleData.name}`);
                        moduleData.instance.init();
                        moduleData.initialized = true;
                        moduleData.instance._initialized = true;
                    }
                } catch (e) {
                    console.error(`Error initializing module ${moduleData.name}:`, e);
                }
            }

            console.log('Module initialization complete');
        }
    };
})();
