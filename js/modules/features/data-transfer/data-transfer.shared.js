// --- Data Transfer Shared ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.sharedReady) return;

    if (typeof ns.refreshWorkspaceBackupList === 'function') {
        window.refreshWorkspaceBackupList = ns.refreshWorkspaceBackupList;
    }
    if (typeof ns.refreshGroupBackupList === 'function') {
        window.refreshGroupBackupList = ns.refreshGroupBackupList;
    }
    if (typeof ns.refreshCardBackupList === 'function') {
        window.refreshCardBackupList = ns.refreshCardBackupList;
    }
    if (typeof ns.refreshBookmarkBackupList === 'function') {
        window.refreshBookmarkBackupList = ns.refreshBookmarkBackupList;
    }
    if (typeof ns.refreshFolderBackupList === 'function') {
        window.refreshFolderBackupList = ns.refreshFolderBackupList;
    }

    const requiredFunctions = [
        'getDataStore',
        'persistRestoredState',
        'remapWorkspaceStateForRestore'
    ];
    const missing = requiredFunctions.filter((name) => typeof ns[name] !== 'function');
    if (missing.length > 0) {
        console.warn('DataTransfer Shared: missing helper modules', missing);
    }

    ns.sharedReady = true;
})();
