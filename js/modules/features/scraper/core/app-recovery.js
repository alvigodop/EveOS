/**
 * App Recovery & Initialization Fixes
 * Extracted from ScraperTest.html inline scripts
 */
(function () {
    function shouldRunVerboseRecovery() {
        try {
            const qs = new URLSearchParams(window.location.search || '');
            if (qs.get('debugRecovery') === '1') return true;
            return window.localStorage && window.localStorage.getItem('eve.debugRecovery') === '1';
        } catch (e) {
            return false;
        }
    }

    function scheduleRegistryRepair() {
        const runRepair = function () {
            if (!window.ModuleDebugger || window._repairComplete) return;
            window._repairComplete = true;

            const verbose = shouldRunVerboseRecovery();
            if (verbose) {
                console.log('Running ModuleDebugger.fixModuleRegistry() in verbose mode');
                window.ModuleDebugger.fixModuleRegistry();
                return;
            }

            // Keep recovery behavior, but avoid dumping the full module table on every boot.
            window.ModuleDebugger.fixModuleRegistry({ quiet: true, includeDetails: false });
        };

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runRepair, { timeout: 4000 });
            return;
        }
        window.setTimeout(runRepair, 1200);
    }

    // Ensure ModuleRegistry is properly initialized
    function runRecovery() {
        // Guard against multiple recovery runs
        if (window._appRecoveryComplete) return;
        window._appRecoveryComplete = true;

        console.log('App Recovery: Ensuring ModuleRegistry is properly initialized');

        // Initialize UIModuleStatus
        if (window.UIModuleStatus && typeof UIModuleStatus.init === 'function' && !UIModuleStatus._initialized) {
            UIModuleStatus.init();
        }

        // Single delayed repair - other repair calls are redundant.
        scheduleRegistryRepair();
    }

    runRecovery();
})();

