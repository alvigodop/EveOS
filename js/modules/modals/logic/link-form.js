window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.ready) return;
    if (!ns.coverImagesReady || !ns.modalReady) {
        console.warn('[LinkForm] Modules missing; link form facade not initialized.');
        return;
    }
    ns.ready = true;
})(window.EveLinkForm);
