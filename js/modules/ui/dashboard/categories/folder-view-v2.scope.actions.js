window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const ns = window.EveFolderViewV2;
    const shared = ns._shared = ns._shared || {};
    if (shared.scopeActionsReady) return;
    if (!shared.scopeLinksReady) {
        console.warn('[EveFolderViewV2] Scope link helpers missing; scope actions not initialized.');
        return;
    }

    const { getTargetFolderNode } = shared;

    ns.openFolderScopedMap = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        if (window.EveConstellationMap?.openFolderMap) {
            if (targetNode.isGhost && window.EveConstellationMap?.openDerivedMap) {
                const linkIds = ns.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
                window.EveConstellationMap.openDerivedMap({
                    workspaceId,
                    categoryName,
                    linkIds,
                    scopeLabel: targetNode.name
                });
                return;
            }
            window.EveConstellationMap.openFolderMap(workspaceId, categoryName, folderId, targetNode.name);
        }
    };

    ns.openFolderBulkTitle = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = ns.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkTitleModal === 'function') {
            window.openBulkTitleModal({
                categoryName,
                linkIds,
                title: `Auto-Title Links :: ${targetNode.name}`,
                hint: 'Only bookmarks inside this folder and its nested subfolders are included.'
            });
        }
    };

    ns.openFolderBulkLibraryAuto = function (categoryName, folderId, workspaceId) {
        const targetNode = getTargetFolderNode(workspaceId, categoryName, folderId);
        if (!targetNode) return;
        const linkIds = ns.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        if (!linkIds.length) {
            if (typeof window.showToast === 'function') window.showToast('No bookmarks in this folder subtree.', 'warning');
            return;
        }
        if (typeof window.openBulkLibraryAutoModal === 'function') {
            window.openBulkLibraryAutoModal({
                categoryName,
                linkIds,
                title: `Auto-Add Library Entries :: ${targetNode.name}`,
                hint: 'Strict mode: sources are accepted only when API title/synonym matches the bookmark title exactly (case-sensitive). Only this folder subtree is included.'
            });
        }
    };

    shared.scopeActionsReady = true;
})();
