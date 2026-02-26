/**
 * Module Registry Fix (Facade)
 * Ensures all modules are properly registered with ModuleRegistry,
 * fixing the "Unregistered" status in the module status popup
 * 
 * Delegates to:
 * - ModuleRegistryFixCore
 * - ModuleRegistryFixRegistry
 * - ModuleRegistryFixRegistration
 * - ModuleRegistryFixUI
 */
const ModuleRegistryFix = {
    version: '1.2.0-modular',
    _initialized: false,

    /**
     * Initialize and run the registration fixes
     */
    init: function () {
        if (this._initialized) return this;

        try {
            console.log('ModuleRegistryFix (Facade) initializing...');

            // Initialize Sub-modules
            if (window.ModuleRegistryFixCore && typeof ModuleRegistryFixCore.init === 'function') {
                ModuleRegistryFixCore.init();
            }
            if (window.ModuleRegistryFixRegistry && typeof ModuleRegistryFixRegistry.init === 'function') {
                ModuleRegistryFixRegistry.init();
            }
            if (window.ModuleRegistryFixRegistration && typeof ModuleRegistryFixRegistration.init === 'function') {
                ModuleRegistryFixRegistration.init();
                const count = ModuleRegistryFixRegistration.runRegistration();
                console.log(`ModuleRegistryFix: Registered ${count} modules via Registration Strategy`);
            }
            if (window.ModuleRegistryFixUI && typeof ModuleRegistryFixUI.init === 'function') {
                ModuleRegistryFixUI.init();
            }

            // Safely handle error display (UI)
            this.fixErrorDisplay();

            // Dispatch an event that modules are registered
            if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function') {
                try {
                    document.dispatchEvent(new CustomEvent('modulesRegistered', {
                        detail: {
                            moduleRegistry: true,
                            facade: true
                        }
                    }));
                } catch (eventError) {
                    console.error('Error dispatching modulesRegistered event:', eventError);
                }
            }

            this._initialized = true;
            return this;
        } catch (e) {
            console.error('Critical error in ModuleRegistryFix.init():', e);
            return this;
        }
    },

    /**
     * Fix the error display (Delegate to UI module)
     */
    fixErrorDisplay: function () {
        if (window.ModuleRegistryFixUI) {
            ModuleRegistryFixUI.fixErrorDisplay();
        }
    }
};

// Register ModuleRegistryFix itself with ModuleRegistry
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleRegistryFix', ModuleRegistryFix);
}

// Make globally available
window.ModuleRegistryFix = ModuleRegistryFix;

// Self-initialize on load
(function () {
    // Wait a bit to make sure ModuleRegistry is loaded
    setTimeout(function () {
        if (ModuleRegistryFix && typeof ModuleRegistryFix.init === 'function') {
            try {
                ModuleRegistryFix.init();
            } catch (e) {
                console.error('Error initializing ModuleRegistryFix:', e);
            }
        }
    }, 200);

    console.log('ModuleRegistryFix (Modularized) loaded');
})();