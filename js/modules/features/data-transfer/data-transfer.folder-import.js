// --- Data Transfer Folder Import Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importReady) return;
    if (!ns.sharedReady || !ns.exportReady || !ns.importParseReady || !ns.importActivateReady || !ns.importRestoreReady) {
        console.warn('[DataTransfer] Import helpers missing; folder import actions not initialized.');
        return;
    }
    ns.importReady = true;
})();
