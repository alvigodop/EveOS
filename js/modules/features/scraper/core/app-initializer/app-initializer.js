/**
 * AppInitializer Module (Facade)
 * 
 * Responsible for initializing the application and orchestrating module loading
 * 
 * Delegates to:
 * - AIError: Initialization error handling and retry UI
 * 
 * @version 1.1.0-facade
 */

// Create AppInitializer namespace
window.AppInitializer = window.AppInitializer || {};
const AppInitializer = window.AppInitializer;

// Add version and installation status
AppInitializer.version = '1.1.0-facade';
AppInitializer.installed = true;

/**
 * Initialize the application
 */
AppInitializer.init = function () {
    console.log('Initializing AppInitializer');

    // Initialize ModuleRegistry first if available
    if (window.ModuleRegistry && typeof ModuleRegistry.init === 'function' && !ModuleRegistry._initialized) {
        ModuleRegistry.init();
    }

    // Register this module
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('AppInitializer', this);
    }

    // Ensure core modules are available
    if (!this.ensureCoreModules()) {
        console.error('Critical modules missing, application initialization aborted');
        this.showInitializationError('Critical modules missing');
        return this;
    }

    // Initialize modules in the correct order
    this.initializeModules()
        .then(() => {
            console.log('All modules initialized successfully');
            this.completeInitialization();
        })
        .catch(error => {
            console.error('Error initializing modules:', error);
            this.showInitializationError('Error initializing modules');
        });

    this._initialized = true;
    return this;
};

/**
 * Ensure core modules are available
 */
AppInitializer.ensureCoreModules = function () {
    if (!window.UI) {
        console.error('UI module is missing');
        return false;
    }

    const requiredModules = ['SearchManager', 'EventManager', 'WikiManager'];
    let missingModules = [];

    requiredModules.forEach(moduleName => {
        if (!window[moduleName]) {
            missingModules.push(moduleName);
            console.error(`Required module "${moduleName}" is missing`);
        }
    });

    if (missingModules.length > 0) {
        console.error(`Missing modules: ${missingModules.join(', ')}`);
        return false;
    }

    return true;
};

/**
 * Initialize all modules in the correct order
 */
AppInitializer.initializeModules = function () {
    if (window.ModuleRegistry && typeof ModuleRegistry.initializeAllModules === 'function') {
        console.log('Using ModuleRegistry to initialize modules');
        return ModuleRegistry.initializeAllModules();
    }
    console.log('Using fallback initialization order');
    return this.initializeModulesInOrder();
};

/**
 * Initialize modules in a predefined order
 */
AppInitializer.initializeModulesInOrder = function () {
    const moduleInitOrder = [
        { name: 'UI', object: window.UI },
        { name: 'UIModuleStatus', object: window.UIModuleStatus },
        { name: 'WikiManager', object: window.WikiManager },
        { name: 'DirectSearch', object: window.DirectSearch },
        { name: 'GoogleSearchScraper', object: window.GoogleSearchScraper },
        { name: 'SearchManager', object: window.SearchManager },
        { name: 'EventManager', object: window.EventManager },
        { name: 'Discovery', object: window.Discovery },
        { name: 'WikipediaDiscovery', object: window.WikipediaDiscovery },
        { name: 'FandomSearch', object: window.FandomSearch },
        { name: 'FandomAPI', object: window.FandomAPI },
        { name: 'PopupManager', object: window.PopupManager },
        { name: 'ConnectivityTest', object: window.ConnectivityTest },
        { name: 'PageFreezeDetector', object: window.PageFreezeDetector },
        { name: 'ErrorNotifier', object: window.ErrorNotifier },
        { name: 'LoadingIndicator', object: window.LoadingIndicator },
        { name: 'DiscoveryUI', object: window.DiscoveryUI },
        { name: 'DomainValidator', object: window.DomainValidator },
        { name: 'DirectRenderer', object: window.DirectRenderer },
        { name: 'BrowserEmulator', object: window.BrowserEmulator },
        { name: 'AIError', object: window.AIError },
        { name: 'StartupHelper', object: window.StartupHelper },
        { name: 'FandomDomains', object: window.FandomDomains },
        { name: 'UIResultDisplay', object: window.UIResultDisplay },
        { name: 'DPLogger', object: window.DPLogger },
        { name: 'MHAjax', object: window.MHAjax },
        { name: 'MHRegistry', object: window.MHRegistry },
        { name: 'HtmlUtils', object: window.HtmlUtils }
    ];

    return moduleInitOrder.reduce((promise, module) => {
        return promise.then(() => {
            if (!module.object) {
                console.warn(`Module "${module.name}" not found, skipping initialization`);
                return Promise.resolve();
            }
            if (module.object._initialized) {
                console.log(`Module "${module.name}" already initialized`);
                return Promise.resolve();
            }
            if (typeof module.object.init !== 'function') {
                console.warn(`Module "${module.name}" has no init method`);
                return Promise.resolve();
            }
            console.log(`Initializing "${module.name}"`);
            try {
                return Promise.resolve(module.object.init()).then(() => {
                    module.object._initialized = true;

                    // Update registry if available
                    if (window.ModuleRegistry) {
                        if (window.ModuleRegistry.modules && window.ModuleRegistry.modules[module.name]) {
                            window.ModuleRegistry.modules[module.name].initialized = true;
                        }
                        if (window.ModuleRegistry._modules && window.ModuleRegistry._modules[module.name]) {
                            window.ModuleRegistry._modules[module.name].initialized = true;
                        }
                    }
                });
            } catch (error) {
                console.error(`Error initializing "${module.name}":`, error);
                return Promise.reject(error);
            }
        });
    }, Promise.resolve());
};

