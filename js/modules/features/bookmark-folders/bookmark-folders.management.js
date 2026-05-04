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
        transferCategoryFolders,
        removeFolderNodesById,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryScope,
        renameCategoryEverywhere,
        deleteCategoryScope,
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
        transferCategoryFolders,
        removeFolderNodesById,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryScope,
        renameCategoryEverywhere,
        deleteCategoryScope,
        deleteCategoryEverywhere,
        moveWorkspaceTrees,
        moveLinksToFolderTarget
    });
})(window.EveBookmarkFolders);
