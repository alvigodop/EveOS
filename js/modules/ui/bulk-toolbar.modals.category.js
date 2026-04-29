// --- BULK TOOLBAR CATEGORY MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
window.EveBulkToolbar.ModalModules = window.EveBulkToolbar.ModalModules || {};

(function () {
    window.EveBulkToolbar.ModalModules.createCategoryModalHelpers = function createCategoryModalHelpers(deps) {
        const getLinks = deps.getLinks;
        const getSelectedIds = deps.getSelectedIds;
        const toBulkId = deps.toBulkId;
        const getAllCategoryNames = deps.getAllCategoryNames;
        const getVisibleDashboardCategoryNames = deps.getVisibleDashboardCategoryNames;
        const escapeBulkMoveHtml = deps.escapeBulkMoveHtml;
        const getSelectedCategoryName = deps.getSelectedCategoryName;
        const getSelectedWorkspaceForMove = deps.getSelectedWorkspaceForMove;
        const addTouchedScope = deps.addTouchedScope || function () {};
        const formatSelectionSummary = deps.formatSelectionSummary || function () { return ''; };

        function renderBulkMoveCategoryOptions() {
            const select = document.getElementById('bulk-move-existing-select');
            if (!select) return;
            const filterText = String(document.getElementById('bulk-move-card-filter')?.value || '').trim().toLowerCase();
            const summary = document.getElementById('bulk-move-selection-summary');
            if (summary) summary.textContent = formatSelectionSummary();
            const allNames = (() => {
                const visibleNames = getVisibleDashboardCategoryNames();
                if (visibleNames.length > 0) return visibleNames;
                return getAllCategoryNames(getSelectedWorkspaceForMove());
            })();
            const names = allNames.filter((name) => !filterText || String(name || '').toLowerCase().includes(filterText));
            const currentCategory = getSelectedCategoryName();
            select.innerHTML = names.length
                ? names.map(name => {
                const selected = name === currentCategory ? ' selected' : '';
                const safeName = escapeBulkMoveHtml(name);
                return `<option value="${safeName}"${selected}>${safeName}</option>`;
            }).join('')
                : '<option value="">No matching cards</option>';
        }

        function setBulkMoveMode(mode) {
            const isNewMode = mode === 'new';
            const select = document.getElementById('bulk-move-existing-select');
            const input = document.getElementById('bulk-move-new-input');
            const existingRadio = document.querySelector('input[name="bulkMoveMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkMoveMode"][value="new"]');

            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (select) select.disabled = isNewMode;
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
        }

        function openBulkMoveModal() {
            const overlay = document.getElementById('bulk-move-modal-overlay');
            if (!overlay) return;
            const input = document.getElementById('bulk-move-new-input');
            if (input) input.value = '';
            const filter = document.getElementById('bulk-move-card-filter');
            if (filter) filter.value = '';
            renderBulkMoveCategoryOptions();
            setBulkMoveMode('existing');
            overlay.style.display = 'flex';
        }

        function closeBulkMoveModal() {
            const overlay = document.getElementById('bulk-move-modal-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        function resolveBulkMoveCategory() {
            const mode = document.querySelector('input[name="bulkMoveMode"]:checked')?.value || 'existing';
            if (mode === 'new') {
                return String(document.getElementById('bulk-move-new-input')?.value || '').trim();
            }
            return String(document.getElementById('bulk-move-existing-select')?.value || '').trim();
        }

        function applyBulkCategoryMove(nextCategory) {
            const categoryName = String(nextCategory || '').trim();
            if (!categoryName) return false;

            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const mergeApi = window.EveBookmarkMerge;
            const allLinks = getLinks();
            const selectedLinkIds = Array.from(getSelectedIds()).map(toBulkId);
            const movedLinkIds = [];
            const mergedLinkIds = [];
            const removedLinkIds = [];
            const touchedScopes = new Map();
            selectedLinkIds.forEach((selectedId) => {
                const link = allLinks.find((candidate) => toBulkId(candidate?.id) === selectedId);
                if (!link) return;
                const targetWorkspaceId = String(link.workspace || getSelectedWorkspaceForMove() || '').trim() || 'main';
                const sourceWorkspaceId = String(link.workspace || 'main').trim() || 'main';
                const sourceCategoryName = String(link.category || 'Unsorted').trim() || 'Unsorted';
                addTouchedScope(touchedScopes, sourceWorkspaceId, sourceCategoryName);
                if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                    const result = mergeApi.moveOrMergeLinkToScope(link, {
                        workspaceId: targetWorkspaceId,
                        categoryName,
                        folderId: ''
                    }, {
                        source: 'bulk-category-bookmark-move',
                        links: allLinks
                    });
                    if (result?.moved || result?.merged) {
                        movedLinkIds.push(String(result.targetId || link.id));
                        if (result.merged) mergedLinkIds.push(String(result.targetId || ''));
                        if (Array.isArray(result.removedIds)) removedLinkIds.push(...result.removedIds.map(String));
                        addTouchedScope(touchedScopes, targetWorkspaceId, categoryName);
                    }
                    return;
                }
                link.category = categoryName;
                window.EveBookmarkFolders?.clearLinkFolderAssignment?.(link);
                if (typeof syncLinked === 'function') {
                    syncLinked(link.id);
                }
                movedLinkIds.push(String(link.id));
                addTouchedScope(touchedScopes, targetWorkspaceId, categoryName);
            });
            if (typeof deps.setLinks === 'function') deps.setLinks(allLinks);
            return {
                applied: movedLinkIds.length > 0 || removedLinkIds.length > 0,
                source: 'bulk-category-bookmark-move',
                movedLinkIds: Array.from(new Set(movedLinkIds)),
                mergedLinkIds: Array.from(new Set(mergedLinkIds.filter(Boolean))),
                removedLinkIds: Array.from(new Set(removedLinkIds)),
                target: { categoryName },
                touchedScopes: Array.from(touchedScopes.values())
            };
        }

        function confirmBulkMove() {
            const nextCategory = resolveBulkMoveCategory();
            const movedCount = getSelectedIds().size;
            if (!nextCategory) {
                showToast('Enter or select a category.', 'warning');
                return false;
            }

            const result = applyBulkCategoryMove(nextCategory);
            if (!result?.applied) {
                showToast('Unable to move bookmarks.', 'error');
                return false;
            }

            closeBulkMoveModal();
            showToast(`Moved ${movedCount} bookmark(s) to "${nextCategory}"`, 'success');
            return result;
        }

        return {
            renderBulkMoveCategoryOptions,
            setBulkMoveMode,
            openBulkMoveModal,
            closeBulkMoveModal,
            confirmBulkMove
        };
    };
})();
