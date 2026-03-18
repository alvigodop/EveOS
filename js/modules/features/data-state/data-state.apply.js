/**
 * Unified State Store Apply Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyReady) return;
    if (!ns.captureReady || !ns.applySharedReady || !ns.applyScopedReady) {
        console.warn('[EveDataStore] Capture/apply helper modules missing; apply helpers not initialized.');
        return;
    }

    ns.applyReady = true;
})();
