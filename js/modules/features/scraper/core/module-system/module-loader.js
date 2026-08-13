/**
 * Module Loader Helper
 * Provides helper functions for consistent module loading, registration and event dispatching
 */

const ModuleLoader = {
    version: '1.0.0',
    _initialized: true, // Add initialization flag

    /**
     * Initialize the module
     * @returns {Object} - The module instance
     */
    init: function () {
        // ModuleLoader init
        return this;
    },

    /**
     * Registers a module and dispatches the moduleLoaded event
     * @param {string} moduleName - The name of the module
     * @param {Object} moduleObject - The module object
     * @returns {Object} - The registered module
     */
    registerModule: function (moduleName, moduleObject) {
        // Registering module (silent)

        // Set common module properties
        if (moduleObject) {
            moduleObject._isStub = false;

            // Only set version if not already set
            if (!moduleObject.version) {
                moduleObject.version = '1.0.0';
            }

            // Add common module properties
            if (!moduleObject.hasOwnProperty('installed')) {
                moduleObject.installed = true;
            }
        }

        // Register with the ModuleRegistry if available
        if (window.ModuleRegistry) {
            window.ModuleRegistry.register(moduleName, moduleObject);
        }

        // Make globally available
        window[moduleName] = moduleObject;

        // Dispatch module loaded event
        this.dispatchModuleLoadedEvent(moduleName, moduleObject);

        return moduleObject;
    },

    /**
     * Dispatches a moduleLoaded event
     * @param {string} moduleName - The name of the module
     * @param {Object} moduleObject - The module object
     */
    dispatchModuleLoadedEvent: function (moduleName, moduleObject) {
        if (!moduleObject._eventDispatched) {
            moduleObject._eventDispatched = true;

            // Use the helper function if available
            if (typeof window.dispatchModuleLoadedEvent === 'function') {
                window.dispatchModuleLoadedEvent(moduleName);
            } else {
                // Otherwise dispatch the event directly
                const event = new CustomEvent('moduleLoaded', {
                    detail: {
                        moduleName: moduleName,
                        module: moduleObject,
                        source: 'module-loader'
                    }
                });
                // Dispatching moduleLoaded event
                window.dispatchEvent(event);
            }
        }
    },

    /**
     * Creates a standardized module init function
     * @param {string} moduleName - The name of the module
     * @param {function} initFunction - The function to run for initialization
     * @returns {function} - The standardized init function
     */
    createInitFunction: function (moduleName, initFunction) {
        return function () {
            // Initializing module

            try {
                // Call the provided init function
                const result = initFunction.apply(this, arguments);

                // Dispatch another module loaded event after initialization
                ModuleLoader.dispatchModuleLoadedEvent(moduleName, window[moduleName]);

                return result;
            } catch (error) {
                console.error(`Error initializing ${moduleName}:`, error);
                return this;
            }
        };
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleLoader', ModuleLoader);
    // ModuleLoader registered
}

// Make globally available
window.ModuleLoader = ModuleLoader;

// Self-initialize
ModuleLoader.init();

// Self-register (dispatch event for itself)
ModuleLoader.dispatchModuleLoadedEvent('ModuleLoader', ModuleLoader);

// Also dispatch an event on document for broader detection
if (typeof CustomEvent === 'function' && typeof document.dispatchEvent === 'function') {
    const event = new CustomEvent('moduleLoaded', {
        detail: {
            moduleName: 'ModuleLoader',
            module: ModuleLoader,
            source: 'module-loader.js?v=80dbc0f5fb10'
        }
    });
    document.dispatchEvent(event);
}

// Module Loader ready