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
    const exportFullBackupAsFolder = ns.exportFullBackupAsFolder;
    const buildFullBackupJsonName = ns.buildFullBackupJsonName;
    const persistLayerDestinationPath = ns.persistLayerDestinationPath;
    const requireLayerDestinationPath = ns.requireLayerDestinationPath;
    const canUseServerFolderBackups = typeof ns.canUseServerFolderBackups === 'function'
        ? ns.canUseServerFolderBackups
        : (modularSync) => /^https?:$/i.test(window.location?.protocol || '') && typeof modularSync?.backupLayer === 'function';

    function downloadFullBackupJson(exportState) {
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = typeof buildFullBackupJsonName === 'function'
            ? buildFullBackupJsonName()
            : `eve_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        if (typeof URL.revokeObjectURL === 'function') {
            setTimeout(() => URL.revokeObjectURL(url), 500);
        }
    }

    function captureFullExportState() {
        const dataStore = getDataStore();
        return dataStore ? dataStore.captureState() : {
            date: new Date().toISOString(),
            config: getAppConfig(),
            links: getAppLinks()
        };
    }

    window.exportDataJsonOnly = function () {
        const exportState = captureFullExportState();
        downloadFullBackupJson(exportState);
        showToast('Full backup downloaded as JSON.', 'info');
    };

    window.exportData = async function () {
        const exportState = captureFullExportState();

        const modularSync = window.EveDataStore?.ModularSync;
        if (canUseServerFolderBackups(modularSync)) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                if (modularSync?.syncNow) {
                    await modularSync.syncNow(true);
                }
                const result = await modularSync.backupLayer({
                    layer: 'store',
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    const tabsCount = Number(result?.summary?.tabs || 0);
                    const cardsCount = Number(result?.summary?.cards || 0);
                    const bookmarksCount = Number(result?.summary?.bookmarks || 0);
                    const dataPackSummary = `${tabsCount} tabs, ${cardsCount} cards, ${bookmarksCount} bookmarks`;
                    showToast(`Data-pack folder backup created (${dataPackSummary}).`, 'success');
                    return;
                }
                console.warn('[DataTransfer] Full pack backup failed in server mode, trying fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Full pack backup failed in server mode, trying fallback:', error);
            }
        }

        try {
            const folderResult = await exportFullBackupAsFolder(exportState);
            if (folderResult?.ok) {
                const tabsCount = Number(folderResult.tabsCount || 0);
                const cardsCount = Number(folderResult.cardsCount || 0);
                const bookmarksCount = Number(folderResult.bookmarksCount || 0);
                const dataPackSummary = `${tabsCount} tabs, ${cardsCount} cards, ${bookmarksCount} bookmarks`;
                showToast(`Backup created (${dataPackSummary}).`, 'success');
                return;
            }
            if (folderResult?.error) {
                showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                showToast('Backup canceled.', 'info');
                return;
            }
            console.warn('[DataTransfer] Backup export failed, using JSON fallback:', error);
            showToast('Backup failed. Downloading JSON backup instead.', 'warning');
        }

        downloadFullBackupJson(exportState);
    };
})();
