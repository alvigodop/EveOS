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
        window.EveBookmarkFolders?.deleteCategoryEverywhere?.(name);
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
window.ctxSetPinScope = function (scopeType) {
    const targetId = getCtxLinkId();
    if (!targetId) return;
    const pinApi = window.EveQuickPins;
    if (!pinApi?.isBookmarkPinned || !pinApi?.setBookmarkScopeType) return;
    if (!pinApi.isBookmarkPinned(targetId)) return;
    pinApi.setBookmarkScopeType(targetId, scopeType);
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
        window.EveBookmarkFolders?.moveWorkspaceTrees?.(ctxWsId, targetWorkspaceId);
        config.activeWorkspace = config.workspaces[0].id;
        saveConfig();
        saveData();
        renderSidebar();
    }
};

// --- Folder Actions ---
window.ctxFolderAdd = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        if (typeof openAddModalForFolder === 'function') {
            openAddModalForFolder(window.ctxCatName, window.ctxFolderId);
        }
    }
};

window.ctxFolderSubfolder = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        if (typeof promptCreateBookmarkFolder === 'function') {
            promptCreateBookmarkFolder(window.ctxCatName, window.ctxFolderId);
        } else if (typeof openFolderCreator === 'function') {
            openFolderCreator(window.ctxCatName, window.ctxFolderId);
        }
    }
};

window.ctxFolderRename = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        if (typeof promptRenameBookmarkFolder === 'function') {
            promptRenameBookmarkFolder(window.ctxCatName, window.ctxFolderId);
        } else if (typeof openFolderRenamer === 'function') {
            openFolderRenamer(window.ctxCatName, window.ctxFolderId);
        }
    }
};

window.ctxFolderSubScan = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        if (typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.startScan === 'function') {
            const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
            const folderApi = window.EveBookmarkFolders;
            if (folderApi) {
                const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === window.ctxCatName) : [];
                const viewModel = folderApi.buildFolderView(workspaceId, window.ctxCatName, folderLinks);
                const items = viewModel.folderLinks.get(window.ctxFolderId) || [];
                // Actually, duplicate sensor doesn't have a scoped scan, but we can pass an array of items
                // This is a complex feature so we will just alert for now or implement properly if the API exists.
                if (typeof window.EveDuplicateSensor.scanSubset === 'function') {
                    window.EveDuplicateSensor.scanSubset(items);
                } else {
                    alert(`Sub-Scan feature triggered for ${items.length} items. Full implementation requires duplicate sensor update.`);
                }
            }
        } else {
            alert('Duplicate Sensor module not found.');
        }
    }
};

window.ctxFolderExport = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
        const folderApi = window.EveBookmarkFolders;
        if (folderApi) {
            const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === window.ctxCatName) : [];
            const viewModel = folderApi.buildFolderView(workspaceId, window.ctxCatName, folderLinks);
            const items = viewModel.folderLinks.get(window.ctxFolderId) || [];
            if (items.length === 0) {
                alert("Folder is empty, nothing to export.");
                return;
            }
            const textContent = items.map(l => `${l.title}\n${l.url}`).join('\n\n');
            navigator.clipboard.writeText(textContent).then(() => {
                alert(`Exported ${items.length} links to clipboard!`);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy. See console.');
            });
        }
    }
};

window.ctxFolderBulkPatch = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        // Here we could open a modal for bulk patch
        alert('Bulk Patch feature triggered for this folder. Opening Bulk Patch UI... (Placeholder)');
    }
};

window.ctxFolderDelete = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        if (typeof deleteBookmarkFolderPrompt === 'function') {
            deleteBookmarkFolderPrompt(window.ctxCatName, window.ctxFolderId);
        }
    }
};
