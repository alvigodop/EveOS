/**
 * Module Debugger
 *
 * Provides tools for debugging module loading and initialization issues
 *
 * @version 1.0.1
 */

// Create namespace
const ModuleDebugger = {
    version: '1.0.1',
    _initialized: true,

    /**
     * Initialize the debugger
     */
    init: function () {
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
    },

    /**
     * Safely resolve a window property as a module candidate.
     * Avoids cross-origin frame access errors when probing `window[key].version`.
     */
    _getModuleCandidate: function (key) {
        let value = null;
        try {
            value = window[key];
        } catch (e) {
            return null;
        }
        if (!value || typeof value !== 'object') return null;
        try {
            return value.version ? value : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Build module status snapshot.
     */
    _collectStatus: function () {
        const status = {
            total: 0,
            registered: 0,
            unregistered: 0,
            initialized: 0,
            modules: {}
        };

        const keys = Object.getOwnPropertyNames(window);
        for (const key of keys) {
            const moduleCandidate = this._getModuleCandidate(key);
            if (!moduleCandidate) continue;

            status.total++;
            status.modules[key] = {
                loaded: true,
                registered: window.ModuleRegistry && window.ModuleRegistry.hasModule ? window.ModuleRegistry.hasModule(key) : false,
                initialized: !!moduleCandidate._initialized,
                version: moduleCandidate.version || 'unknown'
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

        return status;
    },

    /**
     * Show the status of all modules.
     * @param {{quiet?: boolean, includeDetails?: boolean}=} options
     */
    showModuleStatus: function (options) {
        const opts = options || {};
        const quiet = !!opts.quiet;
        const includeDetails = opts.includeDetails !== false;
        const status = this._collectStatus();

        if (!quiet) {
            console.group('Module Status Summary');
            console.log(`Total: ${status.total}`);
            console.log(`Registered: ${status.registered}`);
            console.log(`Unregistered: ${status.unregistered}`);
            console.log(`Initialized: ${status.initialized}`);
            console.groupEnd();

            if (includeDetails) {
                console.group('Module Details');
                for (const moduleName in status.modules) {
                    const module = status.modules[moduleName];
                    console.log(
                        `${moduleName}: ${module.loaded ? '[OK]' : '[X]'} Loaded, ` +
                        `${module.registered ? '[OK]' : '[X]'} Registered, ` +
                        `${module.initialized ? '[OK]' : '[X]'} Initialized, ` +
                        `v${module.version}`
                    );
                }
                console.groupEnd();
            }
        }

        return status;
    },

    /**
     * Fix module registry issues.
     * @param {{quiet?: boolean, includeDetails?: boolean}=} options
     */
    fixModuleRegistry: function (options) {
        const opts = typeof options === 'object' && options ? options : {};
        const quiet = !!opts.quiet;
        const includeDetails = opts.includeDetails !== false;

        // Guard against multiple runs
        if (this._registryFixed) {
            return this.showModuleStatus({ quiet, includeDetails });
        }
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

        const safeHasModule = (name) => {
            if (typeof window.ModuleRegistry.hasModule === 'function') {
                return window.ModuleRegistry.hasModule(name);
            }
            return window.ModuleRegistry.modules && !!window.ModuleRegistry.modules[name];
        };

        const keys = Object.getOwnPropertyNames(window);
        for (const key of keys) {
            const moduleCandidate = this._getModuleCandidate(key);
            if (moduleCandidate && !safeHasModule(key)) {
                window.ModuleRegistry.register(key, moduleCandidate);
            }
        }

        for (const key in window.ModuleRegistry.modules) {
            const module = window.ModuleRegistry.modules[key];
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

        return this.showModuleStatus({ quiet, includeDetails });
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

        window.ModuleRegistry.register(moduleName, window[moduleName]);

        if (!window[moduleName]._initialized && typeof window[moduleName].init === 'function') {
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
