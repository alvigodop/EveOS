// --- Data Transfer Export Folder Writer Card Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    const modules = window.EveDataTransfer.ExportModules || {};

    window.EveDataTransfer.ExportModules.createFolderWriterCardHelpers = function createFolderWriterCardHelpers(deps, fsHelpers, treeHelpers) {
        const createBookmarkHelpers = modules.createFolderWriterBookmarkHelpers;
        const createBackupHelpers = modules.createFolderWriterBackupHelpers;
        if (typeof createBookmarkHelpers !== 'function' || typeof createBackupHelpers !== 'function') {
            console.warn('[DataTransfer] Folder writer bookmark/backup helper modules missing; card helper facade not initialized.');
            return {};
        }

        const bookmarkHelpers = createBookmarkHelpers(deps, fsHelpers, treeHelpers);
        const backupHelpers = createBackupHelpers(deps, fsHelpers, treeHelpers, bookmarkHelpers);
        return Object.assign({}, bookmarkHelpers, backupHelpers);
    };
})();
