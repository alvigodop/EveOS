window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core = ns._core || {};
    if (core.loaded) return;
    if (ns.ready) return;

    const {
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        normalizePins,
        migrateLegacyPins,
        getPins,
        flushPinPersistence,
        writeStore,
        isBookmarkPinned,
        getBookmarkScopeType,
        getBookmarkScopeOptions,
        resolveDefaultBookmarkScopeType,
        isCardPinned,
        getCardScopeType,
        isFolderPinned,
        getFolderScopeType,
        getTargetVisibilityScopeOptions,
        describeTargetVisibilityScope,
        toggleBookmarkPin,
        setBookmarkScopeType,
        bulkPinBookmarks,
        bulkUnpinBookmarks,
        pinCardRootBookmarks,
        unpinCardBookmarks,
        pinFolderBookmarks,
        unpinFolderBookmarks,
        toggleCardPin,
        toggleFolderPin,
        setCardScopeType,
        setFolderScopeType,
        getTargetContext,
        getLinkById
    } = core;

    Object.assign(ns, {
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        normalizePins,
        migrateLegacyPins,
        getPins,
        flushPinPersistence,
        writeStore,
        isBookmarkPinned,
        getBookmarkScopeType,
        getBookmarkScopeOptions,
        resolveDefaultBookmarkScopeType,
        isCardPinned,
        getCardScopeType,
        isFolderPinned,
        getFolderScopeType,
        getTargetVisibilityScopeOptions,
        describeTargetVisibilityScope,
        toggleBookmarkPin,
        setBookmarkScopeType,
        bulkPinBookmarks,
        bulkUnpinBookmarks,
        pinCardRootBookmarks,
        unpinCardBookmarks,
        pinFolderBookmarks,
        unpinFolderBookmarks,
        toggleCardPin,
        toggleFolderPin,
        setCardScopeType,
        setFolderScopeType,
        getTargetContext,
        getLinkById
    });

    core.loaded = true;
    window.addEventListener('pagehide', flushPinPersistence);
    window.addEventListener('beforeunload', flushPinPersistence);
})();
