// --- Data Transfer Export Folder Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportFolderReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady || !ns.exportFolderWriterReady) {
        console.warn('[DataTransfer] Shared, export utils, or folder writers missing; export folder helpers not initialized.');
        return;
    }

    const deps = {
        getAppConfig: ns.getAppConfig,
        getLayerPathInput: ns.getLayerPathInput,
        getSuggestedBackupFolderName: ns.getSuggestedBackupFolderName,
        buildScopedBackupFolderName: ns.buildScopedBackupFolderName,
        getWorkspaceMeta: ns.getWorkspaceMeta,
        buildFallbackConfig: ns.buildFallbackConfig,
        writeJsonFileToFolder: ns.writeJsonFileToFolder,
        writeFallbackMetaFiles: ns.writeFallbackMetaFiles,
        writeFullStoreFolderBackup: ns.writeFullStoreFolderBackup,
        writeScopedCardFolder: ns.writeScopedCardFolder,
        sortLinksForExport: ns.sortLinksForExport,
        buildConnectionMap: ns.buildConnectionMap,
        getConnectionEntryId: ns.getConnectionEntryId,
        findLibraryEntryById: ns.findLibraryEntryById,
        buildCardFolderName: ns.buildCardFolderName,
        buildWorkspaceFolderName: ns.buildWorkspaceFolderName,
        buildBookmarkFileName: ns.buildBookmarkFileName,
        BACKUP_DIRS: ns.BACKUP_DIRS
    };

    const modules = window.EveDataTransfer.ExportModules || {};
    const backupHelpers = typeof modules.createFolderBackupHelpers === 'function'
        ? modules.createFolderBackupHelpers(deps)
        : {};
    const pathHelpers = typeof modules.createFolderPathHelpers === 'function'
        ? modules.createFolderPathHelpers(deps)
        : {};

    Object.assign(ns, backupHelpers, pathHelpers);
    ns.exportFolderReady = true;
})();
