// --- Data Transfer Folder Import State Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseStateReady) return;
    if (!ns.sharedReady || !ns.importParseStateInferReady || !ns.importParseStateBuildReady) {
        console.warn('[DataTransfer] Shared, infer, or build helpers missing; import state helpers not initialized.');
        return;
    }
    ns.importParseStateReady = true;
})();
