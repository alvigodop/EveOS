window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    window.EveFolderViewV2.handleFolderDragStart = function (event, folderId, categoryName, workspaceId) {
        if (!event?.dataTransfer) return;
        event.stopPropagation();
        event.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'folder',
            id: folderId,
            sourceCategory: categoryName,
            sourceWorkspace: workspaceId
        }));
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (event.target?.classList) event.target.classList.add('is-dragging');
        }, 0);
    };

    window.EveFolderViewV2.handleFolderDrop = function (event, categoryName, targetFolderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const rawData = event?.dataTransfer?.getData('text/plain') || event?.dataTransfer?.getData('application/json');
        if (!rawData) return;

        let payload = null;
        try {
            payload = JSON.parse(rawData);
        } catch (e) {
            payload = null;
        }

        if (payload && payload.type === 'folder' && payload.id) {
            const folderIdToMove = payload.id;
            if (folderIdToMove === targetFolderId) return;

            const folderApi = window.EveBookmarkFolders;
            if (!folderApi) return;

            const isCrossCard = (payload.sourceWorkspace && payload.sourceWorkspace !== workspaceId)
                || (payload.sourceCategory && payload.sourceCategory !== categoryName);

            if (isCrossCard && folderApi.transferFolderToCategory) {
                if (!payload.sourceWorkspace || !payload.sourceCategory) {
                    console.warn('[EveFolderViewV2] Cross-card transfer aborted: Missing source metadata.', payload);
                    return;
                }
                folderApi.transferFolderToCategory(
                    folderIdToMove,
                    payload.sourceWorkspace,
                    payload.sourceCategory,
                    workspaceId,
                    categoryName,
                    targetFolderId || ''
                );
            } else if (folderApi.moveFolder) {
                folderApi.moveFolder(workspaceId, categoryName, folderIdToMove, targetFolderId || '');
            }

            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        if (typeof window.moveBookmarksToFolderDrop === 'function') {
            window.moveBookmarksToFolderDrop(event, categoryName, targetFolderId, workspaceId);
        }
    };
})();
