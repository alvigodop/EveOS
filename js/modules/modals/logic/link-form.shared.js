window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (!ns.sharedDataReady || !ns.sharedUiReady) {
        console.warn('[EveLinkForm] Shared helper modules missing.');
        return;
    }
})(window.EveLinkForm);
