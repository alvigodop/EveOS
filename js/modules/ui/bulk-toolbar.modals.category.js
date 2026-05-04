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
        const getBookmarkCountForCard = deps.getBookmarkCountForCard || function () { return 0; };

        function buildCardRowHtml(name, workspaceId, currentCategory) {
            const safeName = escapeBulkMoveHtml(name);
            const count = getBookmarkCountForCard(name, workspaceId);
            const isSelected = name === currentCategory;
            const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
            return (
                `<button type="button" class="bulk-target-row${isSelected ? ' is-selected' : ''}" `
                + `role="option" aria-selected="${isSelected}" data-value="${safeName}">`
                + `<span class="bulk-target-row-bar" aria-hidden="true"></span>`
                + `<span class="bulk-target-row-icon" aria-hidden="true">${escapeBulkMoveHtml(initial)}</span>`
                + `<span class="bulk-target-row-body">`
                + `<span class="bulk-target-row-title">${safeName}</span>`
                + `<span class="bulk-target-row-meta">${count} bookmark${count === 1 ? '' : 's'}</span>`
                + `</span>`
                + `<span class="bulk-target-row-count" aria-hidden="true">${count}</span>`
                + `</button>`
            );
        }

        function renderBulkMoveCategoryOptions() {
            const list = document.getElementById('bulk-move-existing-list');
            if (!list) return;
            const filterText = String(document.getElementById('bulk-move-card-filter')?.value || '').trim().toLowerCase();
            const summary = document.getElementById('bulk-move-selection-summary');
            if (summary) summary.textContent = formatSelectionSummary();
            const allNames = (() => {
                const visibleNames = getVisibleDashboardCategoryNames();
                if (visibleNames.length > 0) return visibleNames;
                return getAllCategoryNames(getSelectedWorkspaceForMove());
            })();
            const names = allNames.filter((name) => !filterText || String(name || '').toLowerCase().includes(filterText));
            const workspaceId = getSelectedWorkspaceForMove();
            const currentSelected = String(list.dataset.selected || '').trim();
            const currentCategory = getSelectedCategoryName();
            const preferredSelection = names.includes(currentSelected)
                ? currentSelected
                : names.includes(currentCategory) ? currentCategory : (names[0] || '');

            if (!names.length) {
                list.innerHTML = '<div class="bulk-target-empty">No matching cards</div>';
                list.dataset.selected = '';
                return;
            }

            list.innerHTML = names.map((name) => buildCardRowHtml(name, workspaceId, preferredSelection)).join('');
            list.dataset.selected = preferredSelection;
        }

        function setBulkMoveMode(mode) {
            const isNewMode = mode === 'new';
            const list = document.getElementById('bulk-move-existing-list');
            const input = document.getElementById('bulk-move-new-input');
            const existingRadio = document.querySelector('input[name="bulkMoveMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkMoveMode"][value="new"]');

            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (list) list.classList.toggle('is-disabled', isNewMode);
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkMoveMode', mode);
        }

        function attachListClickHandler() {
            const list = document.getElementById('bulk-move-existing-list');
            if (!list || list.dataset.bulkClickReady === '1') return;
            list.addEventListener('click', (event) => {
                const row = event.target.closest('.bulk-target-row[data-value]');
                if (!row || !list.contains(row)) return;
                event.preventDefault();
                const value = row.getAttribute('data-value') || '';
                list.dataset.selected = value;
                Array.from(list.querySelectorAll('.bulk-target-row')).forEach((node) => {
                    const matches = node === row;
                    node.classList.toggle('is-selected', matches);
                    node.setAttribute('aria-selected', matches ? 'true' : 'false');
                });
            });
            list.dataset.bulkClickReady = '1';
        }

        function openBulkMoveModal() {
            const overlay = document.getElementById('bulk-move-modal-overlay');
            if (!overlay) return;
            const input = document.getElementById('bulk-move-new-input');
            if (input) input.value = '';
            const filter = document.getElementById('bulk-move-card-filter');
            if (filter) filter.value = '';
            const list = document.getElementById('bulk-move-existing-list');
            if (list) list.dataset.selected = '';
            renderBulkMoveCategoryOptions();
            attachListClickHandler();
            setBulkMoveMode('existing');
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkMoveMode', 'existing');
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
            return String(document.getElementById('bulk-move-existing-list')?.dataset.selected || '').trim();
        }

        function applyBulkCategoryMove(nextCategory) {
            const categoryName = String(nextCategory || '').trim();
            if (!categoryName) return false;

            const folderApi = window.EveBookmarkFolders;
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const mergeApi = window.EveBookmarkMerge;
            const allLinks = getLinks();
            const selectedIdSet = getSelectedIds();
            const selectedLinkIds = Array.from(selectedIdSet).map(toBulkId);
            const selectedLinks = allLinks.filter((link) => selectedIdSet.has(toBulkId(link?.id)));

            const normWs = (value) => String(value || 'main').trim() || 'main';
            const normCat = (value) => String(value || 'Unsorted').trim() || 'Unsorted';
            const normFolder = (value) => String(value || '').trim();

            // 1) Per source scope, transfer folders that are fully covered by the selection.
            //    transferFolderToCategory moves the folder + descendants + their links atomically,
            //    so the per-link loop below will see them as already-at-target and skip.
            const sourceScopes = new Map();
            selectedLinks.forEach((link) => {
                const sWs = normWs(link.workspace);
                const sCat = normCat(link.category);
                sourceScopes.set(sWs + '::' + sCat, { workspaceId: sWs, categoryName: sCat });
            });

            sourceScopes.forEach((scope) => {
                const sWs = scope.workspaceId;
                const sCat = scope.categoryName;
                const tWs = sWs; // card-move keeps the workspace
                const tCat = categoryName;
                if (sWs === tWs && sCat === tCat) return;
                if (typeof folderApi?.transferFolderToCategory !== 'function') return;

                const folderIdsInSelection = new Set();
                selectedLinks.forEach((link) => {
                    if (normWs(link.workspace) !== sWs || normCat(link.category) !== sCat) return;
                    const fid = normFolder(link.folderId);
                    if (fid) folderIdsInSelection.add(fid);
                });
                if (!folderIdsInSelection.size) return;

                folderIdsInSelection.forEach((fid) => {
                    const allInFolder = allLinks.filter((link) => (
                        normWs(link.workspace) === sWs
                        && normCat(link.category) === sCat
                        && normFolder(link.folderId) === fid
                    ));
                    if (!allInFolder.length) return;
                    const allCovered = allInFolder.every((link) => selectedIdSet.has(toBulkId(link.id)));
                    if (!allCovered) return;
                    folderApi.transferFolderToCategory(fid, sWs, sCat, tWs, tCat, '');
                });
            });

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

                // Preserve folderId if a folder with the same id exists in the destination
                // (e.g. it just got transferred above). Otherwise drop it so links land at root.
                let nextFolderId = normFolder(link.folderId);
                if (nextFolderId && folderApi?.getFolderById) {
                    const folder = folderApi.getFolderById(targetWorkspaceId, categoryName, nextFolderId);
                    if (!folder) nextFolderId = '';
                }

                if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                    const result = mergeApi.moveOrMergeLinkToScope(link, {
                        workspaceId: targetWorkspaceId,
                        categoryName,
                        folderId: nextFolderId
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
                if (nextFolderId) link.folderId = nextFolderId;
                else folderApi?.clearLinkFolderAssignment?.(link);
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
