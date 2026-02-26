/**
 * Startup Helper Module (Facade)
 * 
 * Orchestrates application startup verification, fallbacks, and emergency rendering.
 * Delegates actual logic to sub-modules in `startup-components/`.
 * 
 * Sub-modules:
 * - startup-core.js: Initialization and state
 * - startup-ui.js: UI visibility and rendering
 * - startup-checks.js: System checks and fallbacks
 */

(function () {
    // Defines StartupHelper if it hasn't been defined by sub-modules yet
    if (!window.StartupHelper) {
        window.StartupHelper = {
            name: 'StartupHelper (Facade)',
            version: '1.0.0',
            _initialized: false,
            init: function () {
                this._pendingInit = true;
            }
        };
    }

    // Call init if it was pending
    if (window.StartupHelper._pendingInit && typeof window.StartupHelper.init === 'function') {
        window.StartupHelper.init();
    }
})();
