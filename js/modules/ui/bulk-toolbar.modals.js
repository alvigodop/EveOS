// --- BULK TOOLBAR MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
window.EveBulkToolbar.ModalModules = window.EveBulkToolbar.ModalModules || {};

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.modalsReady) return;
    if (!ns.sharedReady || !ns.templatesReady) {
        console.warn('[BulkToolbar] Shared state or templates missing; modal helpers not initialized.');
        return;
    }

    const deps = {
        getLinks: ns.getLinks,
        setLinks: ns.setLinks,
        getConfig: ns.getConfig,
        getSelectedIds: ns.getSelectedIds,
        getSelectedLinks: ns.getSelectedLinks,
        toBulkId: ns.toBulkId,
        getAllCategoryNames: ns.getAllCategoryNames,
        getVisibleDashboardCategoryNames: ns.getVisibleDashboardCategoryNames,
        escapeBulkMoveHtml: ns.escapeBulkMoveHtml,
        getSelectedCategoryName: ns.getSelectedCategoryName,
        getSelectedWorkspaceForMove: ns.getSelectedWorkspaceForMove,
        getWorkspaceList: ns.getWorkspaceList,
        getWorkspaceTree: ns.getWorkspaceTree,
        getSelectedWorkspaceId: ns.getSelectedWorkspaceId,
        addTouchedScope: ns.addTouchedScope,
        formatSelectionSummary: ns.formatSelectionSummary,
        getBookmarkCountForCard: ns.getBookmarkCountForCard,
        getBookmarkCountForWorkspace: ns.getBookmarkCountForWorkspace
    };

    const modules = window.EveBulkToolbar.ModalModules || {};
    const categoryHelpers = typeof modules.createCategoryModalHelpers === 'function'
        ? modules.createCategoryModalHelpers(deps)
        : {};
    const workspaceHelpers = typeof modules.createWorkspaceModalHelpers === 'function'
        ? modules.createWorkspaceModalHelpers(deps)
        : {};
    const mergeHelpers = typeof modules.createMergeModalHelpers === 'function'
        ? modules.createMergeModalHelpers(deps)
        : {};

    let overlayDismissReady = false;

    function closeAllModals() {
        categoryHelpers.closeBulkMoveModal?.();
        workspaceHelpers.closeBulkTabModal?.();
        mergeHelpers.closeBulkMergeModal?.();
    }

    function attachOverlayDismissHandlers() {
        if (overlayDismissReady) return;
        document.addEventListener('mousedown', (event) => {
            const moveOverlay = document.getElementById('bulk-move-modal-overlay');
            if (moveOverlay && moveOverlay.style.display === 'flex' && event.target === moveOverlay) {
                categoryHelpers.closeBulkMoveModal?.();
                return;
            }

            const tabOverlay = document.getElementById('bulk-tab-modal-overlay');
            if (tabOverlay && tabOverlay.style.display === 'flex' && event.target === tabOverlay) {
                workspaceHelpers.closeBulkTabModal?.();
                return;
            }

            const mergeOverlay = document.getElementById('bulk-merge-modal-overlay');
            if (mergeOverlay && mergeOverlay.style.display === 'flex' && event.target === mergeOverlay) {
                mergeHelpers.closeBulkMergeModal?.();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            categoryHelpers.closeBulkMoveModal?.();
            workspaceHelpers.closeBulkTabModal?.();
            mergeHelpers.closeBulkMergeModal?.();
        });
        overlayDismissReady = true;
    }

    Object.assign(ns, categoryHelpers, workspaceHelpers, mergeHelpers, {
        closeAllModals,
        attachOverlayDismissHandlers
    });
    ns.modalsReady = true;
})();
