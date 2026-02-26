/**
 * Module Debugger
 * 
 * Provides tools for debugging module loading and initialization issues
 * 
 * @version 1.0.0
 */

// Create namespace
const ModuleDebugger = {
    version: '1.0.0',
    _initialized: true,

    /**
     * Initialize the debugger
     */
    init: function () {
        // ModuleDebugger init

        // Add debugging utilities to console
        this.exposeConsoleCommands();

        // Add keyboard shortcut to show status (Alt+D)
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'd') {
                this.showModuleStatus();
            }
        });

        return this;
    },

    /**
     * Expose debugging commands to the console
     */
    exposeConsoleCommands: function () {
        window.debugModules = this.showModuleStatus.bind(this);
        window.fixRegistry = this.fixModuleRegistry.bind(this);
        window.reregisterModule = this.reregisterModule.bind(this);

        // Debug commands exposed
    },

    /**
     * Show the status of all modules
     */
    showModuleStatus: function () {
        // Create status summary object
        const status = {
            total: 0,
            registered: 0,
            unregistered: 0,
            initialized: 0,
            modules: {}
        };

        // Check each module in the window object
        for (const key in window) {
            if (typeof window[key] === 'object' && window[key] !== null && window[key].version) {
                status.total++;
                status.modules[key] = {
                    loaded: true,
                    registered: window.ModuleRegistry && window.ModuleRegistry.hasModule ? window.ModuleRegistry.hasModule(key) : false,
                    initialized: !!window[key]._initialized,
                    version: window[key].version || 'unknown'
                };

                if (status.modules[key].registered) {
                    status.registered++;
                } else {
                    status.unregistered++;
                }

                if (status.modules[key].initialized) {
                    status.initialized++;
                }
            }
        }

        // Create console group for module status
        console.group('Module Status Summary');
        // Module status summary (use debugModules() for details)
        // Registered count: status.registered
        // Unregistered count: status.unregistered
        // Initialized count: status.initialized
        console.groupEnd();

        // Create console group for detailed module status
        console.group('Module Details');
        for (const moduleName in status.modules) {
            const module = status.modules[moduleName];
            console.log(
                `${moduleName}: ${module.loaded ? '✓' : '✗'} Loaded, ` +
                `${module.registered ? '✓' : '✗'} Registered, ` +
                `${module.initialized ? '✓' : '✗'} Initialized, ` +
                `v${module.version}`
            );
        }
        console.groupEnd();

        return status;
    },

    /**
     * Fix module registry issues
     */
    fixModuleRegistry: function () {
        // Guard against multiple runs
        if (this._registryFixed) return this.showModuleStatus();
        this._registryFixed = true;

        // First ensure ModuleRegistry exists
        if (!window.ModuleRegistry) {
            window.ModuleRegistry = {
                version: '1.0.0',
                modules: {},
                dependencies: {},
                _initialized: true,

                register: function (name, module) {
                    if (!name || !module) return null;
                    this.modules[name] = module;
                    return module;
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

        // Safe hasModule check helper
        const safeHasModule = (name) => {
            if (typeof window.ModuleRegistry.hasModule === 'function') {
                return window.ModuleRegistry.hasModule(name);
            }
            // Fallback: check modules object directly
            return window.ModuleRegistry.modules && !!window.ModuleRegistry.modules[name];
        };

        // Register all module-like objects (silent)
        for (const key in window) {
            if (typeof window[key] === 'object' &&
                window[key] !== null &&
                window[key].version &&
                !safeHasModule(key)) {
                window.ModuleRegistry.register(key, window[key]);
            }
        }

        // Initialize uninitialized modules if they have an init method
        for (const key in window.ModuleRegistry.modules) {
            const module = window.ModuleRegistry.modules[key];
            // Check instance._initialized for wrapped modules
            const instance = module.instance || module;
            if (!instance._initialized && typeof instance.init === 'function') {
                try {
                    instance.init();
                    instance._initialized = true;
                } catch (e) {
                    console.error(`Error initializing module ${key}:`, e);
                }
            }
        }

        return this.showModuleStatus();
    },

    /**
     * Re-register a specific module
     * @param {string} moduleName - The name of the module to re-register
     */
    reregisterModule: function (moduleName) {
        if (!moduleName || !window[moduleName]) {
            console.error(`Module ${moduleName} not found in window object`);
            return false;
        }

        if (!window.ModuleRegistry) {
            console.error('ModuleRegistry not found');
            return false;
        }

        // Re-registering module (silent)
        window.ModuleRegistry.register(moduleName, window[moduleName]);

        // Initialize if not already initialized
        if (!window[moduleName]._initialized && typeof window[moduleName].init === 'function') {
            // Initializing module (silent)
            try {
                window[moduleName].init();
                window[moduleName]._initialized = true;
            } catch (e) {
                console.error(`Error initializing module ${moduleName}:`, e);
                return false;
            }
        }

        return true;
    }
};

// Register the module with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleDebugger', ModuleDebugger);
}

// Make the module globally available
window.ModuleDebugger = ModuleDebugger;

// Self-initialize
ModuleDebugger.init();

// Module Debugger ready