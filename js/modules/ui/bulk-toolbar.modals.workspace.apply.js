window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    window.EveBulkToolbar.createWorkspaceMoveApplier = function createWorkspaceMoveApplier(deps) {
        const getLinks = deps.getLinks;
        const setLinks = deps.setLinks;
        const getSelectedIds = deps.getSelectedIds;
        const toBulkId = deps.toBulkId;
        const addTouchedScope = deps.addTouchedScope;

        function applyBulkWorkspaceMove(workspaceId, categoryName, folderIdArg) {
            const targetWorkspaceId = String(workspaceId || '').trim() || 'main';
            const targetCategoryName = String(categoryName || '').trim() || 'Unsorted';
            const targetFolderId = String(folderIdArg || '').trim();
            if (!targetWorkspaceId || !targetCategoryName) return false;

            const allLinks = getLinks();
            const selectedLinks = allLinks.filter(link => getSelectedIds().has(toBulkId(link.id)));
            if (selectedLinks.length === 0) return false;

            // 1) Identify source scopes.
            const sourceScopes = new Map();
            selectedLinks.forEach(link => {
                const scope = {
                    workspaceId: String(link.workspace || 'main').trim() || 'main',
                    categoryName: String(link.category || 'Unsorted').trim() || 'Unsorted'
                };
                sourceScopes.set(scope.workspaceId + '::' + scope.categoryName, scope);
            });

            const folderApi = window.EveBookmarkFolders;
            sourceScopes.forEach(scope => {
                const sWs = scope.workspaceId;
                const sCat = scope.categoryName;

                // Check if we are moving the "whole card"
                const allLinksInSource = allLinks.filter(l => l.workspace === sWs && (l.category || 'Unsorted') === sCat);
                const selectedLinksInSource = selectedLinks.filter(l => l.workspace === sWs && (l.category || 'Unsorted') === sCat);
                const isWholeCardMove = allLinksInSource.length > 0 && selectedLinksInSource.length === allLinksInSource.length;

                if (isWholeCardMove && typeof folderApi?.transferCategoryFolders === 'function') {
                    // Whole-card moves carry folder structure; partial bookmark moves must not.
                    if (!targetFolderId) {
                        folderApi.transferCategoryFolders(sWs, sCat, targetWorkspaceId, targetCategoryName, {
                            mergeOnly: false
                        });
                    }
                }
            });

            // 2) Update links
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const mergeApi = window.EveBookmarkMerge;
            const movedLinkIds = [];
            const mergedLinkIds = [];
            const removedLinkIds = [];
            const touchedScopes = new Map();
            selectedLinks.forEach(selectedLink => {
                const link = allLinks.find(candidate => String(candidate?.id) === String(selectedLink.id));
                if (!link) return;
                addTouchedScope(touchedScopes, link.workspace, link.category);

                let nextFolderId = '';
                if (targetFolderId) {
                    nextFolderId = targetFolderId;
                } else {
                    nextFolderId = String(link.folderId || '').trim();
                    if (nextFolderId && folderApi) {
                        const folder = folderApi.getFolderById(targetWorkspaceId, targetCategoryName, nextFolderId);
                        if (!folder) nextFolderId = '';
                    }
                }

                if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                    const result = mergeApi.moveOrMergeLinkToScope(link, {
                        workspaceId: targetWorkspaceId,
                        categoryName: targetCategoryName,
                        folderId: nextFolderId
                    }, {
                        source: 'bulk-workspace-bookmark-move',
                        links: allLinks
                    });
                    if (result?.moved || result?.merged) {
                        movedLinkIds.push(String(result.targetId || link.id));
                        if (result.merged) mergedLinkIds.push(String(result.targetId || ''));
                        if (Array.isArray(result.removedIds)) removedLinkIds.push(...result.removedIds.map(String));
                        addTouchedScope(touchedScopes, targetWorkspaceId, targetCategoryName);
                    }
                    return;
                }

                link.workspace = targetWorkspaceId;
                link.category = targetCategoryName;

                if (nextFolderId) link.folderId = nextFolderId;
                else if (folderApi) folderApi.clearLinkFolderAssignment(link);

                if (typeof syncLinked === 'function') syncLinked(link.id);
                movedLinkIds.push(String(link.id));
                addTouchedScope(touchedScopes, targetWorkspaceId, targetCategoryName);
            });

            setLinks(allLinks);
            return {
                applied: movedLinkIds.length > 0 || removedLinkIds.length > 0,
                source: 'bulk-workspace-bookmark-move',
                movedLinkIds: Array.from(new Set(movedLinkIds)),
                mergedLinkIds: Array.from(new Set(mergedLinkIds.filter(Boolean))),
                removedLinkIds: Array.from(new Set(removedLinkIds)),
                target: {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    folderId: targetFolderId
                },
                touchedScopes: Array.from(touchedScopes.values())
            };

        }

        return applyBulkWorkspaceMove;
    };
})();
