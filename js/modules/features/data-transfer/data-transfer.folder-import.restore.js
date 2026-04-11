// --- Data Transfer Folder Import Restore Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importRestoreReady) return;
    if (!ns.sharedReady || !ns.exportReady || !ns.importParseReady) {
        console.warn('[DataTransfer] Shared, export, or import parse helpers missing; import restore helpers not initialized.');
        return;
    }

    function getDirectoryPicker() {
        return window.showDirectoryPicker;
    }

    function confirmDialog(message) {
        return showConfirm(message);
    }

    async function importFullDataFromFolderBrowserOnly() {
        const pickDirectory = getDirectoryPicker();
        if (typeof pickDirectory !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = typeof ns.getDataStore === 'function' ? ns.getDataStore() : null;
        if (!dataStore?.applyState) return showToast('Unified backup restore is unavailable right now.', 'error');
        try {
            const rootHandle = await pickDirectory({ mode: 'read' });
            if (!(await confirmDialog('Restore data from selected backup folder? (Overwrites bookmarks & library)'))) return;
            const state = await ns.parseFullStateFromFolder(rootHandle);
            const ok = dataStore.applyState(state);
            if (!ok) return showToast('Folder restore could not be applied.', 'error');
            showToast('Folder backup restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') return showToast('Folder restore canceled.', 'info');
            showToast(`Folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importWorkspaceFromFolderBrowserOnly() {
        const pickDirectory = getDirectoryPicker();
        if (typeof pickDirectory !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = typeof ns.getDataStore === 'function' ? ns.getDataStore() : null;
        if (!dataStore?.applyWorkspaceState) return showToast('Workspace restore is unavailable right now.', 'error');
        try {
            const rootHandle = await pickDirectory({ mode: 'read' });
            if (!(await confirmDialog('Restore tab from selected folder? (Overwrites selected tab workspace)'))) return;
            const stateRoot = await ns.getDirectoryHandleIfExists(rootHandle, 'state');
            const directWorkspaceState = stateRoot ? await ns.readJsonFileIfExists(stateRoot, 'workspace-state.json') : null;
            if (directWorkspaceState?.metadata?.type === 'workspace') {
                const ok = dataStore.applyWorkspaceState(directWorkspaceState);
                if (!ok) return showToast('Tab folder restore could not be applied.', 'error');
                showToast('Tab folder restored!', 'success');
                location.reload();
                return;
            }
            const appConfig = typeof ns.getAppConfig === 'function' ? ns.getAppConfig() : {};
            const selectedWorkspaceId = String(ns.getWorkspaceSelect?.()?.value || appConfig.activeWorkspace || '').trim() || 'main';
            const tabFolders = await ns.resolveTabFoldersFromRoot(rootHandle);
            if (!tabFolders.length) throw new Error('No tab folder found in selected location.');
            const parsedTabs = [];
            for (const tabFolder of tabFolders) {
                parsedTabs.push(await ns.parseTabFolderHandle(tabFolder, { workspaceId: selectedWorkspaceId }));
            }
            let chosen = parsedTabs.find((tab) => String(tab.workspaceId) === selectedWorkspaceId);
            if (!chosen) chosen = parsedTabs[0];
            const workspaceState = ns.buildUnifiedStateFromParsed([chosen], {
                metadataType: 'workspace',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            workspaceState.metadata.workspaceId = chosen.workspaceId;
            workspaceState.metadata.workspaceName = chosen.workspaceName;
            workspaceState.metadata.type = 'workspace';
            const ok = dataStore.applyWorkspaceState(workspaceState);
            if (!ok) return showToast('Tab folder restore could not be applied.', 'error');
            showToast('Tab folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') return showToast('Tab folder restore canceled.', 'info');
            showToast(`Tab folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importCardFromFolderBrowserOnly() {
        const pickDirectory = getDirectoryPicker();
        if (typeof pickDirectory !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = typeof ns.getDataStore === 'function' ? ns.getDataStore() : null;
        if (!dataStore?.applyCardState) return showToast('Card restore is unavailable right now.', 'error');
        try {
            const rootHandle = await pickDirectory({ mode: 'read' });
            if (!(await confirmDialog('Restore card from selected folder? (Overwrites selected workspace/card)'))) return;
            const stateRoot = await ns.getDirectoryHandleIfExists(rootHandle, 'state');
            const directCardState = stateRoot ? await ns.readJsonFileIfExists(stateRoot, 'card-state.json') : null;
            if (directCardState?.metadata?.type === 'card') {
                const ok = dataStore.applyCardState(directCardState);
                if (!ok) return showToast('Card folder restore could not be applied.', 'error');
                showToast('Card folder restored!', 'success');
                location.reload();
                return;
            }
            const appConfig = typeof ns.getAppConfig === 'function' ? ns.getAppConfig() : {};
            const selectedWorkspaceId = String(ns.getCardWorkspaceSelect?.()?.value || appConfig.activeWorkspace || '').trim() || 'main';
            const selectedCategoryName = String(ns.getCardCategorySelect?.()?.value || '').trim();
            const cardFolders = await ns.resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) throw new Error('No card folder found in selected location.');
            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await ns.parseCardFolderHandle(cardFolder, { workspaceId: selectedWorkspaceId, categoryName: selectedCategoryName }));
            }
            let chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId && String(card.categoryName || '').toLowerCase() === String(selectedCategoryName || '').toLowerCase());
            if (!chosen) chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId) || parsedCards[0];
            const workspaceMeta = typeof ns.getWorkspaceMeta === 'function' ? ns.getWorkspaceMeta(chosen.workspaceId) : { id: chosen.workspaceId, name: chosen.workspaceId, icon: 'folder' };
            const tabLike = { workspaceId: chosen.workspaceId, workspaceName: workspaceMeta.name, workspaceIcon: workspaceMeta.icon, parsedCards: [chosen] };
            const cardState = ns.buildUnifiedStateFromParsed([tabLike], {
                metadataType: 'card',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            // Ensure metadata is correctly set on the newly built state
            cardState.metadata.workspaceId = chosen.workspaceId;
            cardState.metadata.categoryName = chosen.categoryName;
            cardState.metadata.type = 'card';
            
            const ok = dataStore.applyCardState(cardState);
            if (!ok) return showToast('Card folder restore could not be applied.', 'error');
            showToast('Card folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') return showToast('Card folder restore canceled.', 'info');
            showToast(`Card folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importFolderFromFolderBrowserOnly() {
        const pickDirectory = getDirectoryPicker();
        if (typeof pickDirectory !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = typeof ns.getDataStore === 'function' ? ns.getDataStore() : null;
        if (!dataStore?.applyFolderState) return showToast('Folder restore is unavailable right now.', 'error');
        try {
            const rootHandle = await pickDirectory({ mode: 'read' });
            if (!(await confirmDialog('Restore folder subtree from selected folder? (Overwrites matching folder subtree)'))) return;
            const stateRoot = await ns.getDirectoryHandleIfExists(rootHandle, 'state');
            let folderState = stateRoot ? await ns.readJsonFileIfExists(stateRoot, 'folder-state.json') : null;
            
            if (!folderState || folderState?.metadata?.type !== 'folder') {
                // Try parsing folder structure directly from the selected folder (datapack style)
                const appConfig = typeof ns.getAppConfig === 'function' ? ns.getAppConfig() : {};
                const selectedWorkspaceId = String(ns.getFolderWorkspaceSelect?.()?.value || appConfig.activeWorkspace || '').trim() || 'main';
                const selectedCategoryName = String(ns.getFolderCategorySelect?.()?.value || '').trim() || 'Unsorted';
                const selectedFolderId = String(ns.getFolderSelect?.()?.value || '').trim();
                
                // We need to parse this as a card first to extract the folder tree, 
                // then slice out the subtree if we have a target folder ID.
                const card = await ns.parseCardFolderHandle(rootHandle, { 
                    workspaceId: selectedWorkspaceId, 
                    categoryName: selectedCategoryName 
                });
                
                if (!card.folderTree?.nodes?.length) {
                    throw new Error('No folder structure found in the selected backup folder.');
                }

                const workspaceMeta = typeof ns.getWorkspaceMeta === 'function' ? ns.getWorkspaceMeta(card.workspaceId) : { id: card.workspaceId, name: card.workspaceId, icon: 'folder' };
                const tabLike = { workspaceId: card.workspaceId, workspaceName: workspaceMeta.name, workspaceIcon: workspaceMeta.icon, parsedCards: [card] };
                const fullCardState = ns.buildUnifiedStateFromParsed([tabLike], {
                    metadataType: 'folder',
                    config: { activeWorkspace: card.workspaceId },
                    activeWorkspace: card.workspaceId
                });

                // If user selected a specific target folder in UI, we use that as the anchor
                const targetFolderId = selectedFolderId || card.folderTree.nodes[0].id;
                
                folderState = fullCardState;
                folderState.metadata.type = 'folder';
                folderState.metadata.folderId = targetFolderId;
                folderState.metadata.categoryName = card.categoryName;
                folderState.metadata.workspaceId = card.workspaceId;
            }

            const ok = dataStore.applyFolderState(folderState);
            if (!ok) return showToast('Folder subtree restore could not be applied.', 'error');
            showToast('Folder subtree restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') return showToast('Folder subtree restore canceled.', 'info');
            showToast(`Folder subtree restore failed: ${error.message || error}`, 'error');
        }
    }

    Object.assign(ns, {
        importFullDataFromFolderBrowserOnly,
        importWorkspaceFromFolderBrowserOnly,
        importCardFromFolderBrowserOnly,
        importFolderFromFolderBrowserOnly
    });
    window.importDataFolderBrowserOnly = importFullDataFromFolderBrowserOnly;
    window.importWorkspaceFolderBackupBrowserOnly = importWorkspaceFromFolderBrowserOnly;
    window.importCardFolderBackupBrowserOnly = importCardFromFolderBrowserOnly;
    window.importFolderFolderBackupBrowserOnly = importFolderFromFolderBrowserOnly;
    ns.importRestoreReady = true;
})();
