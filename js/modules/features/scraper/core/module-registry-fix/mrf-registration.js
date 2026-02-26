/**
 * Module Registry Fix - Registration Strategy
 * Enforces registration of known and window-attached modules.
 */
const ModuleRegistryFixRegistration = {
    _initialized: false,

    modulesToRegister: [
        'ModuleRegistry', 'PopupManager', 'TabManager', 'SearchManager',
        'WikipediaDiscovery', 'CacheManager', 'UI', 'DataManager',
        'WikiManager', 'EventManager', 'FandomSearch', 'Discovery',
        'DirectSearch', 'ResultDisplay', 'EventBus', 'DebugHelper',
        'ForceReload', 'DomainGenerator', 'DomainValidator',
        'FandomDiscovery', 'ModuleStatus', 'UIModuleStatus',
        'UIResultDisplay', 'StorageManager'
    ],

    init: function () {
        if (this._initialized) return;
        this._initialized = true;

        if (window.ModuleRegistry) {
            if (typeof window.ModuleRegistry.register === 'function') {
                window.ModuleRegistry.register('ModuleRegistryFixRegistration', ModuleRegistryFixRegistration);
            }
        }
    },

    runRegistration: function () {
        if (!window.ModuleRegistry) return 0;
        let registeredCount = 0;

        // Force all known modules to register
        this.modulesToRegister.forEach(moduleName => {
            try {
                if (window[moduleName]) {
                    if (this.forceRegister(moduleName, window[moduleName])) {
                        registeredCount++;
                    }
                } else {
                    // Module not yet loaded, skip silently
                }
            } catch (moduleError) {
                console.error(`Error processing module ${moduleName}:`, moduleError);
            }
        });

        // Scan window for other modules
        for (const key in window) {
            try {
                if (typeof window[key] === 'object' && window[key] !== null &&
                    window[key].version && !this.modulesToRegister.includes(key)) {

                    if (this.forceRegister(key, window[key])) {
                        registeredCount++;
                    }
                }
            } catch (windowObjError) {
                // Ignore errors scanning window
            }
        }

        return registeredCount;
    },

    forceRegister: function (name, instance) {
        if (!window.ModuleRegistry) return false;

        let isRegistered = false;
        if (typeof ModuleRegistry.exists === 'function') {
            isRegistered = ModuleRegistry.exists(name);
        } else if (typeof ModuleRegistry.isRegistered === 'function') {
            isRegistered = ModuleRegistry.isRegistered(name);
        } else if (ModuleRegistry._modules) {
            isRegistered = !!ModuleRegistry._modules[name];
        }

        if (!isRegistered) {
            if (typeof ModuleRegistry.register === 'function') {
                ModuleRegistry.register(name, instance);
            } else if (ModuleRegistry._modules) {
                ModuleRegistry._modules[name] = {
                    name: name,
                    instance: instance,
                    version: instance.version || '1.0.0',
                    registered: new Date()
                };
            }
            return true;
        }

        // Sync initialized state
        if (instance._initialized) {
            if (ModuleRegistry._modules && ModuleRegistry._modules[name]) {
                ModuleRegistry._modules[name].initialized = true;
            }
        }
        return false;
    }
};

if (typeof window !== 'undefined') {
    window.ModuleRegistryFixRegistration = ModuleRegistryFixRegistration;
    ModuleRegistryFixRegistration.init();
}
