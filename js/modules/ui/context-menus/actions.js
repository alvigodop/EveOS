function getCtxLinkId() {
    return String(window.ctxLinkId ?? '');
}

function getCtxCategoryName() {
    const fromContext = String(window.ctxCatName ?? '').trim();
    if (fromContext) return fromContext;

    const fromModal = String(window.currentCategoryCtx ?? '').trim();
    if (fromModal) {
        window.ctxCatName = fromModal;
        return fromModal;
    }

    return '';
}

function getCtxLink() {
    const targetId = getCtxLinkId();
    if (!targetId) return null;
    return links.find(x => String(x?.id) === targetId) || null;
}

// Context Menu Global Actions
window.deleteCategory = async function (name) {
    if (await showConfirm('Delete Category?')) {
        const removedIds = links.filter(l => l.category === name).map(l => l.id);
        links = links.filter(l => l.category !== name);
        if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
            removedIds.forEach(id => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
        }
        saveData();
    }
};

window.ctxLaunch = function () {
    const link = getCtxLink();
    if (link?.url) window.open(link.url, '_blank');
    closeAllMenus();
};
window.ctxTogglePin = function () {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    togglePin(targetId);
    closeAllMenus();
};
window.ctxToggleDone = function () {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    toggleDone(targetId);
    closeAllMenus();
};
window.ctxEdit = function () {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    openEdit(targetId);
    closeAllMenus();
};
window.ctxDelete = function () {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    deleteLink(targetId);
    closeAllMenus();
};
window.ctxToggleLibraryLink = function () {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    const api = window.EveLibrary?.ConnectionsAPI;
    if (!api) {
        showToast("Library module not ready", "error");
        return;
    }
    const existing = api.findConnectionByLinkId?.(targetId);
    if (existing) {
        const categoryName = existing.categoryName;
        api.unlinkLink?.(targetId, true);
        showToast("Bookmark removed from library", "success");
        window.EveLibrary?.UI?.refreshLibrary?.(categoryName);
    } else {
        const created = api.promoteLink?.(targetId);
        if (created?.categoryName) {
            window.EveLibrary?.UI?.refreshLibrary?.(created.categoryName);
        }
    }
    closeAllMenus();
};

window.ctxCatToggleTask = function () {
    const categoryName = getCtxCategoryName();
    if (!categoryName) return showToast("No category selected", "error");

    if (config.hideStats.includes(categoryName)) config.hideStats = config.hideStats.filter(c => c !== categoryName);
    else config.hideStats.push(categoryName);

    saveConfig();
    renderDashboard();
};

window.ctxCatFocus = function () {
    const categoryName = getCtxCategoryName();
    if (!categoryName) return showToast("No category selected", "error");
    setFocus(categoryName);
};
window.ctxCatRename = function () {
    const categoryName = getCtxCategoryName();
    if (!categoryName) return showToast("No category selected", "error");
    openRenameModal(categoryName);
};
window.ctxCatLaunch = function () {
    const categoryName = getCtxCategoryName();
    if (!categoryName) return showToast("No category selected", "error");
    launchCategory(categoryName);
};

window.ctxWsDelete = async function () {
    if (config.workspaces.length <= 1) return showToast("Cannot delete last workspace", "error");
    if (await showConfirm("Delete Workspace? Links move to Main.")) {
        config.workspaces = config.workspaces.filter(w => w.id !== ctxWsId);
        const targetWorkspaceId = config.workspaces[0].id;
        const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
        links.forEach(l => {
            if (l.workspace !== ctxWsId) return;
            l.workspace = targetWorkspaceId;
            if (typeof syncLinked === 'function') {
                syncLinked(l.id);
            }
        });
        config.activeWorkspace = config.workspaces[0].id;
        saveConfig();
        saveData();
        renderSidebar();
    }
};
