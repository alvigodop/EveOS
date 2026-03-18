// --- Data Transfer Module ---
// Handles legacy JSON import/export glue and delegates folder workflows.
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (!ns.sharedReady || !ns.exportReady || !ns.importReady || !ns.importActionsReady) {
        console.warn('[DataTransfer] Helpers missing; main module not fully initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const isLocalhostHost = ns.isLocalhostHost;
    const exportFullBackupAsFolder = ns.exportFullBackupAsFolder;

    window.exportData = async function () {
        const dataStore = getDataStore();
        const exportState = dataStore ? dataStore.captureState() : {
            date: new Date().toISOString(),
            config: getAppConfig(),
            links: getAppLinks()
        };

        const canAttemptFolderExport = typeof window.showDirectoryPicker === 'function';
        if (canAttemptFolderExport) {
            try {
                if (isLocalhostHost() && window.EveDataStore?.ModularSync?.syncNow) {
                    await window.EveDataStore.ModularSync.syncNow(true);
                }
                const folderResult = await exportFullBackupAsFolder(exportState);
                if (folderResult?.ok) {
                    const tabsCount = Number(folderResult.tabsCount || 0);
                    const cardsCount = Number(folderResult.cardsCount || 0);
                    const bookmarksCount = Number(folderResult.bookmarksCount || 0);
                    const dataPackSummary = `${tabsCount} tabs, ${cardsCount} cards, ${bookmarksCount} bookmarks`;
                    showToast(`Folder backup created (${dataPackSummary}).`, 'success');
                    return;
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    showToast('Folder backup canceled.', 'info');
                    return;
                }
                console.warn('[DataTransfer] Folder backup export failed, using JSON fallback:', error);
                showToast('Folder backup failed. Downloading JSON backup instead.', 'warning');
            }
        }

        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    };
})();
