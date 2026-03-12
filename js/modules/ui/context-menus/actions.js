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
        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');

        if (modal && title && content) {
            title.textContent = 'Sub-Scan (Duplicates)';
            content.innerHTML = '<p>Scanning...</p>';
            modal.style.display = 'flex';

            const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
            const folderApi = window.EveBookmarkFolders;
            if (folderApi) {
                const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === window.ctxCatName) : [];
                const viewModel = folderApi.buildFolderView(workspaceId, window.ctxCatName, folderLinks);
                const items = viewModel.folderLinks.get(window.ctxFolderId) || [];

                if (typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.scanSubset === 'function') {
                    // Assuming scanSubset returns a report or renders it somewhere, but since it doesn't exist yet, we placeholder it.
                    content.innerHTML = `<p>Found ${items.length} items to scan.</p><p style="color: #00d4ff;">Full scanSubset logic requires duplicate sensor update. Ready for integration.</p>`;
                } else if (typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.scan === 'function') {
                    // Try to hack it into the existing scan by faking the links array temporarily? Too risky.
                    // Instead, let's just show the report here manually or link to the main settings.
                    content.innerHTML = `
                        <p>Found ${items.length} items to scan in this folder.</p>
                        <p>The Duplicate Sensor currently supports Workspace, Card, and Folder scope via the main Settings > Folders tab.</p>
                        <button class="btn-primary" onclick="document.getElementById('folderOperationsModal').style.display='none'; openSettings(); setTimeout(() => switchSettingsTab('backup'), 100);" style="margin-top: 10px;">Open Full Scanner</button>
                    `;
                } else {
                    content.innerHTML = '<p style="color:red;">Duplicate Sensor module not found.</p>';
                }
            } else {
                content.innerHTML = '<p style="color:red;">Folder API not found.</p>';
            }
        }
    }
};

window.ctxFolderExport = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');

        if (modal && title && content) {
            title.textContent = 'Export Directory';
            modal.style.display = 'flex';

            const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
            const folderApi = window.EveBookmarkFolders;
            if (folderApi) {
                const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === window.ctxCatName) : [];
                const viewModel = folderApi.buildFolderView(workspaceId, window.ctxCatName, folderLinks);
                const items = viewModel.folderLinks.get(window.ctxFolderId) || [];

                if (items.length === 0) {
                    content.innerHTML = '<p>Folder is empty, nothing to export.</p>';
                    return;
                }

                const textContent = items.map(l => `${l.title}\n${l.url}`).join('\n\n');
                content.innerHTML = `
                    <p style="color: #0f0; margin-bottom: 8px;">Successfully compiled ${items.length} links.</p>
                    <textarea id="folderExportTextarea" style="width: 100%; height: 200px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 10px; font-family: monospace;" readonly>${textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                    <button class="btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('folderExportTextarea').value).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy to Clipboard', 2000); });" style="margin-top: 10px;">Copy to Clipboard</button>
                `;
            }
        }
    }
};

window.ctxFolderBulkPatch = function() {
    closeAllMenus();
    if (window.ctxCatName && window.ctxFolderId) {
        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');

        if (modal && title && content) {
            title.textContent = 'Bulk Patch Directory';
            content.innerHTML = `
                <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin-top: 0;"><strong>Target:</strong> Category [${window.ctxCatName}] &rarr; Folder ID [${window.ctxFolderId}]</p>
                    <p style="opacity: 0.8; font-size: 0.9rem; margin-bottom: 0;">This module is ready for integration with the new Library status patching engine.</p>
                </div>
            `;
            modal.style.display = 'flex';
        }
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
