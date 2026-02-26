/**
 * Stub Factory Component
 * Logic for creating stubs for missing modules
 */
const StubFactory = {
    /**
     * Create a stub for a missing module
     * @param {string} moduleName - The name of the missing module
     * @returns {Object} - A stub module
     */
    createStubModule: function (moduleName) {
        console.log(`Creating stub for missing module: ${moduleName}`);

        // Create a generic stub object
        const stubModule = {
            _isStub: true,
            stubbed: true,
            version: '1.0.0',
            name: moduleName,

            // Add standard methods
            init: function () {
                console.log(`Stub ${moduleName}.init() called`);
                return this;
            },

            // Add a handler method that logs when called
            handle: function () {
                console.log(`Stub ${moduleName}.handle() called with:`, arguments);
                return null;
            },

            // Generic event handler
            on: function () { },
            off: function () { },
            emit: function () { }
        };

        // Make the stub globally available
        window[moduleName] = stubModule;

        // Announce that a stub was created
        if (document.dispatchEvent) {
            document.dispatchEvent(new CustomEvent('moduleStubCreated', {
                detail: { moduleName: moduleName }
            }));
        }

        return stubModule;
    },

    /**
     * Create stubs for common modules that are missing
     */
    createStubsForMissingModules: function () {
        // Check for common modules and create stubs if missing
        // Note: CacheManager uses a special smart stub, so exclude it from generic list
        const commonModules = [
            'PopupManager',
            'TabManager',
            'WikiManager',
            'EventManager',
            'SearchManager',
            'StorageManager',
            'DirectSearch',
            'ResultDisplay',
            'CORSProxyManager'
        ];

        // Create stubs for all missing modules (except CacheManager)
        commonModules.forEach(moduleName => {
            if (!window[moduleName]) {
                this.createStubModule(moduleName);
            }
        });

        // Use smart stub for CacheManager if missing
        if (!window.CacheManager || window.CacheManager._isStub) {
            // Check if createSmartCacheManagerStub exists (facade should provide it)
            if (typeof this.createSmartCacheManagerStub === 'function') {
                this.createSmartCacheManagerStub();
            } else if (window.SmartCacheStub && typeof window.SmartCacheStub.createSmartCacheManagerStub === 'function') {
                // Fallback if 'this' binding isn't ready
                window.SmartCacheStub.createSmartCacheManagerStub();
            } else {
                console.warn('GlobalFix: createSmartCacheManagerStub not found');
            }
        }

        // Ensure CORSProxyManager is initialized if it exists but wasn't initialized
        if (window.CORSProxyManager && !window.CORSProxyManager._initialized &&
            typeof window.CORSProxyManager.init === 'function') {
            console.log('Initializing CORSProxyManager from GlobalFix');
            window.CORSProxyManager.init();
        }
    }
};

window.StubFactory = StubFactory;
