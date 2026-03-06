// --- Data Transfer Folder Import Parse Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseReady) return;
    if (!ns.sharedReady || !ns.importParseFsReady || !ns.importParseStateReady || !ns.importParseHandlesReady || !ns.importParseRootReady) {
        console.warn('[DataTransfer] Shared, filesystem, state, or parse helpers missing; import parse helpers not initialized.');
        return;
    }
    ns.importParseReady = true;
})();
