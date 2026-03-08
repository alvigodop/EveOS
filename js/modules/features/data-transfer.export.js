// --- Data Transfer Export Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady || !ns.exportFolderReady) {
        console.warn('[DataTransfer] Export helpers missing; export actions not initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getBookmarkWorkspaceSelect = ns.getBookmarkWorkspaceSelect;
    const getBookmarkCategorySelect = ns.getBookmarkCategorySelect;
    const getBookmarkLinkSelect = ns.getBookmarkLinkSelect;
    const buildWorkspacePayload = ns.buildWorkspacePayload;
    const buildCardPayload = ns.buildCardPayload;
    const isLocalhostHost = ns.isLocalhostHost;
    const exportFullBackupAsFolder = ns.exportFullBackupAsFolder;
    const exportWorkspaceFolderFallback = ns.exportWorkspaceFolderFallback;
    const exportCardFolderFallback = ns.exportCardFolderFallback;
    const buildWorkspaceBackupJsonName = ns.buildWorkspaceBackupJsonName;
    const buildCardBackupJsonName = ns.buildCardBackupJsonName;
    const buildBookmarkBackupJsonName = ns.buildBookmarkBackupJsonName;
    const requireLayerDestinationPath = ns.requireLayerDestinationPath;
    const persistLayerDestinationPath = ns.persistLayerDestinationPath;

    function downloadWorkspaceBackupJson(workspaceId, workspaceName, exportState) {
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildWorkspaceBackupJsonName(workspaceId, workspaceName);
        a.click();
    }

    function downloadCardBackupJson(workspaceId, workspaceName, categoryName, exportState) {
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildCardBackupJsonName(workspaceId, workspaceName, categoryName);
        a.click();
    }

    window.exportWorkspaceBackup = async function () {
        const dataStore = getDataStore();
        const select = getWorkspaceSelect();
        const appConfig = getAppConfig();
        const workspaceId = (select?.value || appConfig.activeWorkspace || '').trim();
        if (!workspaceId) {
            return showToast('No workspace selected for export.', 'error');
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const modularSync = window.EveDataStore?.ModularSync;
        const workspaceState = dataStore?.captureWorkspace
            ? dataStore.captureWorkspace(workspaceId)
            : buildWorkspacePayload(workspaceId);

        if (modularSync?.backupLayer) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'tab',
                    workspaceId,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Tab folder backup created: ${result.destinationPath}`, 'success');
                }
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const folderResult = await exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName);
                if (folderResult?.ok) {
                    return showToast(
                        `Tab folder backup created (${folderResult.cards} cards, ${folderResult.bookmarks} bookmarks).`,
                        'success'
                    );
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return showToast('Tab folder backup canceled.', 'info');
                }
                console.warn('[DataTransfer] Browser tab folder backup failed, falling back to JSON:', error);
            }
        }

        downloadWorkspaceBackupJson(workspaceId, workspaceName, workspaceState);
        showToast('Tab folder export not available. Downloaded tab JSON instead.', 'info');
    };

    window.exportCardBackup = async function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        if (!workspaceId || !categoryName) {
            return showToast('Select workspace and card category first.', 'error');
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const modularSync = window.EveDataStore?.ModularSync;
        const cardState = dataStore?.captureCard
            ? dataStore.captureCard(workspaceId, categoryName)
            : buildCardPayload(workspaceId, categoryName);

        if (modularSync?.backupLayer) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'card',
                    workspaceId,
                    categoryName,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Card folder backup created: ${result.destinationPath}`, 'success');
                }
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const folderResult = await exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName);
                if (folderResult?.ok) {
                    return showToast(`Card folder backup created (${folderResult.bookmarks} bookmarks).`, 'success');
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return showToast('Card folder backup canceled.', 'info');
                }
                console.warn('[DataTransfer] Browser card folder backup failed, falling back to JSON:', error);
            }
        }

        downloadCardBackupJson(workspaceId, workspaceName, categoryName, cardState);
        showToast('Card folder export not available. Downloaded card JSON instead.', 'info');
    };

    window.exportBookmarkBackup = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        const linkId = String(linkSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !linkId) {
            return showToast('Select workspace, category, and bookmark first.', 'error');
        }

        const selectedLink = getAppLinks().find(entry => String(entry.id) === linkId);
        const exportState = dataStore?.captureBookmark
            ? dataStore.captureBookmark(workspaceId, categoryName, linkId)
            : null;
        if (!exportState) {
            return showToast('Could not build bookmark backup payload.', 'error');
        }

        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildBookmarkBackupJsonName(
            workspaceId,
            workspaceName,
            categoryName,
            selectedLink || exportState?.bookmarks?.links?.[0] || { id: linkId }
        );
        a.click();
    };

    ns.exportReady = true;
})();
