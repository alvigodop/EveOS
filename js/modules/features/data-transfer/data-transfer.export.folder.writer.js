// --- Data Transfer Export Folder Writer Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportFolderWriterReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady) {
        console.warn('[DataTransfer] Shared or export utils missing; export folder writers not initialized.');
        return;
    }

    const modules = window.EveDataTransfer.ExportModules || {};
    const createFsHelpers = modules.createFolderWriterFsHelpers;
    const createTreeHelpers = modules.createFolderWriterTreeHelpers;
    const createCardHelpers = modules.createFolderWriterCardHelpers;
    if (typeof createFsHelpers !== 'function' || typeof createTreeHelpers !== 'function' || typeof createCardHelpers !== 'function') {
        console.warn('[DataTransfer] Folder writer helper modules missing; export folder writer facade not initialized.');
        return;
    }

    const deps = {
        sanitizePathSegment: ns.sanitizePathSegment,
        buildWorkspaceFolderName: ns.buildWorkspaceFolderName,
        buildCardFolderName: ns.buildCardFolderName,
        buildFallbackConfig: ns.buildFallbackConfig,
        buildWorkspaceListForFullBackup: ns.buildWorkspaceListForFullBackup,
        groupLinksByWorkspaceAndCategory: ns.groupLinksByWorkspaceAndCategory,
        getConnectionEntryId: ns.getConnectionEntryId,
        findScopedCategoryData: ns.findScopedCategoryData,
        findLibraryEntryById: ns.findLibraryEntryById,
        buildConnectionMap: ns.buildConnectionMap,
        sortLinksForExport: ns.sortLinksForExport,
        buildBookmarkFileName: ns.buildBookmarkFileName,
        shortHashHex: ns.shortHashHex,
        BACKUP_DIRS: Object.freeze({
            meta: '_meta',
            state: 'state',
            knowledge: 'knowledge',
            tabs: 'tabs',
            cards: 'cards',
            folders: 'folders',
            entries: 'entries'
        })
    };

    const fsHelpers = createFsHelpers(deps);
    const treeHelpers = createTreeHelpers(deps);
    const cardHelpers = createCardHelpers(deps, fsHelpers, treeHelpers);

    Object.assign(ns, {
        writeJsonFileToFolder: fsHelpers.writeJsonFileToFolder,
        writeStoreMetaFiles: fsHelpers.writeStoreMetaFiles,
        writeFallbackMetaFiles: fsHelpers.writeFallbackMetaFiles,
        writeScopedCardFolder: cardHelpers.writeScopedCardFolder,
        writeFullStoreFolderBackup: cardHelpers.writeFullStoreFolderBackup,
        writeKnowledgeSnapshot: cardHelpers.writeKnowledgeSnapshot,
        filterKnowledgeState: cardHelpers.filterKnowledgeState,
        buildFallbackConfig: ns.buildFallbackConfig,
        sortLinksForExport: ns.sortLinksForExport,
        buildConnectionMap: ns.buildConnectionMap,
        getConnectionEntryId: ns.getConnectionEntryId,
        findLibraryEntryById: ns.findLibraryEntryById,
        buildCardFolderName: ns.buildCardFolderName,
        buildWorkspaceFolderName: ns.buildWorkspaceFolderName,
        buildBookmarkFileName: ns.buildBookmarkFileName,
        BACKUP_DIRS: fsHelpers.BACKUP_DIRS
    });
    ns.exportFolderWriterReady = true;
})();
