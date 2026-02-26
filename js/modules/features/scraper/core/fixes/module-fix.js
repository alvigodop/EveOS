/**
 * Module Fix - Emergency fix for module registration and initialization issues
 * This file should be included at the top of the HTML before any other scripts
 * 
 * MODULARIZED VERSION: Logic has been moved to js/modules/core/module-fix-components/
 * 
 * @version 1.0.4-modular
 */

(function () {
    'use strict';

    console.log('Loading module-fix.js (Modularized) - Applying emergency fixes for module issues');

    // Create window.ModuleFix namespace
    window.ModuleFix = {
        version: '1.0.4-modular',
        _initialized: true,

        /**
         * Initialize the module fix
         */
        init: function () {
            console.log('Initializing ModuleFix (Facade)');
            this.aggregateComponents();

            // Execute component logic if available
            if (this.ensureModuleRegistry) this.ensureModuleRegistry();
            if (this.setupErrorHandling) this.setupErrorHandling();
            if (this.applyCorsWorkarounds) this.applyCorsWorkarounds();
            if (this.fixErrorDisplay) this.fixErrorDisplay();
            if (this.setupAutoRepair) this.setupAutoRepair();

            return this;
        },

        /**
         * Aggregate functionality from sub-components
         */
        aggregateComponents: function () {
            if (window.ModuleFixComponents) {
                if (window.ModuleFixComponents.RegistryShim) Object.assign(this, window.ModuleFixComponents.RegistryShim);
                if (window.ModuleFixComponents.CorsFix) Object.assign(this, window.ModuleFixComponents.CorsFix);
                if (window.ModuleFixComponents.ErrorFix) Object.assign(this, window.ModuleFixComponents.ErrorFix);
                if (window.ModuleFixComponents.AutoRecovery) Object.assign(this, window.ModuleFixComponents.AutoRecovery);
            }
        }
    };

    // Initialize ModuleFix
    try {
        window.ModuleFix.init();
    } catch (e) {
        console.error('Error initializing ModuleFix:', e);
    }

    // Auto-retry initialization after a short delay to catch async loaded components
    setTimeout(function () {
        if (window.ModuleFix) {
            window.ModuleFix.init();
        }
    }, 500);

    console.log('ModuleFix loaded');
})();
