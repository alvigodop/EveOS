window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    if (!api.mutationsBasicReady || !api.mutationsCrossScopeReady) {
        console.warn('[EveBookmarkFolders] Mutation modules missing; mutations facade not initialized.');
        return;
    }
    api.mutationsReady = true;
})(window.EveBookmarkFolders);
