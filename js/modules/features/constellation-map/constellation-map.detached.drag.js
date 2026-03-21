window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const detached = ns._detached = ns._detached || {};
    const text = detached.text || (ns._shared || {}).text;

    function handleDetachedLinkDragStart(event, entryId, linkId) {
        if (!event?.dataTransfer) return;
        event.stopPropagation();
        const payload = JSON.stringify({
            type: 'detached-link',
            entryId: text(entryId, ''),
            linkId: text(linkId, '')
        });
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (event.target?.classList) event.target.classList.add('is-dragging');
        }, 0);
    }

    function handleDetachedFolderDragStart(event, entryId, folderId) {
        if (!event?.dataTransfer) return;
        event.stopPropagation();
        const payload = JSON.stringify({
            type: 'detached-folder',
            entryId: text(entryId, ''),
            folderId: text(folderId, ''),
            detachedRoot: true
        });
        event.dataTransfer.setData('application/json', payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (event.target?.classList) event.target.classList.add('is-dragging');
        }, 0);
    }

    function handleDashboardParkingDrop(event, workspaceId) {
        detached.stopDropEvent(event);
        const payload = detached.getDragPayload(event?.dataTransfer);
        if (!payload) return false;

        let result = null;
        if (Array.isArray(payload?.ids) && payload.ids.length) {
            const parked = detached.parkLinksByIds(payload.ids);
            result = parked.length ? { message: parked.length > 1 ? ('Moved ' + parked.length + ' bookmarks into detached parking.') : 'Bookmark moved into detached parking.' } : null;
        } else if (payload?.type === 'folder' && payload.id) {
            const entry = detached.parkFolderSubtree(payload.sourceWorkspace, payload.sourceCategory, payload.id);
            result = entry ? { message: 'Folder chain moved into detached parking.' } : null;
        } else if (payload?.type === 'detached-link' && payload.entryId && payload.linkId) {
            result = detached.moveDetachedLinksToParking(payload.entryId, [payload.linkId]);
        }

        if (!result) return false;
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.showToast === 'function' && result.message) window.showToast(result.message, 'success');
        return true;
    }

    function handleDashboardDetachedFolderDrop(event, targetEntryId, targetFolderId) {
        detached.stopDropEvent(event);
        const payload = detached.getDragPayload(event?.dataTransfer);
        if (!payload) return false;

        let result = null;
        if (Array.isArray(payload?.ids) && payload.ids.length) {
            result = detached.attachLiveLinksToEntry(targetEntryId, payload.ids, targetFolderId);
        } else if (payload?.type === 'folder' && payload.id) {
            result = detached.attachLiveFolderToEntry(
                targetEntryId,
                payload.sourceWorkspace,
                payload.sourceCategory,
                payload.id,
                targetFolderId
            );
        } else if (payload?.type === 'detached-link' && payload.entryId && payload.linkId) {
            result = detached.moveDetachedLinksToEntry(payload.entryId, [payload.linkId], targetEntryId, targetFolderId);
        }

        if (!result) return false;
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.showToast === 'function' && result.message) window.showToast(result.message, 'success');
        return true;
    }

    Object.assign(detached, {
        handleDetachedLinkDragStart,
        handleDetachedFolderDragStart,
        handleDashboardParkingDrop,
        handleDashboardDetachedFolderDrop
    });
})(window.EveConstellationMap);
