/**
 * Global Fix (Facade)
 * Last resort fixes for any remaining issues
 * This file should be loaded last, right before the main script
 * 
 * MODULE STATUS: Intentionally shows as "✗ Not Loaded (Registered)" in Module Status checker
 */

(function () {
    console.log('Applying global fixes for any remaining module issues...');

    // List of required module names
    const requiredModules = [
        'StorageManager',
        'CacheManager',
        'PopupManager',
        'TabManager',
        'WikiManager',
        'EventManager',
        'SearchManager',
        'UI',
        'FandomSearch',
        'Discovery',
        'WikipediaDiscovery',
        'PopularWikis',
        'CORSProxyManager',
        'ErrorSuppressor'
    ];

    /**
     * GlobalFix Facade Container
     */
    const GlobalFixFacade = {
        loaded: true,
        version: '1.2.0-facade',
        _initialized: true,

        /**
         * Initialize the Facade
         */
        init: function () {
            console.log('GlobalFix (Facade) initialized');
            this.aggregateModules();

            // Delegate initialization to Core if available
            if (this.init && typeof this.init === 'function' && this.init !== GlobalFixFacade.init) {
                return window.GlobalFixCore ? window.GlobalFixCore.init.call(this) : this;
            }

            return this;
        },

        /**
         * Aggregate functionality from sub-modules
         */
        aggregateModules: function () {
            const components = [
                window.GlobalFixCore,
                window.StubFactory,
                window.SmartCacheStub,
                window.FixDirectSearch
            ];

            components.forEach(component => {
                if (component) {
                    Object.assign(this, component);
                } else {
                    // Silent fail or debug log, but don't warn yet as they might load later
                    // console.debug('GlobalFix: A sub-module is missing (might load later)');
                }
            });
        }
    };

    // Attempt aggregation immediately
    GlobalFixFacade.aggregateModules();

    // Re-aggregate on moduleLoaded event to catch late arrivals
    if (document.addEventListener) {
        document.addEventListener('moduleLoaded', function (e) {
            // If a global fix component loaded, re-aggregate
            const name = e.detail ? e.detail.moduleName : '';
            if (['GlobalFixCore', 'StubFactory', 'SmartCacheStub', 'FixDirectSearch'].includes(name) ||
                // Also check source if available
                (e.detail && e.detail.source && e.detail.source.includes('global-fix-components'))) {
                GlobalFixFacade.aggregateModules();
            }
        });
    }

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('GlobalFix', GlobalFixFacade);
    }

    // Make globally available
    window.GlobalFix = GlobalFixFacade;

    // Initialize immediately
    if (GlobalFixFacade.init) {
        GlobalFixFacade.init();
    }

    // Dispatch a module loaded event for better detection
    if (typeof CustomEvent === 'function') {
        const event = new CustomEvent('moduleLoaded', {
            detail: {
                moduleName: 'GlobalFix',
                module: GlobalFixFacade,
                source: 'global-fix.js'
            }
        });
        document.dispatchEvent(event);
    }

    console.log('Global fixes applied via Facade');
})();