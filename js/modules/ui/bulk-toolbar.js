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
    const getLinks = ns.getLinks;
    const toBulkId = ns.toBulkId;
    const clearSelection = ns.clearSelection;
    const toggleSelectedId = ns.toggleSelectedId;
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

    function toggleSelectAction(id, event) {
        if (event?.stopPropagation) event.stopPropagation();
        toggleSelectedId(id);
        updateBulkUI();
    }

    function getSelectedLinkIds() {
        const selected = getSelectedIds();
        return getLinks()
            .filter((link) => selected.has(toBulkId(link?.id)))
            .map((link) => String(link.id));
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

    function completeBulkAction(didApply) {
        if (!didApply) return;
        toggleBulkModeAction();
        saveData();
    }

    window.toggleBulkMode = toggleBulkModeAction;
    window.toggleSelect = toggleSelectAction;
    window.bulkPinSelected = bulkPinSelectedAction;
    window.bulkUnpinSelected = bulkUnpinSelectedAction;
    window.bulkDelete = bulkDeleteAction;
    window.bulkMove = bulkMoveAction;
    window.bulkWorkspace = bulkWorkspaceAction;
    window.setBulkMoveMode = ns.setBulkMoveMode;
    window.closeBulkMoveModal = ns.closeBulkMoveModal;
    window.confirmBulkMove = function () {
        completeBulkAction(ns.confirmBulkMove());
    };
    window.setBulkTabMode = ns.setBulkTabMode;
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
