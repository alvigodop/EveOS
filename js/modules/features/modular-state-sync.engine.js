// --- Modular State Sync Engine ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.engineReady) return;
    if (!ns.sharedReady || !ns.engineSyncReady || !ns.engineRuntimeReady) {
        console.warn('[ModularStateSync] Shared helpers or engine modules missing; engine not initialized.');
        return;
    }

    ns.engineReady = true;
})();
