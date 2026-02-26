/**
 * Force Reload Configuration
 * Defines the lists of modules to register and initialize.
 */
const ForceReloadConfig = {
    /**
     * List of all modules to check and register
     */
    modulesToRegister: [
        'DirectSearch',
        'ResultDisplay',
        'StorageManager',
        'CacheManager',
        'UI',
        'TabManager',
        'WikiManager',
        'EventManager',
        'SearchManager',
        'FandomSearch',
        'Discovery',
        'WikipediaDiscovery',
        'PopularWikis',
        'ModuleHelper',
        'ModuleLoader',
        'GlobalFix',
        'ModuleRegistryFix',
        'ModuleInitializer',
        'EventBus',
        'FandomDiscovery',
        'DomainGenerator',
        'DomainValidator',
        'UIModuleStatus',
        'UIResultDisplay',
        'ModuleStatus',
        'ModuleRegistry',
        'ForceReload',
        'PopupManager'
    ],

    /**
     * List of critical modules that must be initialized
     */
    criticalModules: [
        'DirectSearch',
        'ResultDisplay',
        'StorageManager',
        'CacheManager',
        'UI',
        'TabManager',
        'WikiManager',
        'EventManager',
        'SearchManager',
        'FandomSearch',
        'Discovery',
        'WikipediaDiscovery',
        'PopularWikis',
        'DomainGenerator',
        'DomainValidator',
        'UIModuleStatus',
        'UIResultDisplay',
        'PopupManager'
    ]
};

window.ForceReloadConfig = ForceReloadConfig;
