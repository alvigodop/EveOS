window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    window.EveBulkToolbar.createBulkMergeActions = function createBulkMergeActions(deps) {
        const getSelectedLinks = deps.getSelectedLinks;
        const removeSelectedIds = deps.removeSelectedIds;
        const openBulkMergeModal = deps.openBulkMergeModal;
        const closeBulkMergeModal = deps.closeBulkMergeModal;
        const getBulkMergeMode = deps.getBulkMergeMode;
        const getBulkMergeBaseId = deps.getBulkMergeBaseId;
        const toggleBulkModeAction = deps.toggleBulkModeAction;

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
                    baseLink: explicitBase,
                    baseLinkId: explicitBase?.id
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

        return { bulkMergeAction, runBulkMerge, confirmBulkMergeAction };
    };
})();
