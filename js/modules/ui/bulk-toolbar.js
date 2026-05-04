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

    function bulkMergeAction() {
        const selectedLinks = getSelectedLinks();
        if (selectedLinks.length < 2) {
            showToast('Select at least two bookmarks to merge.', 'warning');
            return;
        }
        if (!window.EveBookmarkMerge || typeof window.EveBookmarkMerge.mergeDuplicateGroup !== 'function') {
            showToast('Merge feature is not available yet.', 'warning');
            return;
        }
        if (typeof openBulkMergeModal === 'function') {
            openBulkMergeModal();
        } else {
            // Fallback: title-mode merge without picker
            runBulkMerge('title', '');
        }
    }

    function runBulkMerge(mode, baseLinkId) {
        const selectedLinks = getSelectedLinks();
        if (selectedLinks.length < 2) {
            showToast('Select at least two bookmarks to merge.', 'warning');
            return false;
        }

        const mergeApi = window.EveBookmarkMerge;
        const sensorApi = window.EveDuplicateSensor;
        if (!mergeApi || typeof mergeApi.mergeDuplicateGroup !== 'function') {
            showToast('Merge feature is not available yet.', 'warning');
            return false;
        }

        const normalizeTitle = typeof mergeApi.normalizeTitle === 'function'
            ? mergeApi.normalizeTitle
            : (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

        let mergeGroups;
        let baseLinkById = null;

        if (mode === 'all') {
            const allIds = selectedLinks.map((link) => String(link?.id || '')).filter(Boolean);
            if (allIds.length < 2) {
                showToast('Need at least two bookmarks with valid IDs.', 'warning');
                return false;
            }
            const explicitBase = selectedLinks.find((link) => String(link?.id) === String(baseLinkId)) || selectedLinks[0];
            mergeGroups = [allIds];
            baseLinkById = { [String(explicitBase.id)]: explicitBase };
        } else {
            const groups = new Map();
            selectedLinks.forEach((link) => {
                const key = normalizeTitle(link?.title);
                if (!key) return;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(String(link.id));
            });
            mergeGroups = Array.from(groups.values()).filter((ids) => ids.length >= 2);
            if (!mergeGroups.length) {
                showToast('No selected bookmarks share the same title. Try the "merge all as one" option.', 'info');
                return false;
            }
        }

        let totalMerged = 0;
        let totalRemoved = 0;
        const allRemovedIds = [];
        const allMergedIds = [];

        const sensorRunner = sensorApi && typeof sensorApi.mergeDuplicateGroup === 'function'
            ? sensorApi.mergeDuplicateGroup
            : null;

        mergeGroups.forEach((linkIds) => {
            const explicitBase = baseLinkById ? baseLinkById[linkIds[0]] || baseLinkById[Object.keys(baseLinkById)[0]] : null;
            let result = null;
            if (explicitBase) {
                // Explicit base: go through EveBookmarkMerge directly so we can pass baseLink.
                result = mergeApi.mergeDuplicateGroup(linkIds, {
                    source: 'bulk-bookmark-merge',
                    reason: 'Manual bulk merge with explicit base from Select toolbar.',
                    baseLink: explicitBase
                });
                if (result?.removedIds?.length && sensorApi?._runtime?.mergeDuplicateGroup) {
                    // Trigger the sensor's writeStore + re-render path without re-merging.
                    if (typeof window.renderSidebar === 'function') window.renderSidebar();
                    if (typeof window.renderDashboard === 'function') window.renderDashboard();
                }
            } else if (sensorRunner) {
                result = sensorRunner(linkIds);
            } else {
                result = mergeApi.mergeDuplicateGroup(linkIds, {
                    source: 'bulk-bookmark-merge',
                    reason: 'Manual bulk merge from Select toolbar.'
                });
            }
            if (!result) return;
            const removed = Array.isArray(result.removedIds) ? result.removedIds : [];
            if (result.mergedId) allMergedIds.push(String(result.mergedId));
            if (removed.length) {
                totalMerged += 1;
                totalRemoved += removed.length;
                removed.forEach((id) => allRemovedIds.push(String(id)));
            }
        });

        if (!totalRemoved) {
            showToast('No bookmarks were merged.', 'info');
            return false;
        }

        if (allRemovedIds.length) removeSelectedIds(allRemovedIds);

        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('eve:bulk-bookmark-merge', {
                detail: {
                    source: 'bulk-bookmark-merge',
                    mode,
                    mergedIds: Array.from(new Set(allMergedIds)),
                    removedIds: Array.from(new Set(allRemovedIds))
                }
            }));
            window.dispatchEvent(new CustomEvent('eve:state-mutated', {
                detail: {
                    source: 'bulk-bookmark-merge',
                    meta: {
                        kind: 'bulk-bookmark-merge',
                        mode,
                        mergedIds: Array.from(new Set(allMergedIds)),
                        removedIds: Array.from(new Set(allRemovedIds))
                    }
                }
            }));
        }

        if (typeof closeBulkMergeModal === 'function') closeBulkMergeModal();
        toggleBulkModeAction();
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: true,
                source: 'bulk-bookmark-merge',
                meta: {
                    kind: 'bulk-bookmark-merge',
                    mode,
                    mergedIds: Array.from(new Set(allMergedIds)),
                    removedIds: Array.from(new Set(allRemovedIds))
                }
            });
        }
        const summary = mode === 'all'
            ? `Merged ${totalRemoved + 1} bookmarks into one (${totalRemoved} duplicate${totalRemoved === 1 ? '' : 's'} removed).`
            : `Merged ${totalMerged} group${totalMerged === 1 ? '' : 's'} (${totalRemoved} duplicate${totalRemoved === 1 ? '' : 's'} removed).`;
        showToast(summary, 'success');
        return true;
    }

    function confirmBulkMergeAction() {
        const mode = typeof getBulkMergeMode === 'function' ? getBulkMergeMode() : 'title';
        const baseId = mode === 'all' && typeof getBulkMergeBaseId === 'function' ? getBulkMergeBaseId() : '';
        if (mode === 'all' && !baseId) {
            showToast('Pick which bookmark should be the main one.', 'warning');
            return;
        }
        runBulkMerge(mode, baseId);
    }

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
