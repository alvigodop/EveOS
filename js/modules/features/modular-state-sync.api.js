// --- Modular State Sync API ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiReady) return;
    if (!ns.sharedReady || !ns.engineReady || !ns.apiContextReady || !ns.apiStoreReady) {
        console.warn('[ModularStateSync] Shared helpers or API modules missing; API not initialized.');
        return;
    }

    ns.apiReady = true;
})();
