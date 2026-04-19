window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    if (!api.runtimeSharedReady || !api.runtimeUiReady) {
        console.warn('EveBulkImport: runtime helpers missing');
    }
})();
