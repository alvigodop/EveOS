/**
 * Unified State Store Apply Scoped Helpers
 */
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore;
    if (ns.applyScopedReady) return;
    if (!ns.captureReady || !ns.applySharedReady || !ns.applyScopedHelpersReady || !ns.applyScopedVariantsReady) {
        console.warn('[EveDataStore] Scoped apply dependencies missing; scoped facade not initialized.');
        return;
    }

    ns.applyScopedReady = true;
})();
