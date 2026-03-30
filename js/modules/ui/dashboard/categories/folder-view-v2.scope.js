window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared = window.EveFolderViewV2._shared || {};
    if (shared.scopeReady) return;
    if (!shared.scopeSharedReady || !shared.scopeLinksReady || !shared.scopeActionsReady) {
        console.warn('[EveFolderViewV2] Scope modules missing; scope facade not initialized.');
        return;
    }
    shared.scopeReady = true;
})();
