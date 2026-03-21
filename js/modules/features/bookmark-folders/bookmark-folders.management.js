window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management || {};
    const {
        getFolderById,
        buildFolderPathLabel,
        isToolbarExpanded,
        setToolbarExpanded,
        toggleToolbarExpanded,
        getFolderOptions,
        populateFolderSelect,
        refreshEditorFolderSelect,
        createFolder,
        renameFolder,
        moveFolder,
        transferFolderToCategory,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryEverywhere,
        deleteCategoryEverywhere,
        moveWorkspaceTrees,
        moveLinksToFolderTarget
    } = api;

    Object.assign(ns, {
        getFolderById,
        buildFolderPathLabel,
        isToolbarExpanded,
        setToolbarExpanded,
        toggleToolbarExpanded,
        getFolderOptions,
        populateFolderSelect,
        refreshEditorFolderSelect,
        createFolder,
        renameFolder,
        moveFolder,
        transferFolderToCategory,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryEverywhere,
        deleteCategoryEverywhere,
        moveWorkspaceTrees,
        moveLinksToFolderTarget
    });
})(window.EveBookmarkFolders);
