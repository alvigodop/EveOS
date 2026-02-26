/**
 * Module Registry Fix - Core Module
 * Base definitions and state management.
 */
const ModuleRegistryFixCore = {
    version: '1.0.0',
    _initialized: false,

    /**
     * Initialize the core module
     */
    init: function () {
        if (this._initialized) return;
        console.log('ModuleRegistryFixCore initialized');
        this._initialized = true;

        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('ModuleRegistryFixCore', ModuleRegistryFixCore);
        }
    }
};

if (typeof window !== 'undefined') {
    window.ModuleRegistryFixCore = ModuleRegistryFixCore;
    ModuleRegistryFixCore.init();
}
