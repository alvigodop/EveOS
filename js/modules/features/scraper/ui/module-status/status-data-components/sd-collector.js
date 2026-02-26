/**
 * Status Data Collector Component
 * Handles gathering of module status information.
 */
const StatusDataCollector = {};

/**
 * Initialize the module
 */
StatusDataCollector.init = function () {
    console.log('StatusDataCollector initialized');
};

/**
 * Get module status information
 * @param {Object} options - Options for status generation
 * @returns {Object} - Status information
 */
StatusDataCollector.getModuleStatusInfo = function (options = {}) {
    const info = {
        modules: [],
        uninitialized: [],
        initializationIssues: [],
        moduleCount: 0,
        initializedCount: 0,
        registeredCount: 0,
        errorCount: 0,
        scriptLoadInfo: {
            total: window.scriptsToLoad ? window.scriptsToLoad.length : 0,
            loaded: window.loadedScripts ? window.loadedScripts.length : 0,
            failed: window.failedScripts ? window.failedScripts.length : 0,
            errors: []
        }
    };

    // Decide whether to include CORS errors
    const hideCorsErrors = options.hideCorsErrors || window.HIDE_CORS_ERRORS;

    // Filter errors based on settings
    if (window.moduleLoadingErrors) {
        if (hideCorsErrors) {
            // Completely hide all CORS-related errors
            info.scriptLoadInfo.errors = window.moduleLoadingErrors.filter(error => {
                // Skip suppressed errors
                if (error.suppressed) return false;

                // Skip Script-CORS errors
                if (error.module === 'Script-CORS') return false;

                // Skip any kind of script error
                if (typeof error.message === 'string' &&
                    (error.message.includes('Script error') ||
                        error.message === 'Script error.')) return false;

                return true;
            });
        } else {
            // Just filter suppressed errors
            info.scriptLoadInfo.errors = window.moduleLoadingErrors.filter(error => !error.suppressed);
        }
    }

    // Check if ModuleRegistry exists
    if (window.ModuleRegistry) {
        try {
            // If ModuleRegistry has a getStatusReport method, use it
            if (typeof ModuleRegistry.getStatusReport === 'function') {
                const report = ModuleRegistry.getStatusReport();

                // Process report data
                info.moduleCount = report.total;
                info.initializedCount = report.initialized;
                info.errorCount = report.withErrors;
                info.registeredCount = report.registered || 0;

                // Process module info
                if (report.modules && Array.isArray(report.modules)) {
                    info.modules = report.modules.map(module => ({
                        name: module.name,
                        version: module.version || 'Unknown',
                        initialized: module.initialized,
                        registered: module.registered !== false, // Default to true if not specified
                        functional: module.functional !== false, // Default to true if not specified
                        hasError: !!module.error,
                        error: module.error,
                        loadOrder: module.loadOrder || 0,
                        dependencies: module.dependencies || []
                    }));

                    // Find uninitialized modules
                    info.uninitialized = report.modules
                        .filter(module => !module.initialized)
                        .map(module => module.name);

                    // Find modules with errors
                    info.initializationIssues = report.modules
                        .filter(module => module.error)
                        .map(module => `${module.name}: ${module.error}`);
                }
            } else {
                // Fallback to manual checking if getStatusReport is not available
                this.getModuleStatusManually(info);
            }
        } catch (error) {
            console.error('Error getting module status from ModuleRegistry:', error);
            this.getModuleStatusManually(info);
        }
    } else {
        // ModuleRegistry not available, use manual checking
        this.getModuleStatusManually(info);
    }

    return info;
};

/**
 * Get module status information manually from window objects
 * @param {Object} info - Status information to populate
 */
StatusDataCollector.getModuleStatusManually = function (info) {
    // Get all modules from window object
    const modules = [];

    // List of expected modules to check
    const expectedModules = [
        'StorageManager', 'CacheManager', 'PopupManager', 'TabManager',
        'WikiManager', 'EventManager', 'SearchManager', 'UI',
        'UIResultDisplay', 'UIModuleStatus', 'DomainGenerator',
        'DomainValidator', 'FandomSearch', 'Discovery', 'WikipediaDiscovery',
        'PopularWikis', 'GlobalFix', 'ModuleLoader', 'ModuleRegistry',
        'ModuleHelper', 'EventBus', 'DirectSearch', 'ResultDisplay'
    ];

    // Helper to test functionality if ModuleTester is available
    const testFunc = (mod, name) => {
        if (window.ModuleTester && typeof ModuleTester.testModuleFunctionality === 'function') {
            return ModuleTester.testModuleFunctionality(mod, name);
        }
        return false;
    };

    // Check for each expected module
    expectedModules.forEach((name, index) => {
        const module = window[name];
        if (module) {
            const isInitialized = module._initialized === true;
            const hasError = module._error !== undefined;

            modules.push({
                name: name,
                version: module.version || 'Unknown',
                initialized: isInitialized,
                registered: false,
                functional: testFunc(module, name),
                hasError: hasError,
                error: module._error,
                loadOrder: index,
                dependencies: []
            });

            if (!isInitialized && typeof module.init === 'function') {
                info.uninitialized.push(name);
            }

            if (hasError) {
                info.initializationIssues.push(`${name}: ${module._error}`);
            }
        }
    });

    // Add any other potential modules found on the window object
    Object.keys(window).forEach(key => {
        if (!expectedModules.includes(key) &&
            typeof window[key] === 'object' &&
            window[key] !== null &&
            typeof window[key].init === 'function') {

            const module = window[key];
            const isInitialized = module._initialized === true;
            const hasError = module._error !== undefined;

            modules.push({
                name: key,
                version: module.version || 'Unknown',
                initialized: isInitialized,
                registered: false,
                functional: testFunc(module, key),
                hasError: hasError,
                error: module._error,
                loadOrder: modules.length,
                dependencies: []
            });

            if (!isInitialized) {
                info.uninitialized.push(key);
            }

            if (hasError) {
                info.initializationIssues.push(`${key}: ${module._error}`);
            }
        }
    });

    // Update info object
    info.modules = modules;
    info.moduleCount = modules.length;
    info.initializedCount = modules.filter(m => m.initialized).length;
    info.errorCount = modules.filter(m => m.hasError).length;
    info.registeredCount = modules.filter(m => m.registered).length;
};

window.StatusDataCollector = StatusDataCollector;
