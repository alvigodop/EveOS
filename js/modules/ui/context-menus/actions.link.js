window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const shared = window.EveContextMenuActions;
    if (shared.linkReady) return;

    window.ctxLaunch = function () {
        const link = shared.getCtxLink?.();
        if (link?.url) window.open(link.url, '_blank');
        closeAllMenus();
    };

    window.ctxTogglePin = function () {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        togglePin(targetId);
        closeAllMenus();
    };

    window.ctxSetPinScope = function (scopeType) {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        const pinApi = window.EveQuickPins;
        if (!pinApi?.isBookmarkPinned || !pinApi?.setBookmarkScopeType) return;
        if (!pinApi.isBookmarkPinned(targetId)) return;
        pinApi.setBookmarkScopeType(targetId, scopeType);
        closeAllMenus();
    };

    window.ctxToggleDone = function () {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        toggleDone(targetId);
        closeAllMenus();
    };

    window.ctxEdit = function () {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        openEdit(targetId);
        closeAllMenus();
    };

    window.ctxDelete = function () {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        deleteLink(targetId);
        closeAllMenus();
    };

    window.ctxToggleLibraryLink = function () {
        const targetId = shared.getCtxLinkId?.();
        if (!targetId) return;
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api) {
            showToast('Library module not ready', 'error');
            return;
        }
        const existing = api.findConnectionByLinkId?.(targetId);
        if (existing) {
            const categoryName = existing.categoryName;
            api.unlinkLink?.(targetId, true);
            showToast('Bookmark removed from library', 'success');
            window.EveLibrary?.UI?.refreshLibrary?.(categoryName);
        } else {
            const created = api.promoteLink?.(targetId);
            if (created?.categoryName) {
                window.EveLibrary?.UI?.refreshLibrary?.(created.categoryName);
            }
        }
        closeAllMenus();
    };

    window.ctxNeuralEcho = function () {
        closeAllMenus();
        if (!window.ctxLinkId) return;
        const link = shared.getCtxLink?.();
        if (link?.url) {
            const waybackUrl = `https://web.archive.org/web/*/${encodeURI(link.url)}`;
            window.open(waybackUrl, '_blank');
            if (typeof showToast === 'function') showToast('Summoning historical echoes...', 'info');
        }
    };

    shared.linkReady = true;
})();
