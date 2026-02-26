/**
 * Registry Guard (Facade) - Protects the ModuleRegistry from recursion and improper usage
 * 
 * Delegates to:
 * - RGSafeRegister: Safe register method creation and flag management
 * 
 * @version 1.1.0-facade
 */

'use strict';

console.log('Initializing Registry Guard protection');

// Create the RegistryGuard object first
window.RegistryGuard = {
    version: '1.1.0-facade',
    _initialized: true,

    init: function () {
        applyRegistryGuard();
        if (window.RGSafeRegister && typeof RGSafeRegister.init === 'function') {
            RGSafeRegister.init();
            RGSafeRegister._initialized = true;
        }
        return this;
    },

    forceApply: function () {
        return applyRegistryGuard();
    },

    reset: function () {
        return window.resetModuleRegistry();
    }
};

// Get safe register creator from sub-module or use fallback
function getSafeRegister(registry) {
    if (window.RGSafeRegister) {
        return RGSafeRegister.createSafeRegister(registry);
    }
    // Fallback implementation
    return function safeRegister(name, module) {
        if (this._safeRegisterActive) return module;
        this._safeRegisterActive = true;
        try {
            if (!this.modules) this.modules = {};
            this.modules[name] = module;
            this._safeRegisterActive = false;
            if (window[name] === undefined && module) window[name] = module;
            return module;
        } catch (e) {
            this._safeRegisterActive = false;
            return module;
        }
    };
}

// Initialize emergency protection
function initEmergencyProtection() {
    if (window._registryGuardInitialized) return;
    window._registryGuardInitialized = true;

    console.log('Setting up Registry Guard protection');

    if (!window.ModuleRegistry) {
        window.ModuleRegistry = {
            version: '1.0.0',
            modules: {},
            dependencies: {},
            _initialized: true,
            register: function (name, module) {
                if (!name || !module) return false;
                this.modules[name] = module;
                return true;
            },
            hasModule: function (name) { return !!this.modules[name]; },
            getAllModules: function () { return { ...this.modules }; }
        };
        console.log('Registry Guard: Created emergency ModuleRegistry instance');
    }

    applyRegistryGuard();
}

// Apply the Registry Guard protection
function applyRegistryGuard() {
    if (window.RGSafeRegister && typeof RGSafeRegister.init === 'function' && !RGSafeRegister._initialized) {
        RGSafeRegister.init();
        RGSafeRegister._initialized = true;
    }
    if (!window.ModuleRegistry) {
        console.warn('Registry Guard: ModuleRegistry not found, creating emergency instance');
        window.ModuleRegistry = {
            version: '1.0.0',
            modules: {},
            dependencies: {},
            _initialized: true,
            register: function (name, module) {
                if (!name || !module) return false;
                this.modules[name] = module;
                return true;
            },
            hasModule: function (name) { return !!this.modules[name]; },
            getAllModules: function () { return { ...this.modules }; }
        };
    }

    const registry = window.ModuleRegistry;

    try {
        registry.register = getSafeRegister(registry);
        console.log('Registry Guard: Applied safe register method');

        if (registry._inner) {
            registry._inner.register = getSafeRegister(registry._inner);
            console.log('Registry Guard: Applied safe register to inner registry');
        }
    } catch (e) {
        console.error('Registry Guard: Failed to protect register method', e);
    }

    return true;
}

// Global reset function - delegates to RGSafeRegister if available
window.resetModuleRegistry = function () {
    console.log('Registry Guard: Performing emergency reset of ModuleRegistry');

    if (window.ModuleRegistry) {
        if (window.RGSafeRegister) {
            RGSafeRegister.resetFlags(window.ModuleRegistry);
        } else {
            // Fallback
            if (window.ModuleRegistry._registering) window.ModuleRegistry._registering = false;
            if (window.ModuleRegistry._gettingModule) window.ModuleRegistry._gettingModule = false;
            if (window.ModuleRegistry._checkingExists) window.ModuleRegistry._checkingExists = false;
            if (window.ModuleRegistry._safeRegisterActive) window.ModuleRegistry._safeRegisterActive = false;
        }

        applyRegistryGuard();
        return true;
    }
    return false;
};

// Backwards compatibility
if (typeof window.resetModuleRegistryFlags === 'function') {
    const originalReset = window.resetModuleRegistryFlags;
    window.resetModuleRegistryFlags = function () {
        try { originalReset(); } catch (e) { }
        try { window.resetModuleRegistry(); } catch (e) { }
    };
}

// Apply protection immediately
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    applyRegistryGuard();
} else {
    document.addEventListener('DOMContentLoaded', applyRegistryGuard);
}

setTimeout(applyRegistryGuard, 500);

// Automatic monitoring - uses RGSafeRegister if available
setInterval(function () {
    if (window.ModuleRegistry) {
        const hasStuck = window.RGSafeRegister
            ? RGSafeRegister.hasStuckFlags(window.ModuleRegistry)
            : (window.ModuleRegistry._registering || window.ModuleRegistry._safeRegisterActive);
        if (hasStuck) {
            console.warn('Registry Guard: Detected stuck flags, performing reset');
            window.resetModuleRegistry();
        }
    }
}, 1000);

// Register the guard
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function' && window.RegistryGuard) {
    try {
        window.ModuleRegistry.register('RegistryGuard', window.RegistryGuard);
    } catch (e) {
        console.error('Error registering RegistryGuard module:', e);
    }
}

console.log('Registry Guard: Emergency protection initialized');

initEmergencyProtection();

// Managed modules list
const managedModules = [
    'CORSProxyManager', 'BrowserEmulator', 'ConnectivityTest', 'UICore',
    'SearchManager', 'GoogleCSEEmbedded', 'CacheManager', 'StorageManager', 'PageFreezeDetector'
];