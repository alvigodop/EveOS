/**
 * Emergency Fallbacks Repair Component
 * Handles the global repair functionality.
 */
const EmergencyFallbacksRepair = {};

/**
 * Initialize the module
 */
EmergencyFallbacksRepair.init = function () {
    console.log('EmergencyFallbacksRepair initialized');
};

/**
 * Create a global repair function
 */
EmergencyFallbacksRepair.repairApplication = function () {
    // Guard against multiple runs
    if (window._repairApplicationComplete) return;
    window._repairApplicationComplete = true;
    if (window.ModuleRegistry) {
        // Checking registry methods

        // Ensure the exists method is available (main cause of errors)
        if (typeof window.ModuleRegistry.exists !== 'function') {
            // console.log('Adding emergency exists method to ModuleRegistry');
            window.ModuleRegistry.exists = function (name) {
                return name && typeof name === 'string' &&
                    this._modules && !!this._modules[name];
            };
        }

        // Ensure isRegistered is available as an alias
        if (typeof window.ModuleRegistry.isRegistered !== 'function') {
            // console.log('Adding emergency isRegistered method to ModuleRegistry');
            window.ModuleRegistry.isRegistered = function (name) {
                if (typeof this.exists === 'function') {
                    try {
                        return this.exists(name);
                    } catch (e) {
                        return !!(name && typeof name === 'string' && this._modules && this._modules[name]);
                    }
                }
                return !!(name && typeof name === 'string' && this._modules && this._modules[name]);
            };
        }

        // Ensure register method works correctly
        if (typeof window.ModuleRegistry.register !== 'function') {
            // console.log('Adding emergency register method to ModuleRegistry');
            window.ModuleRegistry.register = function (name, module) {
                if (!name || !module) return null;
                if (!this._modules) this._modules = {};
                this._modules[name] = {
                    name: name,
                    instance: module,
                    version: module.version || '1.0.0',
                    registered: new Date(),
                    initialized: module._initialized === true || false
                };
                return module;
            };
        }

        // Registry fix applied
    }

    // First ensure critical modules are initialized
    if (window.ModuleInitializer && typeof ModuleInitializer.init === 'function') {
        ModuleInitializer.init();
    }

    // Force initialize all modules (via ModuleUtilities if available)
    if (window.ModuleUtilities && typeof ModuleUtilities.forceInitializeAllModules === 'function') {
        ModuleUtilities.forceInitializeAllModules();
    }

    // Make sure UI elements are visible
    if (window.DirectRenderer) {
        DirectRenderer.verifyUIVisibility();
        DirectRenderer.setupDirectEventHandlers();
    }

    // Ensure critical functionality
    if (window.EmergencyFallbacks) {
        EmergencyFallbacks.ensureCriticalFunctionality();
    }

    console.log('✅ Repair complete');
};

window.EmergencyFallbacksRepair = EmergencyFallbacksRepair;
