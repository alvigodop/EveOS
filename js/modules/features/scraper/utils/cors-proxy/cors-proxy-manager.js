/**
 * CORS Proxy Manager Module (Facade)
 * 
 * Orchestrates sub-modules to handle CORS proxy selection, testing, and fallback mechanisms.
 * 
 * @version 1.0.3 (Modularized)
 */

const CORSProxyManager = {
    version: '1.0.3',

    // Delegate initialization to Core
    init: function () {
        if (window.CPMCore) {
            // Also trigger utils check and init indicators
            if (window.CPMUtils) {
                CPMUtils.checkLocalDevMode();
                if (window.CPMState) {
                    CPMUtils.initStatusIndicators(CPMState.getProxies());
                }
            }
            return CPMCore.init();
        }
        console.error('CORSProxyManager: CPMCore not found');
        return false;
    },

    // Delegate State methods
    addProxy: function (proxyUrl) {
        if (window.CPMState) {
            const added = CPMState.addProxy(proxyUrl);
            // Updating indicators if needed
            if (added && window.CPMUtils) {
                CPMUtils.updateStatusIndicators(CPMState.getProxies());
            }
        }
    },

    addLocalProxy: function (proxy) {
        if (window.CPMState) CPMState.addLocalProxy(proxy);
    },

    getProxies: function () {
        return window.CPMState ? CPMState.getProxies().map(p => p.url) : [];
    },

    getLocalProxies: function () {
        return window.CPMState ? CPMState.getLocalProxies() : [];
    },

    getProxyStatus: function () {
        if (!window.CPMState) return [];
        return CPMState.getProxies().map(proxy => ({
            proxy: proxy.url,
            working: proxy.working,
            canAccessGoogle: proxy.canAccessGoogle,
            responseTime: proxy.responseTime,
            lastTested: proxy.lastTested
        }));
    },

    hasWorkingProxies: function () {
        return window.CPMState ? CPMState.hasWorkingProxies() : false;
    },

    hasGoogleCapableProxies: function () {
        return window.CPMState ? CPMState.hasGoogleCapableProxies() : false;
    },

    // Delegate Utils methods
    setLocalDevMode: function (enabled) {
        if (window.CPMUtils) {
            CPMUtils.setLocalDevMode(enabled);
            if (window.CPMState) {
                CPMUtils.updateStatusIndicators(CPMState.getProxies());
            }
        }
    },

    needsProxying: function (url) {
        return window.CPMUtils ? CPMUtils.needsProxying(url) : false;
    },

    // Delegate Fetch methods
    fetch: async function (url, options = {}) {
        if (window.CPMFetch) {
            return await CPMFetch.fetch(url, options);
        }
        throw new Error('CORSProxyManager: CPMFetch not initialized');
    },

    // Delegate Testing Methods
    testAllProxies: async function () {
        if (window.CPMTesting && window.CPMState) {
            return await CPMTesting.testAllProxies(window.CPMState, this);
        }
        console.error("CORSProxyManager: CPMTesting or CPMState missing");
        return [];
    },

    testGoogleProxies: async function () {
        if (window.CPMTesting && window.CPMState) {
            return await CPMTesting.testGoogleProxies(window.CPMState, this);
        }
        return 0;
    },

    _updateModuleStatus: function () {
        if (!window.CPMState) return;

        const state = CPMState.getStatus();
        const moduleStatus = {
            functionalStatus: state.workingProxiesCount > 0 ? 'working' : 'error',
            detail: `${state.workingProxiesCount} working proxies, ${state.googleCapableProxiesCount} can access Google`
        };

        console.log(`CORS Proxy Manager status updated: ${moduleStatus.functionalStatus} - ${moduleStatus.detail}`);

        try {
            // Update DirectSearch if it exists
            if (typeof window.DirectSearch !== 'undefined' && window.DirectSearch) {
                try {
                    DirectSearch.functional = state.workingProxiesCount > 0;
                } catch (error) {
                    console.warn('Failed to update DirectSearch status:', error.message);
                }
            }

            // Update SearchManager if it exists
            if (typeof window.SearchManager !== 'undefined' && window.SearchManager && typeof window.SearchManager.updateModuleStatus === 'function') {
                window.SearchManager.updateModuleStatus('CORSProxyManager', moduleStatus);
            }

            // Update TabManager if it exists
            if (typeof window.TabManager !== 'undefined' && window.TabManager && typeof window.TabManager.updateModuleStatus === 'function') {
                window.TabManager.updateModuleStatus('CORSProxyManager', moduleStatus);
            }
        } catch (error) {
            console.error('Error updating module status:', error);
        }
    },

    // Exposed for compatibility but deprecated
    _constructProxyUrl: function (targetUrl, proxyBase) {
        return window.CPMUtils ? CPMUtils.constructProxyUrl(targetUrl, proxyBase) : targetUrl;
    }
};

// Auto-register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CORSProxyManager', CORSProxyManager);
}

// Export the module
window.CORSProxyManager = CORSProxyManager;

// Initialize if auto-init is enabled (and core is ready, otherwise init() will fail safely)
// Note: In modular system, we usually wait for explicit init or loader
if (typeof CORSProxyManager.init === 'function') {
    // Small timeout to allow submodules to load if this file is loaded in parallel
    setTimeout(() => CORSProxyManager.init(), 0);
} 