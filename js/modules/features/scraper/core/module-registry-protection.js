/**
 * Module Registry Protection (Facade)
 * 
 * Emergency protection for ModuleRegistry. Creates a protected proxy wrapper
 * that prevents common errors like "exists is not a function" and handles
 * recursive calls gracefully.
 * 
 * Refactored into a facade that delegates to:
 * - RPState: Manages flags and counters
 * - RPSafe: Implements safe registry methods
 * - RPProxy: Defines proxy handlers
 * - RPMonitor: Monitors for issues
 * 
 * @version 1.0.1
 */

(function () {
    'use strict';

    console.log('Installing ModuleRegistry protection wrapper');

    // Ensure dependent modules are loaded, or define minimal fallbacks
    // In a real scenario, proper loading order in resource-loader.js ensures they exist.
    const State = window.RPState || {
        resetFlags: () => console.warn('RPState not loaded'),
        clearGlobalCounters: () => { }
    };

    const Safe = window.RPSafe;
    const ProxyHandler = window.RPProxy;
    const Monitor = window.RPMonitor;

    if (!Safe || !ProxyHandler) {
        console.error('Critical Registry Protection components missing. Aborting protection.');
        return;
    }

    // Save reference to the original ModuleRegistry
    const originalModuleRegistry = window.ModuleRegistry;

    // 1. Create the safe/protected registry implementation
    const protectedRegistry = Safe.createProtectedRegistry(originalModuleRegistry);

    // 2. Create the Proxy handler
    const handler = ProxyHandler.createProxyHandler();

    // 3. Create the proxy
    const registryProxy = new Proxy(protectedRegistry, handler);

    // 4. Override global registry
    window.ModuleRegistry = registryProxy;

    console.log('ModuleRegistry protected with safeguards');

    // 5. Start monitoring
    if (Monitor) {
        Monitor.startMonitoring(window.ModuleRegistry);
    } else {
        console.warn('RPMonitor not loaded, automatic recovery disabled');
    }

    // Export helpers for debugging/manual reset
    window.resetModuleRegistryFlags = function () {
        if (window.RPState) {
            window.RPState.resetFlags(window.ModuleRegistry);
        }
    };

    window.forceClearRegistryState = window.resetModuleRegistryFlags;

})();
