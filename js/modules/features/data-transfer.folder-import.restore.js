// --- Data Transfer Folder Import Restore Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importRestoreReady) return;
    if (!ns.sharedReady || !ns.exportReady || !ns.importParseReady) {
        console.warn('[DataTransfer] Shared, export, or import parse helpers missing; import restore helpers not initialized.');
        return;
    }

    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getWorkspaceMeta = ns.getWorkspaceMeta;
    const resolveTabFoldersFromRoot = ns.resolveTabFoldersFromRoot;
    const resolveCardFoldersFromRoot = ns.resolveCardFoldersFromRoot;
    const parseTabFolderHandle = ns.parseTabFolderHandle;
    const parseCardFolderHandle = ns.parseCardFolderHandle;
    const buildUnifiedStateFromParsed = ns.buildUnifiedStateFromParsed;
    const parseFullStateFromFolder = ns.parseFullStateFromFolder;

    async function importFullDataFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = getDataStore();
        if (!dataStore?.applyState) return showToast('Unified backup restore is unavailable right now.', 'error');
        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore data from selected backup folder? (Overwrites bookmarks & library)'))) return;
            const state = await parseFullStateFromFolder(rootHandle);
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
        if (typeof window.showDirectoryPicker !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = getDataStore();
        if (!dataStore?.applyWorkspaceState) return showToast('Workspace restore is unavailable right now.', 'error');
        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore tab from selected folder? (Overwrites selected tab workspace)'))) return;
            const selectedWorkspaceId = String(getWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const tabFolders = await resolveTabFoldersFromRoot(rootHandle);
            if (!tabFolders.length) throw new Error('No tab folder found in selected location.');
            const parsedTabs = [];
            for (const tabFolder of tabFolders) {
                parsedTabs.push(await parseTabFolderHandle(tabFolder, { workspaceId: selectedWorkspaceId }));
            }
            let chosen = parsedTabs.find((tab) => String(tab.workspaceId) === selectedWorkspaceId);
            if (!chosen) chosen = parsedTabs[0];
            const workspaceState = buildUnifiedStateFromParsed([chosen], {
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
        if (typeof window.showDirectoryPicker !== 'function') return showToast('Folder restore needs browser directory picker support', 'error');
        const dataStore = getDataStore();
        if (!dataStore?.applyCardState) return showToast('Card restore is unavailable right now.', 'error');
        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore card from selected folder? (Overwrites selected workspace/card)'))) return;
            const selectedWorkspaceId = String(getCardWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const selectedCategoryName = String(getCardCategorySelect()?.value || '').trim();
            const cardFolders = await resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) throw new Error('No card folder found in selected location.');
            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await parseCardFolderHandle(cardFolder, { workspaceId: selectedWorkspaceId, categoryName: selectedCategoryName }));
            }
            let chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId && String(card.categoryName || '').toLowerCase() === String(selectedCategoryName || '').toLowerCase());
            if (!chosen) chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId) || parsedCards[0];
            const workspaceMeta = getWorkspaceMeta(chosen.workspaceId);
            const tabLike = { workspaceId: chosen.workspaceId, workspaceName: workspaceMeta.name, workspaceIcon: workspaceMeta.icon, parsedCards: [chosen] };
            const cardState = buildUnifiedStateFromParsed([tabLike], {
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

    Object.assign(ns, {
        importFullDataFromFolderBrowserOnly,
        importWorkspaceFromFolderBrowserOnly,
        importCardFromFolderBrowserOnly
    });
    window.importDataFolderBrowserOnly = importFullDataFromFolderBrowserOnly;
    window.importWorkspaceFolderBackupBrowserOnly = importWorkspaceFromFolderBrowserOnly;
    window.importCardFolderBackupBrowserOnly = importCardFromFolderBrowserOnly;
    ns.importRestoreReady = true;
})();
