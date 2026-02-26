/**
 * Global Fix Core Component
 * Core initialization and shared utilities for GlobalFix
 */
const GlobalFixCore = {
    /**
     * Apply global fixes to ensure the application works in all environments
     */
    applyGlobalFixes: function () {
        console.log('Applying global fixes');

        // Create stubs for commonly used modules if they don't exist
        if (!window.EventBus) {
            console.log('Creating EventBus stub');
            window.EventBus = {
                _isStub: true,
                version: '1.0.0',
                on: function () { },
                off: function () { },
                emit: function () { },
                addEventListener: function () { },
                removeEventListener: function () { }
            };
        }

        // Create UI module stub if needed
        if (!window.UI) {
            console.log('Creating UI stub');
            window.UI = {
                _isStub: true,
                version: '1.0.0',
                showLoadingIndicator: function () { },
                hideLoadingIndicator: function () { },
                showNotification: function (message) {
                    console.log('NOTIFICATION: ' + message);
                },
                addMessage: function (message) {
                    console.log('UI MESSAGE: ' + message);
                }
            };
        }

        // Make sure global localStorage shim exists
        if (typeof window.localStorage === 'undefined') {
            console.log('Creating localStorage stub');
            window.localStorage = {
                _data: {},
                getItem: function (key) {
                    return this._data[key] || null;
                },
                setItem: function (key, value) {
                    this._data[key] = String(value);
                },
                removeItem: function (key) {
                    delete this._data[key];
                },
                clear: function () {
                    this._data = {};
                }
            };
        }

        // Apply fixes for Safari or other browsers
        if (typeof document.querySelectorAll === 'undefined') {
            console.log('Missing querySelectorAll, applying fix');
            // This is just a placeholder - a real implementation would be much more complex
            document.querySelectorAll = function (selector) {
                console.warn('querySelectorAll stub used');
                return [];
            };
        }

        // Fix for missing addEventListener
        if (typeof window.addEventListener !== 'function') {
            console.log('Missing addEventListener, applying fix');
            // Simple shim that does nothing
            window.addEventListener = function () {
                console.warn('addEventListener stub used');
            };
        }

        return true;
    },

    /**
     * Set up event listeners for module loading
     */
    setupModuleLoadListeners: function () {
        // When a new module is registered, check if we need to fix anything
        if (document.addEventListener) {
            document.addEventListener('moduleRegistered', function (event) {
                // Check if the module needs any fixes
                if (event.detail && event.detail.moduleName) {
                    console.log(`Module registered: ${event.detail.moduleName}`);
                }
            });
        }
    },

    /**
     * Initialize the GlobalFix module
     */
    init: function () {
        console.log('Initializing GlobalFix module (Facade)');

        // Aggregate functionality
        if (this.aggregateModules) {
            this.aggregateModules();
        }

        // Set up event listeners for module loading
        this.setupModuleLoadListeners();

        // Check for missing modules and create stubs
        if (this.createStubsForMissingModules) {
            this.createStubsForMissingModules();
        }

        return this;
    },

    /**
     * Apply all global fixes
     */
    applyFixes: function () {
        console.log('Applying global fixes');

        // Apply all individual fixes
        // Note: Removing calls to missing methods (fixModuleRegistry, fixEventManager, etc.)
        // These appeared to be dead code in the original file.

        if (this.fixDirectSearch) {
            this.fixDirectSearch(); // Add DirectSearch fix
        }

        // Run additional repairs if available
        if (this.repairModules) {
            this.repairModules();
        }

        console.log('Global fixes applied');
    },

    /**
     * Helper to discover Wikipedia articles to support DirectSearch stub
     */
    discoverWikipedia: async function (query) {
        if (window.WikipediaDiscovery && typeof window.WikipediaDiscovery.discover === 'function') {
            try {
                return new Promise((resolve) => {
                    WikipediaDiscovery.discover(query, (results) => {
                        resolve(results || []);
                    });
                });
            } catch (error) {
                console.error('GlobalFix: Error calling WikipediaDiscovery.discover fallback:', error);
                return [];
            }
        }
        return [];
    }
};

window.GlobalFixCore = GlobalFixCore;
