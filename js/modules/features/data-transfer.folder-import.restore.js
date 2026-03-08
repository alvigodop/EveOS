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
            const workspaceMeta = ns.getWorkspaceMeta(chosen.workspaceId);
            const tabLike = { workspaceId: chosen.workspaceId, workspaceName: workspaceMeta.name, workspaceIcon: workspaceMeta.icon, parsedCards: [chosen] };
            const cardState = ns.buildUnifiedStateFromParsed([tabLike], {
                metadataType: 'card',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
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
            if (!(await confirmDialog('Restore folder subtree from selected folder? (Overwrites the matching folder subtree)'))) return;
            const stateRoot = await ns.getDirectoryHandleIfExists(rootHandle, 'state');
            const folderState = stateRoot ? await ns.readJsonFileIfExists(stateRoot, 'folder-state.json') : null;
            if (!folderState || folderState?.metadata?.type !== 'folder') {
                throw new Error('No state/folder-state.json file found in the selected folder backup.');
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
