window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const shared = window.EveContextMenuActions;
    if (shared.folderReady) return;

    function getActiveWorkspaceId() {
        return window.ctxWsId || ((window.config && window.config.activeWorkspace) || 'main');
    }

    function getCategoryLinks(workspaceId, categoryName) {
        const folderScopeShared = window.EveFolderViewV2?._shared || {};
        if (typeof folderScopeShared.getCategoryLinks === 'function') {
            return folderScopeShared.getCategoryLinks(workspaceId, categoryName);
        }
        return window.getModalLinks
            ? window.getModalLinks().filter((link) => link.workspace === workspaceId && link.category === categoryName)
            : [];
    }

    function collectFolderHierarchy(workspaceId, categoryName, folderId) {
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi) return { items: [], folderIds: [] };
        const folderLinks = getCategoryLinks(workspaceId, categoryName);
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, folderLinks);
        const nestedIds = new Set([folderId]);
        function collectNested(parentId) {
            const children = viewModel.childrenMap.get(parentId) || [];
            children.forEach((child) => {
                if (!child.isGhost) {
                    nestedIds.add(child.id);
                    collectNested(child.id);
                }
            });
        }
        collectNested(folderId);

        let items = [];
        const folderIds = Array.from(nestedIds);
        folderIds.forEach((id) => {
            items = items.concat(viewModel.folderLinks.get(id) || []);
        });
        return { items, folderIds };
    }

    function collectFolderItems(workspaceId, categoryName, folderId) {
        return collectFolderHierarchy(workspaceId, categoryName, folderId).items;
    }

    window.ctxFolderAdd = function () {
        closeAllMenus();
        if (window.ctxCatName && window.ctxFolderId && typeof openAddModalForFolder === 'function') {
            openAddModalForFolder(window.ctxCatName, window.ctxFolderId, getActiveWorkspaceId());
        }
    };

    window.ctxFolderSubfolder = function () {
        closeAllMenus();
        if (!(window.ctxCatName && window.ctxFolderId)) return;
        var wsId = getActiveWorkspaceId();
        if (typeof promptCreateBookmarkFolder === 'function') {
            promptCreateBookmarkFolder(window.ctxCatName, window.ctxFolderId, wsId);
        } else if (typeof openFolderCreator === 'function') {
            openFolderCreator(window.ctxCatName, window.ctxFolderId, wsId);
        }
    };

    window.ctxFolderRename = function () {
        closeAllMenus();
        if (!(window.ctxCatName && window.ctxFolderId)) return;
        var wsId = getActiveWorkspaceId();
        if (typeof promptRenameBookmarkFolder === 'function') {
            promptRenameBookmarkFolder(window.ctxCatName, window.ctxFolderId, wsId);
        } else if (typeof openFolderRenamer === 'function') {
            openFolderRenamer(window.ctxCatName, window.ctxFolderId, wsId);
        }
    };

    window.ctxFolderMap = function () {
        closeAllMenus();
        if (window.ctxCatName && window.ctxFolderId && window.EveFolderViewV2?.openFolderScopedMap) {
            window.EveFolderViewV2.openFolderScopedMap(window.ctxCatName, window.ctxFolderId, getActiveWorkspaceId());
        }
    };

    window.ctxFolderAutoTitle = function () {
        closeAllMenus();
        if (window.ctxCatName && window.ctxFolderId && window.EveFolderViewV2?.openFolderBulkTitle) {
            window.EveFolderViewV2.openFolderBulkTitle(window.ctxCatName, window.ctxFolderId, getActiveWorkspaceId());
        }
    };

    window.ctxFolderAutoLibrary = function () {
        closeAllMenus();
        if (window.ctxCatName && window.ctxFolderId && window.EveFolderViewV2?.openFolderBulkLibraryAuto) {
            window.EveFolderViewV2.openFolderBulkLibraryAuto(window.ctxCatName, window.ctxFolderId, getActiveWorkspaceId());
        }
    };

    window.ctxFolderSubScan = function () {
        closeAllMenus();
        if (!(window.ctxCatName && window.ctxFolderId)) return;
        const hierarchy = collectFolderHierarchy(getActiveWorkspaceId(), window.ctxCatName, window.ctxFolderId);
        shared.performDuplicateScan?.(hierarchy.items, 'Folder Sub-Scan (Duplicates)', hierarchy.folderIds);
    };

    window.ctxCatSubScan = function () {
        closeAllMenus();
        const categoryName = window.ctxCatName;
        if (!categoryName) return showToast('No category selected', 'error');
        const workspaceId = getActiveWorkspaceId();
        
        const catLinks = getCategoryLinks(workspaceId, categoryName);

        const folderApi = window.EveBookmarkFolders;
        let folderIds = [];
        if (folderApi) {
            // Even if catLinks is empty, we must try to find the folders for this card name
            const viewModel = folderApi.buildFolderView(workspaceId, categoryName, catLinks);
            // Collect all folder IDs belonging to this card (real nodes, not ghosts)
            folderIds = (viewModel.nodes || []).filter(n => n && n.id && !n.isGhost).map(n => n.id);
        }

        shared.performDuplicateScan?.(catLinks, `Category Sub-Scan (Duplicates) - ${categoryName}`, folderIds);
    };

    window.ctxFolderExport = function () {
        closeAllMenus();
        if (!(window.ctxCatName && window.ctxFolderId)) return;

        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');
        if (!(modal && title && content)) return;

        title.textContent = 'Directory Import/Export';
        modal.style.display = 'flex';

        const workspaceId = getActiveWorkspaceId();
        const categoryName = window.ctxCatName;
        const folderId = window.ctxFolderId;
        window._ctxTempWs = workspaceId;
        window._ctxTempCat = categoryName;
        window._ctxTempFolderId = folderId;

        const dataStore = window.EveDataStore;
        if (!(dataStore && dataStore.captureFolder)) {
            content.innerHTML = '<p style="color:red;">Data Store module is not available for JSON export.</p>';
            return;
        }

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
    };

    window.ctxFolderBulkPatch = function () {
        closeAllMenus();
        if (!(window.ctxCatName && window.ctxFolderId)) return;

        const modal = document.getElementById('folderOperationsModal');
        const title = document.getElementById('folderOperationsTitle');
        const content = document.getElementById('folderOperationsContent');
        if (!(modal && title && content)) return;

        title.textContent = 'Bulk Patch Library Status';
        const workspaceId = getActiveWorkspaceId();
        const itemCount = collectFolderItems(workspaceId, window.ctxCatName, window.ctxFolderId).length;
        window._ctxTempWs = workspaceId;
        window._ctxTempCat = window.ctxCatName;
        window._ctxTempFolderId = window.ctxFolderId;

        const statusOptions = window.EveLibrary?.Schema?.LIBRARY_STATUSES
            ? Object.entries(window.EveLibrary.Schema.LIBRARY_STATUSES).map(([key, value]) => `<option value="${value.id}">${value.label}</option>`).join('')
            : `<option value="plan_to_read">Plan to Read / Unread</option>
               <option value="reading">Actively Reading</option>
               <option value="completed">Completed</option>
               <option value="on_hold">On Hold</option>
               <option value="dropped">Dropped</option>`;

        content.innerHTML = `
            <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                <p style="margin-top: 0;"><strong>Target:</strong> Folder ID [${window.ctxFolderId}] (${itemCount} bookmarks)</p>
                <p style="opacity: 0.8; font-size: 0.9rem;">Assign a specific library status to all bookmarks in this folder. Unlinked bookmarks will be linked automatically.</p>
                <div style="margin-top: 15px; display:flex; flex-direction:column; gap:8px;">
                    <label for="bulkPatchStatusSelect" style="font-weight: bold; font-size:0.9rem;">New Status:</label>
                    <select id="bulkPatchStatusSelect" style="padding: 8px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; width: 100%;">${statusOptions}</select>
                    <button class="btn-primary" style="margin-top: 10px;" onclick="
                        const newStatus = document.getElementById('bulkPatchStatusSelect').value;
                        const folderApi = window.EveBookmarkFolders;
                        if(folderApi && window.EveLibrary && window.EveLibrary.ConnectionsAPI && window.EveLibrary.EntriesAPI) {
                            const scopeShared = window.EveFolderViewV2&&window.EveFolderViewV2._shared ? window.EveFolderViewV2._shared : {};
                            const allLinks = typeof scopeShared.getCategoryLinks === 'function'
                                ? scopeShared.getCategoryLinks(window._ctxTempWs, window._ctxTempCat)
                                : (window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === window._ctxTempWs && l.category === window._ctxTempCat) : []);
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
    };

    window.ctxFolderDelete = function () {
        closeAllMenus();
        if (window.ctxCatName && window.ctxFolderId && typeof deleteBookmarkFolderPrompt === 'function') {
            deleteBookmarkFolderPrompt(window.ctxCatName, window.ctxFolderId, getActiveWorkspaceId());
        }
    };

    shared.folderReady = true;
})();
