/**
 * Emergency Fallbacks (Facade)
 * 
 * Critical functionality fallbacks for system repair.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - EmergencyFallbacksCore: Storage/EventBus fallbacks
 * - EmergencyFallbacksContent: Search/Wiki fallbacks
 * - EmergencyFallbacksRepair: Repair logic
 * 
 * @version 1.1.0-facade
 */

const EmergencyFallbacks = {
    version: '1.1.0-facade',
    _initialized: false,

    /**
     * Initialize EmergencyFallbacks
     */
    init: function () {
        console.log('Initializing EmergencyFallbacks (Facade)');
        this._initialized = true;

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('EmergencyFallbacks', EmergencyFallbacks);
        }

        // Initialize sub-modules
        if (window.EmergencyFallbacksCore && typeof EmergencyFallbacksCore.init === 'function') {
            EmergencyFallbacksCore.init();
        }
        if (window.EmergencyFallbacksContent && typeof EmergencyFallbacksContent.init === 'function') {
            EmergencyFallbacksContent.init();
        }
        if (window.EmergencyFallbacksRepair && typeof EmergencyFallbacksRepair.init === 'function') {
            EmergencyFallbacksRepair.init();
        }

        return this;
    },

    /**
     * Performs various checks and repairs to ensure critical functionality works
     */
    ensureCriticalFunctionality: function () {
        if (window.EmergencyFallbacksCore) {
            EmergencyFallbacksCore._ensureStorageManager();
            EmergencyFallbacksCore._ensureEventBus();
        }

        if (window.EmergencyFallbacksContent) {
            EmergencyFallbacksContent._ensureSearchCoordinator();
            EmergencyFallbacksContent._ensureDirectAddWikiEntry();
            EmergencyFallbacksContent._ensureDirectAddFandomDomain();
        }
    },

    /**
     * Create a global repair function
     */
    repairApplication: function () {
        if (window.EmergencyFallbacksRepair) {
            EmergencyFallbacksRepair.repairApplication();
        } else {
            console.error('EmergencyFallbacksRepair module missing');
        }
    }
};

// Make globally available
window.EmergencyFallbacks = EmergencyFallbacks;

// Self-initialize
EmergencyFallbacks.init();

// Expose repairApplication globally
window.repairApplication = function () {
    EmergencyFallbacks.repairApplication();
};
