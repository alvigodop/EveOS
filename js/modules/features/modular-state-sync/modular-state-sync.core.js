// --- Modular State Sync ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.facadeReady) return;
    if (!ns.sharedReady || !ns.engineReady || !ns.apiReady) {
        console.warn('[ModularStateSync] Helpers missing; facade not initialized.');
        return;
    }

    window.EveDataStore.ModularSync = {
        init: ns.init,
        syncNow: ns.syncNow,
        pullNow: ns.pullNow,
        normalizeBookmarkFilenames: ns.normalizeBookmarkFilenames,
        getCurrentGeminiContextScope: ns.getCurrentGeminiContextScope,
        fetchGeminiContext: ns.fetchGeminiContext,
        sendContextToGemini: ns.sendContextToGemini,
        getStorePath: ns.getStorePath,
        pickFolderPath: ns.pickFolderPath,
        setStorePath: ns.setStorePath,
        backupLayer: ns.backupLayer,
        importLayer: ns.importLayer,
        setEnabled: ns.setEnabled,
        setIntervalMs: ns.setIntervalMs,
        setConflictStrategy: ns.setConflictStrategy,
        isEnabled: ns.isEnabled,
        getIntervalMs: ns.getIntervalMs,
        getConflictStrategy: ns.getConflictStrategy
    };

    if (document.readyState === 'loading') {
        window.addEventListener('load', ns.init);
    } else {
        setTimeout(ns.init, 0);
    }

    ns.facadeReady = true;
})();
