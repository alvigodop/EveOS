// --- BULK TOOLBAR ACTIONS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.actionsReady) return;
    if (!ns.sharedReady || !ns.templatesReady || !ns.modalsReady) {
        console.warn('[BulkToolbar] Shared state, templates, or modal helpers missing; actions not initialized.');
        return;
    }

    const initBulkToolbar = ns.initBulkToolbar;
    const getBulkMode = ns.getBulkMode;
    const setBulkMode = ns.setBulkMode;
    const getSelectedIds = ns.getSelectedIds;
    const getSelectedLinks = ns.getSelectedLinks;
    const getLinks = ns.getLinks;
    const toBulkId = ns.toBulkId;
    const clearSelection = ns.clearSelection;
    const toggleSelectedId = ns.toggleSelectedId;
    const addSelectedIds = ns.addSelectedIds;
    const removeSelectedIds = ns.removeSelectedIds;
    const toggleScopeSelection = ns.toggleScopeSelection;
    const setLastToggledId = ns.setLastToggledId;
    const getLastToggledId = ns.getLastToggledId;
    const updateBulkUI = ns.updateBulkUI;
    const openBulkMoveModal = ns.openBulkMoveModal;
    const openBulkTabModal = ns.openBulkTabModal;
    const closeAllModals = ns.closeAllModals;
    const attachOverlayDismissHandlers = ns.attachOverlayDismissHandlers;

    function replaceLinks(nextLinks) {
        if (window.eveState?.links) window.eveState.links = nextLinks;
        if (typeof links !== 'undefined') {
            links = nextLinks;
        }
    }

    function toggleBulkModeAction() {
        const nextMode = !getBulkMode();
        setBulkMode(nextMode);
        clearSelection();
        document.body.classList.toggle('bulk-active', nextMode);
        if (!nextMode) {
            closeAllModals();
        }
        updateBulkUI();
    }

    function toggleSelectAction(checkboxOrId, idOrEvent, maybeEvent) {
        const checkbox = checkboxOrId instanceof HTMLInputElement ? checkboxOrId : null;
        const id = checkbox ? idOrEvent : checkboxOrId;
        const event = checkbox ? maybeEvent : idOrEvent;
        const selectedId = toBulkId(id);
        if (event?.stopPropagation) event.stopPropagation();
        if (!selectedId) return;

        const shouldSelect = checkbox ? !!checkbox.checked : !getSelectedIds().has(selectedId);
        const rangeApplied = !!event?.shiftKey && applyRangeSelection(selectedId, shouldSelect);
        if (!rangeApplied) {
            if (shouldSelect) addSelectedIds([selectedId]);
            else removeSelectedIds([selectedId]);
        }
        setLastToggledId(selectedId);
        updateBulkUI();
    }

    function toggleCardScopeSelection(categoryName, workspaceId) {
        const linkIds = ns.getScopeLinkIdsForCard ? ns.getScopeLinkIdsForCard(categoryName, workspaceId) : [];
        if (!linkIds.length) {
            showToast('No bookmarks found in this card.', 'info');
            return;
        }
        toggleScopeSelection(linkIds);
        updateBulkUI();
    }

    function toggleFolderScopeSelection(categoryName, workspaceId, folderId) {
        const linkIds = ns.getScopeLinkIdsForFolder ? ns.getScopeLinkIdsForFolder(categoryName, workspaceId, folderId) : [];
        if (!linkIds.length) {
            showToast(folderId ? 'No bookmarks found in this folder subtree.' : 'No root bookmarks found in this card.', 'info');
            return;
        }
        toggleScopeSelection(linkIds);
        updateBulkUI();
    }

    function applyBulkDoneState(nextDoneState) {
        const selectedLinks = getSelectedLinks();
        if (!selectedLinks.length) {
            showToast('Select at least one bookmark first.', 'warning');
            return;
        }

        const eligibleLinks = selectedLinks.filter((link) => {
            if (typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function') {
                return !!window.EveBookmarkFolders.isTaskEnabledForLink(link);
            }
            return true;
        });

        if (!eligibleLinks.length) {
            showToast('No selected task bookmarks found.', 'warning');
            return;
        }

        let changedCount = 0;
        eligibleLinks.forEach((link) => {
            if (!!link.done === !!nextDoneState) return;
            link.done = !!nextDoneState;
            changedCount += 1;
        });

        if (!changedCount) {
            showToast(nextDoneState ? 'Selected bookmarks are already done.' : 'Selected bookmarks are already undone.', 'info');
            return;
        }

        if (typeof saveData === 'function') saveData();
        updateBulkUI();
        showToast(`${nextDoneState ? 'Marked' : 'Cleared'} ${changedCount} bookmark${changedCount === 1 ? '' : 's'}.`, 'success');
    }

    async function bulkDeleteAction() {
        const selected = getSelectedIds();
        if (!(await showConfirm(`Delete ${selected.size}?`))) return;
        replaceLinks(getLinks().filter(link => !selected.has(toBulkId(link.id))));
        toggleBulkModeAction();
        saveData();
    }

    function bulkPinSelectedAction() {
        const selectedLinkIds = getSelectedLinkIds();
        if (!selectedLinkIds.length) {
            showToast('Select at least one bookmark first.', 'warning');
            return;
        }
        const pinApi = window.EveQuickPins;
        if (!pinApi?.bulkPinBookmarks) {
            showToast('Pinning is not available yet.', 'warning');
            return;
        }
        pinApi.bulkPinBookmarks(selectedLinkIds);
        showToast(`Pinned ${selectedLinkIds.length} selected bookmark${selectedLinkIds.length === 1 ? '' : 's'}.`, 'success');
    }

    function bulkUnpinSelectedAction() {
        const selectedLinkIds = getSelectedLinkIds();
        if (!selectedLinkIds.length) {
            showToast('Select at least one bookmark first.', 'warning');
            return;
        }
        const pinApi = window.EveQuickPins;
        if (!pinApi?.bulkUnpinBookmarks) {
            showToast('Pinning is not available yet.', 'warning');
            return;
        }
        pinApi.bulkUnpinBookmarks(selectedLinkIds);
        showToast(`Unpinned ${selectedLinkIds.length} selected bookmark${selectedLinkIds.length === 1 ? '' : 's'}.`, 'success');
    }

    async function bulkMoveAction() {
        if (getSelectedIds().size === 0) {
            showToast('Select at least one bookmark first.', 'warning');
            return;
        }
        openBulkMoveModal();
    }

    async function bulkWorkspaceAction() {
        if (getSelectedIds().size === 0) {
            showToast('Select at least one bookmark first.', 'warning');
            return;
        }
        openBulkTabModal();
    }

    function bulkMarkDoneAction() {
        applyBulkDoneState(true);
    }

    function bulkMarkUndoneAction() {
        applyBulkDoneState(false);
    }

    function completeBulkAction(didApply) {
        if (!didApply) return;
        toggleBulkModeAction();
        saveData();
    }

    window.toggleBulkMode = toggleBulkModeAction;
    window.toggleSelect = toggleSelectAction;
    window.bulkToggleCardScopeSelection = toggleCardScopeSelection;
    window.bulkToggleFolderScopeSelection = toggleFolderScopeSelection;
    window.bulkPinSelected = bulkPinSelectedAction;
    window.bulkUnpinSelected = bulkUnpinSelectedAction;
    window.bulkMarkDone = bulkMarkDoneAction;
    window.bulkMarkUndone = bulkMarkUndoneAction;
    window.bulkDelete = bulkDeleteAction;
    window.bulkMove = bulkMoveAction;
    window.bulkWorkspace = bulkWorkspaceAction;
    window.setBulkMoveMode = ns.setBulkMoveMode;
    window.closeBulkMoveModal = ns.closeBulkMoveModal;
    window.confirmBulkMove = function () {
        completeBulkAction(ns.confirmBulkMove());
    };
    window.setBulkTabMode = ns.setBulkTabMode;
    window.setBulkTabCardMode = ns.setBulkTabCardMode;
    window.renderBulkTabCardOptions = ns.renderBulkTabCardOptions;
    window.closeBulkTabModal = ns.closeBulkTabModal;
    window.confirmBulkTabMove = function () {
        completeBulkAction(ns.confirmBulkTabMove());
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBulkToolbar, { once: true });
    } else {
        initBulkToolbar();
    }
    attachOverlayDismissHandlers();

    ns.actionsReady = true;
})();
