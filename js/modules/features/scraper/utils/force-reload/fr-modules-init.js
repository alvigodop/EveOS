/**
 * Force Reload - Module Initialization
 * Handles iterating over module lists and initializing them.
 */
(function () {
    'use strict';

    window.ForceReload = window.ForceReload || {};

    /**
     * Initialize critical modules that must be running
     */
    window.ForceReload.initializeCriticalModules = function () {
        try {
            // List of critical modules that must be initialized
            const criticalModules = window.ForceReloadConfig ? window.ForceReloadConfig.criticalModules : [];

            if (!window.ForceReloadConfig) {
                console.warn('ForceReloadConfig not found, critical module list is empty');
            }

            // Ensure criticalModules is an array before processing
            if (!Array.isArray(criticalModules)) {
                console.error("criticalModules is not an array:", criticalModules);
                return;
            }

            let initializedCount = 0;

            // Use a standard for loop instead of forEach for better compatibility
            for (let i = 0; i < criticalModules.length; i++) {
                try {
                    const moduleName = criticalModules[i];
                    if (!moduleName) {
                        console.warn("Undefined critical module name at index", i);
                        continue;
                    }

                    if (window[moduleName] && typeof window[moduleName].init === 'function') {
                        const isInitialized = window[moduleName]._initialized === true;
                        if (!isInitialized) {
                            console.log(`Explicitly initializing ${moduleName} module`);
                            try {
                                window[moduleName].init();
                                window[moduleName]._initialized = true;
                                initializedCount++;
                                console.log(`${moduleName} initialized successfully`);
                            } catch (initError) {
                                console.error(`Error initializing ${moduleName}:`, initError);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing critical module at index ${i}:`, error);
                }
            }

            console.log(`Explicitly initialized ${initializedCount} critical modules`);
        } catch (error) {
            console.error("Error in initializeCriticalModules:", error);
        }
    };

    /**
     * Register and initialize all modules
     */
    window.ForceReload.registerAndInitializeModules = function () {
        try {
            // Ensure registry is ready
            if (typeof window.ForceReload.ensureRegistry === 'function') {
                window.ForceReload.ensureRegistry();
            }

            // List of all modules to check and register
            const modulesToRegister = window.ForceReloadConfig ? window.ForceReloadConfig.modulesToRegister : [];

            if (!window.ForceReloadConfig) {
                console.warn('ForceReloadConfig not found, module registration list is empty');
            }

            // Ensure modulesToRegister is an array before using forEach
            if (!Array.isArray(modulesToRegister)) {
                console.error("modulesToRegister is not an array:", modulesToRegister);
                return;
            }

            // Register all modules that exist
            let registeredCount = 0;
            let initializedCount = 0;

            // Use a standard for loop instead of forEach for better compatibility
            for (let i = 0; i < modulesToRegister.length; i++) {
                try {
                    const moduleName = modulesToRegister[i];
                    if (!moduleName) {
                        console.warn("Undefined module name at index", i);
                        continue;
                    }

                    if (window[moduleName]) {
                        // Use ForceReload.moduleExists helper
                        if (typeof window.ForceReload.moduleExists === 'function' && !window.ForceReload.moduleExists(moduleName)) {
                            console.log(`Registering module ${moduleName} with ModuleRegistry`);
                            window.ModuleRegistry.register(moduleName, window[moduleName]);
                            registeredCount++;
                        } else if (!window.ForceReload.moduleExists && window.ModuleRegistry && !window.ModuleRegistry.exists(moduleName)) {
                            // Fallback if helper missing
                            window.ModuleRegistry.register(moduleName, window[moduleName]);
                            registeredCount++;
                        }

                        // Initialize modules that have init functions but aren't initialized
                        if (typeof window[moduleName].init === 'function') {
                            const isInitialized = window[moduleName]._initialized === true;
                            if (!isInitialized) {
                                console.log(`Initializing module ${moduleName}`);
                                try {
                                    window[moduleName].init();
                                    initializedCount++;
                                } catch (initError) {
                                    console.error(`Error initializing ${moduleName}:`, initError);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing module at index ${i}:`, error);
                }
            }

            console.log(`Registered ${registeredCount} modules and initialized ${initializedCount} modules with ModuleRegistry`);

            // Ensure script-no-modules.js functions are accessible
            if (typeof forceInitializeAllModules === 'function') {
                console.log("Using forceInitializeAllModules function");
                forceInitializeAllModules();
            }

            // Try manual reinitialization if ModuleInitializer is available
            if (window.ModuleInitializer && typeof ModuleInitializer.initializeAllModules === 'function') {
                console.log("Using ModuleInitializer.initializeAllModules()");
                ModuleInitializer.initializeAllModules();
            }

            // For ModuleRegistry, use the built-in functionality if available
            if (window.ModuleRegistry && typeof window.ModuleRegistry.initAllModules === 'function') {
                console.log("Using ModuleRegistry.initAllModules()");
                window.ModuleRegistry.initAllModules();
            }

            // Explicitly initialize critical modules
            this.initializeCriticalModules(); // calls window.ForceReload.initializeCriticalModules due to this binding

            console.log("Module registration and initialization complete");
        } catch (error) {
            console.error("Error in registerAndInitializeModules:", error);
        }
    };

    console.log('ForceReload: Initialization module loaded');
})();