/**
 * Complete the application initialization
 */
AppInitializer.completeInitialization = function () {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }

    const appUI = document.querySelector('.container');
    if (appUI) {
        appUI.classList.add('initialized');
    }

    window.initialized = true;
    const appReadyEvent = new CustomEvent('app:ready');
    document.dispatchEvent(appReadyEvent);

    console.log('Application initialization complete');
};

/**
 * Show initialization error - delegates to AIError
 */
AppInitializer.showInitializationError = function (message) {
    if (window.AIError) {
        AIError.showInitializationError(message, () => this.init());
    } else {
        // Fallback - just log
        console.error('Init error:', message);
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppInitializer.init());
} else {
    setTimeout(() => AppInitializer.init(), 0);
}

window.AppInitializer = AppInitializer;
console.log('AppInitializer module loaded');

// Create app namespace
window.App = window.App || {};

/**
 * App initialization function
 */
window.App.initialize = function () {
    console.log('Initializing application');

    const loadingElement = document.getElementById('initialLoading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }

    const mainElement = document.querySelector('main');
    if (mainElement) {
        mainElement.style.display = 'block';
    }

    // Ensure wiki lists are rendered
    setTimeout(() => {
        if (window.WikiManager) {
            console.log('App Initializer: Ensuring wiki lists are rendered');
            if (!WikiManager._initialized && typeof WikiManager.init === 'function') {
                console.log('App Initializer: WikiManager was not initialized. Initializing now.');
                WikiManager.init();
                WikiManager._initialized = true;
            }
            try {
                if (typeof WikiManager.renderWikiEntryList === 'function') {
                    WikiManager.renderWikiEntryList();
                }
                if (typeof WikiManager.renderFandomDomainList === 'function') {
                    WikiManager.renderFandomDomainList();
                }
            } catch (e) {
                console.warn('Error rendering wiki lists from App Initializer:', e);
            }
        }
    }, 1000);
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.App.initialize);
} else {
    window.App.initialize();
}

// Window load event
window.addEventListener('load', function () {
    console.log('Window fully loaded, ensuring UI initialization is complete');

    setTimeout(() => {
        if (window.WikiManager) {
            console.log('Window load event: Ensuring wiki lists are rendered');
            try {
                if (typeof WikiManager.renderWikiEntryList === 'function') {
                    WikiManager.renderWikiEntryList();
                }
                if (typeof WikiManager.renderFandomDomainList === 'function') {
                    WikiManager.renderFandomDomainList();
                }
            } catch (e) {
                console.warn('Error rendering wiki lists from window load event:', e);
            }
        }
    }, 500);
});