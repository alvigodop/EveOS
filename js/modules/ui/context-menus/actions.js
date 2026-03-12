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

window.ctxNeuralEcho = function() {
    closeAllMenus();
    if (window.ctxLinkId) {
        const link = window.links ? window.links.find(l => String(l.id) === String(window.ctxLinkId)) : null;
        if (link && link.url) {
            const waybackUrl = `https://web.archive.org/web/*/${encodeURI(link.url)}`;
            window.open(waybackUrl, '_blank');
            if (typeof showToast === 'function') showToast('Summoning historical echoes...', 'info');
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

                if (typeof window.EveDuplicateSensor === 'object' && typeof window.EveDuplicateSensor.scan === 'function') {
                    // We can just use the existing duplicate sensor scan, passing only this folder's items
                    const report = window.EveDuplicateSensor.scan(items);

                    if (!report.groups || report.groups.length === 0) {
                        content.innerHTML = `<p style="color:#0f0;">Scan complete. Found 0 duplicates among ${items.length} items.</p>`;
                    } else {
                        // We will render a mini-report inline
                        window._ctxTempFolderSubScanReport = report; // pass to inline handler if needed

                        let reportHtml = `<p>Found ${report.groups.length} duplicate groups among ${items.length} items.</p>`;
                        reportHtml += `<div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 4px; padding: 10px; margin-top: 10px;">`;

                        report.groups.forEach((group, i) => {
                            reportHtml += `<div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333;">`;
                            reportHtml += `<div style="color: #00d4ff; font-weight: bold; margin-bottom: 4px;">Target URL:</div>`;
                            reportHtml += `<div style="word-break: break-all; font-size: 0.85rem; opacity: 0.8; margin-bottom: 8px;">${group.url}</div>`;
                            group.links.forEach(l => {
                                reportHtml += `<div style="font-size: 0.85rem;">- ${l.title}</div>`;
                            });
                            reportHtml += `</div>`;
                        });

                        reportHtml += `</div>`;
                        reportHtml += `<p style="opacity: 0.7; font-size: 0.8rem; margin-top: 10px;">To merge or delete these, please use the main Settings > Data Management > Folder Backup scanner.</p>`;

                        content.innerHTML = reportHtml;
                    }
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
            title.textContent = 'Directory Import/Export';
            modal.style.display = 'flex';

            const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
            const categoryName = window.ctxCatName;
            const folderId = window.ctxFolderId;
            const folderApi = window.EveBookmarkFolders;

            // Make variables global temporarily for the inline click handlers
            window._ctxTempWs = workspaceId;
            window._ctxTempCat = categoryName;
            window._ctxTempFolderId = folderId;

            // A helper to quickly simulate what the main Settings > Data Management modal does,
            // but focused strictly on this exact folder. We use the existing `EveDataStore` methods.
            const dataStore = window.EveDataStore;

            if (dataStore && dataStore.captureFolder) {
                content.innerHTML = `
                    <p style="margin-top: 0; opacity: 0.8; font-size: 0.9rem;">Backup this specific folder, its nested subfolders, and all of their bookmarks into a JSON data pack.</p>
                    <div style="display:flex; gap: 10px; margin-top: 15px;">
                        <button class="btn-primary" style="flex:1;" onclick="
                            try {
                                const state = window.EveDataStore.captureFolder(window._ctxTempWs, window._ctxTempCat, window._ctxTempFolderId);
                                const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'folder_backup_' + window._ctxTempCat.replace(/\\s+/g, '_') + '_' + window._ctxTempFolderId + '.json';
                                a.click();
                                if(typeof showToast === 'function') showToast('Folder exported successfully', 'success');
                            } catch(e) {
                                console.error('Export failed:', e);
                                if(typeof showToast === 'function') showToast('Folder export failed', 'error');
                            }
                        ">Export JSON</button>

                        <label class="btn-primary" style="flex:1; cursor:pointer; text-align:center; box-sizing:border-box;">
                            Import JSON
                            <input type="file" style="display:none;" onchange="
                                const file = this.files[0];
                                if(!file) return;
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    try {
                                        const parsed = JSON.parse(e.target.result);
                                        if (window.EveDataStore && window.EveDataStore.applyFolder) {
                                            window.EveDataStore.applyFolder(window._ctxTempWs, window._ctxTempCat, window._ctxTempFolderId, parsed);
                                            if(typeof saveData === 'function') saveData();
                                            if(typeof renderDashboard === 'function') renderDashboard();
                                            if(typeof showToast === 'function') showToast('Folder imported successfully', 'success');
                                            document.getElementById('folderOperationsModal').style.display='none';
                                        }
                                    } catch(err) {
                                        console.error('Import failed:', err);
                                        if(typeof showToast === 'function') showToast('Invalid JSON file', 'error');
                                    }
                                };
                                reader.readAsText(file);
                            ">
                        </label>
                    </div>
                `;
            } else {
                content.innerHTML = '<p style="color:red;">Data Store module is not available for JSON export.</p>';
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
            title.textContent = 'Bulk Patch Library Status';

            const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
            const folderApi = window.EveBookmarkFolders;
            let itemCount = 0;
            if (folderApi) {
                const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === workspaceId && l.category === window.ctxCatName) : [];
                const viewModel = folderApi.buildFolderView(workspaceId, window.ctxCatName, folderLinks);
                const items = viewModel.folderLinks.get(window.ctxFolderId) || [];
                itemCount = items.length;
            }

            // Expose vars for the inline onclick handler
            window._ctxTempWs = workspaceId;
            window._ctxTempCat = window.ctxCatName;
            window._ctxTempFolderId = window.ctxFolderId;

            content.innerHTML = `
                <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin-top: 0;"><strong>Target:</strong> Folder ID [${window.ctxFolderId}] (${itemCount} bookmarks)</p>
                    <p style="opacity: 0.8; font-size: 0.9rem;">Assign a specific library status to all bookmarks in this folder. Unlinked bookmarks will be linked automatically.</p>

                    <div style="margin-top: 15px; display:flex; flex-direction:column; gap:8px;">
                        <label for="bulkPatchStatusSelect" style="font-weight: bold; font-size:0.9rem;">New Status:</label>
                        <select id="bulkPatchStatusSelect" style="padding: 8px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; width: 100%;">
                            ${window.EveLibrary && window.EveLibrary.Schema && window.EveLibrary.Schema.LIBRARY_STATUSES ?
                                Object.entries(window.EveLibrary.Schema.LIBRARY_STATUSES).map(([k, v]) => `<option value="${v.id}">${v.label}</option>`).join('') :
                                `<option value="plan_to_read">Plan to Read / Unread</option>
                                <option value="reading">Actively Reading</option>
                                <option value="completed">Completed</option>
                                <option value="on_hold">On Hold</option>
                                <option value="dropped">Dropped</option>`
                            }
                        </select>
                        <button class="btn-primary" style="margin-top: 10px;" onclick="
                            const newStatus = document.getElementById('bulkPatchStatusSelect').value;
                            const folderApi = window.EveBookmarkFolders;
                            if(folderApi && window.EveLibrary && window.EveLibrary.ConnectionsAPI && window.EveLibrary.EntriesAPI) {
                                const allLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === window._ctxTempWs && l.category === window._ctxTempCat) : [];
                                const view = folderApi.buildFolderView(window._ctxTempWs, window._ctxTempCat, allLinks);
                                const folderItems = view.folderLinks.get(window._ctxTempFolderId) || [];

                                let patched = 0;
                                const ws = window._ctxTempWs;
                                const cat = window._ctxTempCat;
                                const entries = window.EveLibrary.EntriesAPI.getEntriesForWorkspace(ws, cat);

                                folderItems.forEach(link => {
                                    let conn = window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(link.id);
                                    if (!conn) {
                                        const entry = window.EveLibrary.EntriesAPI.createEntry(ws, cat, link.title || 'Untitled', '', 'bookmark', link.url || '');
                                        conn = window.EveLibrary.ConnectionsAPI.createConnection(entry.id, link.id, ws, cat);
                                        entries.push(entry);
                                    }

                                    if (conn && conn.entryId) {
                                        const targetEntry = entries.find(e => e.id === conn.entryId);
                                        if (targetEntry) {
                                            if (!targetEntry.libraryStatus) targetEntry.libraryStatus = {};
                                            targetEntry.libraryStatus.id = newStatus;
                                            patched++;
                                        }
                                    }
                                });

                                if(typeof saveData === 'function') saveData();
                                if(typeof renderDashboard === 'function') renderDashboard();
                                if(typeof showToast === 'function') showToast('Successfully patched ' + patched + ' items to ' + newStatus, 'success');
                                document.getElementById('folderOperationsModal').style.display='none';
                            } else {
                                if(typeof showToast === 'function') showToast('Library API unavailable', 'error');
                            }
                        ">Apply Status to Folder</button>
                    </div>
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
