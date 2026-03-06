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

    async function bulkDeleteAction() {
        const selected = getSelectedIds();
        if (!(await showConfirm(`Delete ${selected.size}?`))) return;
        replaceLinks(getLinks().filter(link => !selected.has(toBulkId(link.id))));
        toggleBulkModeAction();
        saveData();
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
