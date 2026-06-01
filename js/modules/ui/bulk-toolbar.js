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
    const setLinks = ns.setLinks;
    const toBulkId = ns.toBulkId;
    const clearSelection = ns.clearSelection;
    const toggleSelectedId = ns.toggleSelectedId;
    const addSelectedIds = ns.addSelectedIds;
    const removeSelectedIds = ns.removeSelectedIds;
    const toggleScopeSelection = ns.toggleScopeSelection;
    const applyRangeSelection = ns.applyRangeSelection;
    const setLastToggledId = ns.setLastToggledId;
    const getLastToggledId = ns.getLastToggledId;
    const updateBulkUI = ns.updateBulkUI;
    const openBulkMoveModal = ns.openBulkMoveModal;
    const openBulkTabModal = ns.openBulkTabModal;
    const openBulkMergeModal = ns.openBulkMergeModal;
    const closeBulkMergeModal = ns.closeBulkMergeModal;
    const getBulkMergeMode = ns.getBulkMergeMode;
    const getBulkMergeBaseId = ns.getBulkMergeBaseId;
    const closeAllModals = ns.closeAllModals;
    const attachOverlayDismissHandlers = ns.attachOverlayDismissHandlers;

    function replaceLinks(nextLinks) {
        return setLinks(nextLinks);
    }

    function getSelectedLinkIds() {
        return Array.from(getSelectedIds()).map(toBulkId).filter(Boolean);
    }

    function syncBulkSectionGroup(groupName, activeMode) {
        if (!groupName) return;
        const sections = document.querySelectorAll(`.bulk-move-section[data-bulk-section-group="${groupName}"]`);
        sections.forEach((section) => {
            const isActive = section.getAttribute('data-bulk-section-mode') === String(activeMode);
            section.classList.toggle('is-collapsed', !isActive);
            const toggle = section.querySelector('.bulk-section-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        });
    }

    function toggleBulkSectionAction(buttonOrSection) {
        const section = buttonOrSection?.closest
            ? buttonOrSection.closest('.bulk-move-section')
            : null;
        if (!section) return;
        const isCollapsed = section.classList.toggle('is-collapsed');
        const toggle = section.querySelector('.bulk-section-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }

    function toggleBulkTreeNodeAction(button) {
        const node = button?.closest ? button.closest('.bulk-target-node') : null;
        if (!node) return;
        const children = node.querySelector(':scope > .bulk-target-children');
        if (!children) return;
        const expanding = children.hasAttribute('hidden');
        if (expanding) children.removeAttribute('hidden');
        else children.setAttribute('hidden', '');
        node.classList.toggle('is-expanded', expanding);
        button.setAttribute('aria-expanded', expanding ? 'true' : 'false');
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
        const rangeApplied = !!event?.shiftKey
            && typeof applyRangeSelection === 'function'
            && applyRangeSelection(selectedId, shouldSelect);
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

        if (typeof saveData === 'function') {
            saveData({
                source: 'bulk-done-toggle',
                meta: {
                    kind: 'bulk-done-toggle'
                }
            });
        }
        updateBulkUI();
        showToast(`${nextDoneState ? 'Marked' : 'Cleared'} ${changedCount} bookmark${changedCount === 1 ? '' : 's'}.`, 'success');
    }

    async function bulkDeleteAction() {
        const selected = getSelectedIds();
        if (!(await showConfirm(`Delete ${selected.size}?`))) return;
        replaceLinks(getLinks().filter(link => !selected.has(toBulkId(link.id))));
        toggleBulkModeAction();
        saveData({
            source: 'bulk-delete',
            meta: {
                kind: 'bulk-delete'
            }
        });
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

    const bulkMergeActions = window.EveBulkToolbar.createBulkMergeActions({
        getSelectedLinks,
        removeSelectedIds,
        openBulkMergeModal,
        closeBulkMergeModal,
        getBulkMergeMode,
        getBulkMergeBaseId,
        toggleBulkModeAction
    });
    const { bulkMergeAction, runBulkMerge, confirmBulkMergeAction } = bulkMergeActions;

    function normalizeBulkActionResult(result) {
        if (!result) return null;
        if (result === true) {
            return {
                applied: true,
                source: 'bulk-move',
                movedLinkIds: getSelectedLinkIds(),
                mergedLinkIds: [],
                removedLinkIds: [],
                touchedScopes: []
            };
        }
        if (typeof result === 'object') {
            return Object.assign({
                applied: true,
                source: 'bulk-move',
                movedLinkIds: [],
                mergedLinkIds: [],
                removedLinkIds: [],
                touchedScopes: []
            }, result);
        }
        return null;
    }

    function dispatchBulkMoveResult(detail) {
        if (!detail || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent('eve:bulk-bookmark-move', { detail }));
        window.dispatchEvent(new CustomEvent('eve:state-mutated', {
            detail: {
                source: detail.source || 'bulk-move',
                meta: detail
            }
        }));
    }

    function completeBulkAction(result) {
        const detail = normalizeBulkActionResult(result);
        if (!detail?.applied) return;
        const removedIds = Array.isArray(detail.removedLinkIds) ? detail.removedLinkIds : [];
        if (removedIds.length) removeSelectedIds(removedIds);
        dispatchBulkMoveResult(detail);
        toggleBulkModeAction();
        saveData({
            immediate: true,
            forceRender: true,
            source: detail.source || 'bulk-move',
            meta: {
                kind: 'bulk-move',
                movedLinkIds: detail.movedLinkIds || [],
                mergedLinkIds: detail.mergedLinkIds || [],
                removedLinkIds: detail.removedLinkIds || [],
                touchedScopes: detail.touchedScopes || [],
                target: detail.target || null
            }
        });
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
    window.bulkMerge = bulkMergeAction;
    window.confirmBulkMerge = confirmBulkMergeAction;
    window.setBulkMergeMode = ns.setBulkMergeMode;
    window.closeBulkMergeModal = ns.closeBulkMergeModal;
    window.toggleBulkSection = toggleBulkSectionAction;
    window.toggleBulkTreeNode = toggleBulkTreeNodeAction;
    ns.syncBulkSectionGroup = syncBulkSectionGroup;
    window.setBulkMoveMode = ns.setBulkMoveMode;
    window.renderBulkMoveCategoryOptions = ns.renderBulkMoveCategoryOptions;
    window.closeBulkMoveModal = ns.closeBulkMoveModal;
    window.confirmBulkMove = function () {
        completeBulkAction(ns.confirmBulkMove());
    };
    window.setBulkTabMode = ns.setBulkTabMode;
    window.setBulkTabCardMode = ns.setBulkTabCardMode;
    window.renderBulkTabOptions = ns.renderBulkTabOptions;
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
