/**
 * Module Helper (Facade) - Utilities to help modules work with file:// protocol
 * This file should be included right after modern-fix.js
 * 
 * Delegates to:
 * - MHAjax: AJAX utilities
 * - MHRegistry: Module registration utilities
 * 
 * @version 1.1.0-facade
 */

// Create a function to configure modules to work with our system
function configureModule(moduleName, moduleObject) {
    // Make sure it's registered in the ModuleRegistry
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register(moduleName, moduleObject);
    }

    // Make sure it's available globally
    window[moduleName] = moduleObject;

    // Add standard init function if missing
    if (!moduleObject.init) {
        moduleObject.init = function () {
            console.log(`Initializing ${moduleName} (auto-generated init)`);
            return this;
        };
    }

    // Patch any fetch calls in the module
    for (const key in moduleObject) {
        if (typeof moduleObject[key] === 'function') {
            const originalFn = moduleObject[key];
            moduleObject[key] = function (...args) {
                try {
                    return originalFn.apply(moduleObject, args);
                } catch (e) {
                    console.error(`Error in ${moduleName}.${key}:`, e);
                    throw e;
                }
            };
        }
    }

    return moduleObject;
}

// Create ModuleHelper namespace (Facade)
const ModuleHelper = {
    version: '1.1.0-facade',
    loaded: true,
    _initialized: true,

    /**
     * Configures a module to work with our system
     */
    configureModule: function (moduleName, moduleObject) {
        // Make sure it's registered in the ModuleRegistry
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register(moduleName, moduleObject);
        }

        // Make sure it's available globally
        window[moduleName] = moduleObject;

        // Add standard init function if missing
        if (!moduleObject.init) {
            moduleObject.init = function () {
                return this;
            };
        }

        // Patch any fetch calls in the module
        for (const key in moduleObject) {
            if (typeof moduleObject[key] === 'function') {
                const originalFn = moduleObject[key];
                moduleObject[key] = function (...args) {
                    try {
                        return originalFn.apply(moduleObject, args);
                    } catch (e) {
                        console.error(`Error in ${moduleName}.${key}:`, e);
                        throw e;
                    }
                };
            }
        }

        return moduleObject;
    },

    /**
     * Initializes a module by name
     */
    initialize: function (moduleName) {
        if (window[moduleName] && typeof window[moduleName].init === 'function') {
            try {
                const result = window[moduleName].init();
                window[moduleName]._initialized = true;

                if (window.ModuleRegistry && window.ModuleRegistry._modules &&
                    window.ModuleRegistry._modules[moduleName]) {
                    window.ModuleRegistry._modules[moduleName].initialized = true;
                }

                return result || window[moduleName];
            } catch (e) {
                console.error(`Error initializing module: ${moduleName}`, e);
                return null;
            }
        }
        return null;
    },

    /**
     * Forces registration of all modules - delegates to MHRegistry
     */
    forceRegisterAllModules: function () {
        if (window.MHRegistry) {
            return MHRegistry.forceRegisterAllModules();
        }
        console.warn('MHRegistry not available');
    },

    /**
     * Loads a script dynamically
     */
    loadScript: function (src, callback) {
        const script = document.createElement('script');
        script.src = src;
        script.onload = callback;
        document.head.appendChild(script);
    },

    /**
     * Checks if a module is loaded
     */
    isLoaded: function (moduleName) {
        return window[moduleName] !== undefined;
    },

    /**
     * Gets the list of module names - delegates to MHRegistry
     */
    getModuleNames: function () {
        if (window.MHRegistry) {
            return MHRegistry.getModuleNames();
        }
        if (window.ModuleRegistry && window.ModuleRegistry._modules) {
            return Object.keys(window.ModuleRegistry._modules);
        }
        return [];
    },

    init: function () {
        if (window.MHAjax && typeof MHAjax.init === 'function') {
            MHAjax.init();
            MHAjax._initialized = true;
        }
        if (window.MHRegistry && typeof MHRegistry.init === 'function') {
            MHRegistry.init();
            MHRegistry._initialized = true;
        }
        this._initialized = true;
        return this;
    }
};

// Make ModuleHelper globally available
window.ModuleHelper = ModuleHelper;

// Explicitly set initialized flag
ModuleHelper._initialized = true;

// Register ModuleHelper with ModuleRegistry
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleHelper', ModuleHelper);
} else {
    console.warn('ModuleRegistry not available for registering ModuleHelper');
}

// If ModuleLoader is available, register with it too
if (window.ModuleLoader && typeof ModuleLoader.registerModule === 'function') {
    ModuleLoader.registerModule('ModuleHelper', ModuleHelper);
}

// Auto-initialize all modules after a small delay
// Auto-initialize all modules after a small delay
setTimeout(function () {
    if (ModuleHelper.init) ModuleHelper.init();
    ModuleHelper.forceRegisterAllModules();
}, 1000);