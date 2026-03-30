window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (!shared.derivedNormalizeReady || !shared.derivedMetricsReady || !shared.derivedBucketsReady) {
        console.warn('[EveBookmarkFolders] Derived helpers missing; derived facade not initialized.');
        return;
    }

    shared.derivedReady = true;
})(window.EveBookmarkFolders);
