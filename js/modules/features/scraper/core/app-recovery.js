/**
 * App Recovery & Initialization Fixes
 * Extracted from ScraperTest.html inline scripts
 */
(function () {
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

        // Single delayed repair - other repair calls are redundant
        setTimeout(function () {
            if (window.ModuleDebugger && !window._repairComplete) {
                window._repairComplete = true;
                console.log('Running ModuleDebugger.fixModuleRegistry()');
                window.ModuleDebugger.fixModuleRegistry();
            }
        }, 500);
    }

    runRecovery();
})();

