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

window.ctxLaunch = function () { const l = links.find(x => x.id === ctxLinkId); if (l) window.open(l.url, '_blank'); };
window.ctxTogglePin = function () { togglePin(ctxLinkId); };
window.ctxToggleDone = function () { toggleDone(ctxLinkId); };
window.ctxEdit = function () { openEdit(ctxLinkId); };
window.ctxDelete = function () { deleteLink(ctxLinkId); };
window.ctxToggleLibraryLink = function () {
    if (!ctxLinkId) return;
    const api = window.EveLibrary?.ConnectionsAPI;
    if (!api) {
        showToast("Library module not ready", "error");
        return;
    }
    const existing = api.findConnectionByLinkId?.(ctxLinkId);
    if (existing) {
        const categoryName = existing.categoryName;
        api.unlinkLink?.(ctxLinkId, true);
        showToast("Bookmark removed from library", "success");
        window.EveLibrary?.UI?.refreshLibrary?.(categoryName);
    } else {
        const created = api.promoteLink?.(ctxLinkId);
        if (created?.categoryName) {
            window.EveLibrary?.UI?.refreshLibrary?.(created.categoryName);
        }
    }
    closeAllMenus();
};

window.ctxCatToggleTask = function () {
    if (config.hideStats.includes(ctxCatName)) config.hideStats = config.hideStats.filter(c => c !== ctxCatName);
    else config.hideStats.push(ctxCatName);
    saveConfig();
    renderDashboard();
};

window.ctxCatFocus = function () { setFocus(ctxCatName); };
window.ctxCatRename = function () { openRenameModal(ctxCatName); };
window.ctxCatLaunch = function () { launchCategory(ctxCatName); };

window.ctxWsDelete = async function () {
    if (config.workspaces.length <= 1) return showToast("Cannot delete last workspace", "error");
    if (await showConfirm("Delete Workspace? Links move to Main.")) {
        config.workspaces = config.workspaces.filter(w => w.id !== ctxWsId);
        links.forEach(l => { if (l.workspace === ctxWsId) l.workspace = config.workspaces[0].id; });
        config.activeWorkspace = config.workspaces[0].id;
        saveConfig();
        saveData();
        renderSidebar();
    }
};
