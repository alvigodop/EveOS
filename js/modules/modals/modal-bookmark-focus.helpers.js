// --- BOOKMARK FOCUS MODAL HELPERS ---
window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    if (ns.helpersReady) return;
    if (!ns.viewReady || !ns.metadataReady) {
        console.warn('[BookmarkFocus] View or metadata helpers missing; facade not initialized.');
        return;
    }
    ns.helpersReady = true;
})();
