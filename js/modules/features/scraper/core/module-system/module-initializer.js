/**
 * Module Initializer
 * Ensures all modules are properly loaded, registered and initialized
 * This runs as a final safety check after all scripts have loaded
 */

const ModuleInitializer = {
    version: '1.0.0',
    _initialized: true,

    /**
     * Initialize the ModuleInitializer
     */
    init: function () {
        // ModuleInitializer init

        // Ensure ModuleRegistry exists before continuing
        this.ensureModuleRegistryExists();

        // Add event listener for page load
        window.addEventListener('load', this.ensureAllModulesRegistered.bind(this));

        // Also run immediately in case the page is already loaded
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(this.ensureAllModulesRegistered.bind(this), 100);
        }

        return this;
    },

    /**
     * Ensure the ModuleRegistry exists
     */
    ensureModuleRegistryExists: function () {
        if (!window.ModuleRegistry) {
            console.warn('ModuleRegistry not found, creating a basic implementation');

            window.ModuleRegistry = {
                version: '1.0.0',
                modules: {},
                dependencies: {},
                _initialized: true,

                register: function (name, module, dependencies = []) {
                    if (!name || !module) return false;
                    this.modules[name] = module;
                    this.dependencies[name] = dependencies;
                    // Module registered
                    return true;
                },

                getModule: function (name) {
                    return this.modules[name] || null;
                },

                hasModule: function (name) {
                    return !!this.modules[name];
                },

                getAllModules: function () {
                    return { ...this.modules };
                }
            };
        }
    },

    /**
     * Ensure all core modules are properly registered
     */
    ensureAllModulesRegistered: function () {
        // Final registration check (silent)

        // Ensure ModuleRegistry exists
        this.ensureModuleRegistryExists();

        // List of critical modules that must be available
        const criticalModules = [
            'StorageManager',
            'CacheManager',
            'ModuleRegistry',
            'GlobalFix',
            'ModuleLoader',
            'CORSProxyManager',
            'ErrorSuppressor'
        ];

        // Special module registration map
        const moduleSourceMap = {
            'GlobalFix': 'js/modules/core/global-fix.js',
            'ModuleLoader': 'js/modules/core/module-loader.js',
            'CORSProxyManager': 'js/modules/utils/cors-proxy-manager.js',
            'ErrorSuppressor': 'js/modules/utils/error-suppressor.js'
        };

        // Check if modules exist in ModuleRegistry but not in window
        if (window.ModuleRegistry) {
            // Check for modules in ModuleRegistry.modules
            if (window.ModuleRegistry.modules) {
                Object.keys(window.ModuleRegistry.modules).forEach(moduleName => {
                    if (!window[moduleName] && window.ModuleRegistry.modules[moduleName]) {
                        // Exposing module to global
                        window[moduleName] = window.ModuleRegistry.modules[moduleName];
                    }
                });
            }

            // Check for modules in ModuleRegistry._modules
            if (window.ModuleRegistry._modules) {
                Object.keys(window.ModuleRegistry._modules).forEach(moduleName => {
                    if (!window[moduleName] && window.ModuleRegistry._modules[moduleName]?.instance) {
                        // Exposing from _modules
                        window[moduleName] = window.ModuleRegistry._modules[moduleName].instance;
                    }
                });
            }
        }

        // Fix specific modules first
        this.ensureModuleRegistered('GlobalFix', window.GlobalFix);
        this.ensureModuleRegistered('ModuleLoader', window.ModuleLoader);

        // Check for all critical modules
        let missingModules = [];
        criticalModules.forEach(moduleName => {
            if (!window[moduleName]) {
                console.warn(`Critical module ${moduleName} is missing`);
                missingModules.push(moduleName);
            } else {
                this.registerModuleWithRegistry(moduleName, window[moduleName]);
            }
        });

        // If any critical modules are missing, try to load them
        if (missingModules.length > 0) {
            console.warn(`Missing critical modules: ${missingModules.join(', ')}`);

            // Try to load missing modules
            missingModules.forEach(moduleName => {
                if (moduleSourceMap[moduleName]) {
                    this.loadScript(moduleSourceMap[moduleName], () => {
                        // Module loaded
                        if (window[moduleName]) {
                            this.registerModuleWithRegistry(moduleName, window[moduleName]);
                        }
                    });
                }
            });
        }

        // Register all available modules if they weren't already registered
        for (const key in window) {
            try {
                // Safely check if the property is a module object
                let obj = window[key];

                // Skip if it's a window object (self-reference) or window-like
                if (obj && obj.self === obj && obj.window === obj) continue;

                if (typeof obj === 'object' &&
                    obj !== null &&
                    obj.version && // This might throw specific cross-origin errors if not caught
                    !window.ModuleRegistry.hasModule(key)) {

                    // Registering unregistered module
                    this.registerModuleWithRegistry(key, obj);
                }
            } catch (e) {
                // Ignore SecurityError from cross-origin frames
            }
        }

        // Ensure ModuleRegistry modules property includes GlobalFix and ModuleLoader
        if (window.ModuleRegistry && window.ModuleRegistry.modules) {
            if (window.GlobalFix) {
                window.ModuleRegistry.modules.GlobalFix = window.GlobalFix;
            }
            if (window.ModuleLoader) {
                window.ModuleRegistry.modules.ModuleLoader = window.ModuleLoader;
            }
        }

        // Registration check done
    },

    /**
     * Ensure a specific module is registered in the global scope
     * @param {string} moduleName - The name of the module
     * @param {Object} moduleObject - The module object
     */
    ensureModuleRegistered: function (moduleName, moduleObject) {
        if (!moduleObject) {
            console.warn(`Cannot register ${moduleName} - module object is not available`);
            return;
        }

        // Ensure the module is in the global namespace
        if (!window[moduleName]) {
            // Exposing to global
            window[moduleName] = moduleObject;
        }

        // Register with ModuleRegistry
        this.registerModuleWithRegistry(moduleName, moduleObject);
    },

    /**
     * Register a module with the ModuleRegistry
     * @param {string} moduleName - The name of the module
     * @param {Object} moduleObject - The module object
     */
    registerModuleWithRegistry: function (moduleName, moduleObject) {
        // Ensure the module is initialized
        if (!moduleObject._initialized && typeof moduleObject.init === 'function') {
            // Initializing (silent)
            moduleObject.init();
            moduleObject._initialized = true;
        }

        // Register with ModuleRegistry
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            // Ensuring registered
            window.ModuleRegistry.register(moduleName, moduleObject);
        }

        // Ensure it's in the modules property
        if (window.ModuleRegistry && window.ModuleRegistry.modules) {
            window.ModuleRegistry.modules[moduleName] = moduleObject;
        }

        // Dispatch a moduleLoaded event for the module
        this.dispatchModuleLoadedEvent(moduleName, moduleObject);
    },

    /**
     * Dispatch a moduleLoaded event for a module
     * @param {string} moduleName - The name of the module
     * @param {Object} moduleObject - The module object
     */
    dispatchModuleLoadedEvent: function (moduleName, moduleObject) {
        // Create and dispatch the event
        if (typeof CustomEvent === 'function' && typeof document.dispatchEvent === 'function') {
            const event = new CustomEvent('moduleLoaded', {
                detail: {
                    moduleName: moduleName,
                    module: moduleObject,
                    source: 'ModuleInitializer'
                }
            });
            document.dispatchEvent(event);
        }
    },

    /**
     * Load a script dynamically
     * @param {string} src - The source URL of the script
     * @param {Function} callback - Function to call when script is loaded
     */
    loadScript: function (src, callback) {
        const script = document.createElement('script');
        script.src = src;
        script.onload = callback;
        document.head.appendChild(script);
    }
};

// Register the module with ModuleRegistry
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleInitializer', ModuleInitializer);
}

// Make the module globally available
window.ModuleInitializer = ModuleInitializer;

// Self-initialize
ModuleInitializer.init();

// Module Initializer ready