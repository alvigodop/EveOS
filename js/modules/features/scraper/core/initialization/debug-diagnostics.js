/**
 * Debug Diagnostics Module
 * 
 * Provides diagnostic tests and health checks for the application.
 */

(function () {
    const DebugDiagnostics = {
        name: 'DebugDiagnostics',
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize DebugDiagnostics
         */
        init: function () {
            this._initialized = true;
            return this;
        },

        /**
         * Run diagnostic tests on the application
         */
        diagnoseCriticalIssues: function () {
            console.log("====== DIAGNOSTIC REPORT ======");

            // Check if main elements exist
            const mainContent = document.querySelector('main');
            console.log("Main content element exists:", !!mainContent);

            const loadingElement = document.getElementById('initialLoading');
            console.log("Loading element exists:", !!loadingElement);

            const wikiEntryList = document.getElementById('wikiEntryList');
            console.log("Wiki entry list exists:", !!wikiEntryList);

            const fandomDomainList = document.getElementById('fandomDomainList');
            console.log("Fandom domain list exists:", !!fandomDomainList);

            // Check if critical modules are available
            console.log("\n=== MODULE STATUS ===");

            const criticalModules = [
                'StorageManager',
                'CacheManager',
                'UI',
                'WikiManager',
                'EventManager',
                'SearchManager',
                'TabManager',
                'PopupManager',
                'ModuleUtilities',
                'FandomDiscovery',
                'StartupHelper'
            ];

            criticalModules.forEach(moduleName => {
                const exists = !!window[moduleName];
                const isInitialized = exists && window[moduleName]._initialized === true;
                console.log(`${moduleName}: ${exists ? 'Exists' : 'MISSING'} ${isInitialized ? '(Initialized)' : '(NOT Initialized)'}`);
            });

            // Check localStorage
            console.log("\n=== STORAGE STATUS ===");
            try {
                const wikiEntries = JSON.parse(localStorage.getItem('wikiEntries') || '[]');
                console.log(`Wiki entries stored: ${wikiEntries.length}`);

                const fandomDomains = JSON.parse(localStorage.getItem('fandomDomains') || '[]');
                console.log(`Fandom domains stored: ${fandomDomains.length}`);
            } catch (e) {
                console.error("Error accessing localStorage:", e);
            }

            console.log("\n=== EVENT HANDLERS ===");
            this.checkEventHandlers();
        },

        /**
         * Check if event handlers are properly set up
         */
        checkEventHandlers: function () {
            // Check critical buttons
            const buttons = [
                'searchBtn',
                'addWikiBtn',
                'addFandomBtn',
                'searchWikiArticlesBtn',
                'searchWikisBtn'
            ];

            buttons.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    // Note: We can only check for direct onclick properties, not event listeners added via addEventListener
                    const hasOnClick = !!element.onclick;
                    const looksActive = !element.disabled;
                    console.log(`${id}: ${hasOnClick ? 'Has onclick' : 'No onclick'} (Active: ${looksActive})`);
                } else {
                    console.log(`${id}: ELEMENT NOT FOUND`);
                }
            });
        }
    };

    // Initialize
    DebugDiagnostics.init();
    window.DebugDiagnostics = DebugDiagnostics;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('DebugDiagnostics', DebugDiagnostics);
    }

    // Global alias for console usage
    window.diagnoseCriticalIssues = DebugDiagnostics.diagnoseCriticalIssues.bind(DebugDiagnostics);
})();
