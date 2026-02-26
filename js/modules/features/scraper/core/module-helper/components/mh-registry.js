/**
 * Module Helper - Registry Utilities
 * Provides module registration utilities for module-helper.js
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const MHRegistry = {
        version: '1.0.0',

        init: function () {
            console.log('MHRegistry initialized');
            this._initialized = true;
            return this;
        },

        /**
         * List of known module names
         */
        moduleNames: [
            'StorageManager', 'CacheManager', 'PopupManager', 'TabManager',
            'WikiManager', 'EventManager', 'EventBus', 'SearchManager',
            'UI', 'FandomSearch', 'Discovery', 'WikipediaDiscovery',
            'PopularWikis', 'DirectSearch', 'ResultDisplay', 'ModuleHelper',
            'ModuleLoader', 'ModuleRegistry', 'GlobalFix', 'DebugHelper',
            'ForceReload', 'DomainGenerator', 'DomainValidator', 'FandomDiscovery',
            'ModuleInitializer', 'ModuleRegistryFix', 'ModuleUtilities',
            'ModuleStatus', 'UIModuleStatus', 'UIResultDisplay'
        ],

        /**
         * Forces registration of all modules with ModuleRegistry
         */
        forceRegisterAllModules: function () {
            // Create ModuleRegistry if it doesn't exist
            if (!window.ModuleRegistry) {
                console.warn('ModuleRegistry not found, creating it');
                window.ModuleRegistry = {
                    _modules: {},
                    register: function (name, module) {
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
                        return this.exists(name) && (this._modules[name].initialized === true || this._modules[name].instance._initialized === true);
                    }
                };
            }

            // Register each module if it exists and isn't already registered
            let registeredCount = 0;
            this.moduleNames.forEach(moduleName => {
                if (window[moduleName]) {
                    const isRegistered = window.ModuleRegistry._modules &&
                        window.ModuleRegistry._modules[moduleName];

                    if (!isRegistered) {
                        window.ModuleRegistry.register(moduleName, window[moduleName]);
                        registeredCount++;

                        if (window[moduleName]._initialized &&
                            window.ModuleRegistry._modules &&
                            window.ModuleRegistry._modules[moduleName]) {
                            window.ModuleRegistry._modules[moduleName].initialized = true;
                        }
                    }
                }
            });

            // Announce that modules have been registered
            if (document.dispatchEvent) {
                document.dispatchEvent(new CustomEvent('modulesRegistered', {
                    detail: { count: registeredCount }
                }));
            }
        },

        /**
         * Gets the list of module names from registry
         * @returns {Array} - Array of module names
         */
        getModuleNames: function () {
            if (window.ModuleRegistry && window.ModuleRegistry._modules) {
                return Object.keys(window.ModuleRegistry._modules);
            }
            return [];
        }
    };

    // Expose globally
    window.MHRegistry = MHRegistry;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('MHRegistry', MHRegistry);
    }
})();
