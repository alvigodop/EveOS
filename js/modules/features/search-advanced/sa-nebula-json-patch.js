window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (root.NebulaJsonPatch && searchNs.NebulaJsonPatch) return;
    const h = searchNs._NebulaJsonPatchShared || {};
    const parts = searchNs._NebulaJsonPatchParts || {};
    const api = {
        supportedOps: Array.from(h.SUPPORTED_OPS || []),
        buildPatch: parts.buildPatch,
        buildTransaction: parts.buildTransaction,
        validatePatch: parts.validatePatch,
        previewPatch: parts.previewPatch,
        applyPatch: parts.applyPatch,
        validateTransaction: parts.validateTransaction,
        previewTransaction: parts.previewTransaction,
        applyTransaction: parts.applyTransaction
    };
    root.NebulaJsonPatch = api;
    searchNs.NebulaJsonPatch = api;
    window.NebulaJsonPatch = api;
})();
