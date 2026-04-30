window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const runtime = ns._main || {};
    if (ns.ready) return;

    Object.assign(ns, {
        getActiveDockPins: runtime.getActiveDockPins,
        activatePin: runtime.activatePin,
        revealBookmarkInCard: runtime.revealBookmarkInCard,
        removePin: runtime.removePin,
        movePin: runtime.movePin,
        filterPinsForWorkspace: runtime.filterPinsForWorkspace,
        filterPinsForCard: runtime.filterPinsForCard,
        filterPinsForFolder: runtime.filterPinsForFolder,
        filterPinsForBookmark: runtime.filterPinsForBookmark,
        replacePinsForWorkspace: runtime.replacePinsForWorkspace,
        replacePinsForCard: runtime.replacePinsForCard,
        replacePinsForFolder: runtime.replacePinsForFolder,
        replacePinsForBookmark: runtime.replacePinsForBookmark
    });

    ns.ready = true;
})();
