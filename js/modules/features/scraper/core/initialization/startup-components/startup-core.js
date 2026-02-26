/**
 * Startup Core Module
 * 
 * Contains the base StartupHelper object and initialization orchestration.
 */

(function () {
    const StartupHelper = {
        name: 'StartupHelper',
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize the startup helper
         */
        init: function () {
            if (this._initialized) return;
            this._initialized = true;
            console.log('StartupHelper initialized');

            // Run initial checks (Delegated to checks module)
            if (typeof this.setupTabFallbacks === 'function') {
                this.setupTabFallbacks();
            }

            // Schedule UI verification (Delegated to UI module)
            if (typeof this.ensureUIIsVisible === 'function') {
                setTimeout(() => this.ensureUIIsVisible(), 2000);
            }

            // Server module detection (Delegated to checks module)
            if (typeof this.detectServerModuleUsage === 'function') {
                setTimeout(() => this.detectServerModuleUsage(), 2500);
            }
        }
    };

    // Expose globally
    window.StartupHelper = StartupHelper;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('StartupHelper', StartupHelper);
    }
})();
