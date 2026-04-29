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

        function renderBulkMoveCategoryOptions() {
            const select = document.getElementById('bulk-move-existing-select');
            if (!select) return;
            const names = (() => {
                const visibleNames = getVisibleDashboardCategoryNames();
                if (visibleNames.length > 0) return visibleNames;
                return getAllCategoryNames(getSelectedWorkspaceForMove());
            })();
            const currentCategory = getSelectedCategoryName();
            select.innerHTML = names.map(name => {
                const selected = name === currentCategory ? ' selected' : '';
                const safeName = escapeBulkMoveHtml(name);
                return `<option value="${safeName}"${selected}>${safeName}</option>`;
            }).join('');
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
            renderBulkMoveCategoryOptions();
            setBulkMoveMode('existing');
            const input = document.getElementById('bulk-move-new-input');
            if (input) input.value = '';
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
            selectedLinkIds.forEach((selectedId) => {
                const link = allLinks.find((candidate) => toBulkId(candidate?.id) === selectedId);
                if (!link) return;
                const targetWorkspaceId = String(link.workspace || getSelectedWorkspaceForMove() || '').trim() || 'main';
                if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                    mergeApi.moveOrMergeLinkToScope(link, {
                        workspaceId: targetWorkspaceId,
                        categoryName,
                        folderId: ''
                    }, {
                        source: 'bulk-category-bookmark-move',
                        links: allLinks
                    });
                    return;
                }
                link.category = categoryName;
                window.EveBookmarkFolders?.clearLinkFolderAssignment?.(link);
                if (typeof syncLinked === 'function') {
                    syncLinked(link.id);
                }
            });
            if (typeof deps.setLinks === 'function') deps.setLinks(allLinks);
            return true;
        }

        function confirmBulkMove() {
            const nextCategory = resolveBulkMoveCategory();
            const movedCount = getSelectedIds().size;
            if (!nextCategory) {
                showToast('Enter or select a category.', 'warning');
                return false;
            }

            if (!applyBulkCategoryMove(nextCategory)) {
                showToast('Unable to move bookmarks.', 'error');
                return false;
            }

            closeBulkMoveModal();
            showToast(`Moved ${movedCount} bookmark(s) to "${nextCategory}"`, 'success');
            return true;
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
