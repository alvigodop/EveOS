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
        const getFolderTreeForScope = deps.getFolderTreeForScope || function () { return []; };
        const getBookmarkCountForFolder = deps.getBookmarkCountForFolder || function () { return 0; };

        function buildFolderTreeRowsHtml(folders, workspaceId, categoryName, depth, currentCard, currentFolder) {
            return folders.map((folder) => {
                const folderId = String(folder?.id || '');
                if (!folderId) return '';
                const safeFolderId = escapeBulkMoveHtml(folderId);
                const safeCard = escapeBulkMoveHtml(categoryName);
                const safeName = escapeBulkMoveHtml(folder.name);
                const initial = String(folder.name || '?').trim().charAt(0).toUpperCase() || '?';
                const count = getBookmarkCountForFolder(workspaceId, categoryName, folderId, { recursive: true });
                const isSelected = currentCard === categoryName && currentFolder === folderId;
                const children = Array.isArray(folder.children) ? folder.children : [];
                const hasChildren = children.length > 0;
                const indentStyle = ` style="padding-left:${depth * 18}px"`;

                let html = `<div class="bulk-target-node" data-folder-id="${safeFolderId}" data-depth="${depth}">`;
                html += `<div class="bulk-target-row-wrap"${indentStyle}>`;
                html += `<button type="button" class="bulk-target-row${isSelected ? ' is-selected' : ''}" `;
                html += `role="option" aria-selected="${isSelected}" `;
                html += `data-card="${safeCard}" data-folder-id="${safeFolderId}">`;
                html += `<span class="bulk-target-row-bar" aria-hidden="true"></span>`;
                html += `<span class="bulk-target-row-icon" aria-hidden="true">${escapeBulkMoveHtml(initial)}</span>`;
                html += `<span class="bulk-target-row-body">`;
                html += `<span class="bulk-target-row-title">${safeName}</span>`;
                html += `<span class="bulk-target-row-meta">folder &middot; ${count} bookmark${count === 1 ? '' : 's'}${hasChildren ? ` &middot; ${children.length} subfolder${children.length === 1 ? '' : 's'}` : ''}</span>`;
                html += `</span>`;
                html += `<span class="bulk-target-row-count" aria-hidden="true">${count}</span>`;
                html += `</button>`;
                if (hasChildren) {
                    html += `<button type="button" class="bulk-target-tree-toggle" aria-label="Toggle subfolders" aria-expanded="false" onclick="toggleBulkTreeNode(this)">`;
                    html += `<span class="bulk-section-chevron" aria-hidden="true">&#9662;</span>`;
                    html += `</button>`;
                }
                html += `</div>`;
                if (hasChildren) {
                    html += `<div class="bulk-target-children" hidden>`;
                    html += buildFolderTreeRowsHtml(children, workspaceId, categoryName, depth + 1, currentCard, currentFolder);
                    html += `</div>`;
                }
                html += `</div>`;
                return html;
            }).join('');
        }

        function buildCardNodeHtml(name, workspaceId, currentCard, currentFolder) {
            const safeName = escapeBulkMoveHtml(name);
            const count = getBookmarkCountForCard(name, workspaceId);
            const isSelected = name === currentCard && !currentFolder;
            const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
            const folderTree = getFolderTreeForScope(workspaceId, name) || [];
            const hasChildren = folderTree.length > 0;

            let html = `<div class="bulk-target-node" data-card="${safeName}" data-depth="0">`;
            html += `<div class="bulk-target-row-wrap">`;
            html += `<button type="button" class="bulk-target-row${isSelected ? ' is-selected' : ''}" `;
            html += `role="option" aria-selected="${isSelected}" `;
            html += `data-card="${safeName}" data-folder-id="">`;
            html += `<span class="bulk-target-row-bar" aria-hidden="true"></span>`;
            html += `<span class="bulk-target-row-icon" aria-hidden="true">${escapeBulkMoveHtml(initial)}</span>`;
            html += `<span class="bulk-target-row-body">`;
            html += `<span class="bulk-target-row-title">${safeName}</span>`;
            html += `<span class="bulk-target-row-meta">${count} bookmark${count === 1 ? '' : 's'}${hasChildren ? ` &middot; ${folderTree.length} folder${folderTree.length === 1 ? '' : 's'}` : ''}</span>`;
            html += `</span>`;
            html += `<span class="bulk-target-row-count" aria-hidden="true">${count}</span>`;
            html += `</button>`;
            if (hasChildren) {
                html += `<button type="button" class="bulk-target-tree-toggle" aria-label="Toggle folders" aria-expanded="false" onclick="toggleBulkTreeNode(this)">`;
                html += `<span class="bulk-section-chevron" aria-hidden="true">&#9662;</span>`;
                html += `</button>`;
            }
            html += `</div>`;
            if (hasChildren) {
                html += `<div class="bulk-target-children" hidden>`;
                html += buildFolderTreeRowsHtml(folderTree, workspaceId, name, 1, currentCard, currentFolder);
                html += `</div>`;
            }
            html += `</div>`;
            return html;
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
            const currentCard = String(list.dataset.selectedCard || list.dataset.selected || '').trim();
            const currentFolder = String(list.dataset.selectedFolder || '').trim();
            const fallbackCard = getSelectedCategoryName();
            const preferredCard = names.includes(currentCard)
                ? currentCard
                : names.includes(fallbackCard) ? fallbackCard : (names[0] || '');
            const preferredFolder = preferredCard === currentCard ? currentFolder : '';

            if (!names.length) {
                list.innerHTML = '<div class="bulk-target-empty">No matching cards</div>';
                list.dataset.selected = '';
                list.dataset.selectedCard = '';
                list.dataset.selectedFolder = '';
                return;
            }

            list.innerHTML = names.map((name) => buildCardNodeHtml(name, workspaceId, preferredCard, preferredFolder)).join('');
            list.dataset.selected = preferredCard;
            list.dataset.selectedCard = preferredCard;
            list.dataset.selectedFolder = preferredFolder;
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
                const row = event.target.closest('.bulk-target-row[data-card]');
                if (!row || !list.contains(row)) return;
                event.preventDefault();
                const card = row.getAttribute('data-card') || '';
                const folderId = row.getAttribute('data-folder-id') || '';
                list.dataset.selected = card;
                list.dataset.selectedCard = card;
                list.dataset.selectedFolder = folderId;
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
            if (list) {
                list.dataset.selected = '';
                list.dataset.selectedCard = '';
                list.dataset.selectedFolder = '';
            }
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

        function resolveBulkMoveTarget() {
            const mode = document.querySelector('input[name="bulkMoveMode"]:checked')?.value || 'existing';
            if (mode === 'new') {
                return {
                    categoryName: String(document.getElementById('bulk-move-new-input')?.value || '').trim(),
                    folderId: ''
                };
            }
            const list = document.getElementById('bulk-move-existing-list');
            return {
                categoryName: String(list?.dataset.selectedCard || list?.dataset.selected || '').trim(),
                folderId: String(list?.dataset.selectedFolder || '').trim()
            };
        }

        function applyBulkCategoryMove(target) {
            const next = typeof target === 'string' ? { categoryName: target, folderId: '' } : (target || {});
            const categoryName = String(next.categoryName || '').trim();
            const targetFolderId = String(next.folderId || '').trim();
            if (!categoryName) return false;

            const folderApi = window.EveBookmarkFolders;
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const mergeApi = window.EveBookmarkMerge;
            const allLinks = getLinks();
            const selectedIdSet = getSelectedIds();
            const selectedLinkIds = Array.from(selectedIdSet).map(toBulkId);

            const normWs = (value) => String(value || 'main').trim() || 'main';
            const normCat = (value) => String(value || 'Unsorted').trim() || 'Unsorted';
            const normFolder = (value) => String(value || '').trim();

            // Bookmark moves should not implicitly drag source-card folder trees.
            // Whole-folder moves are handled by folder-specific drag/drop flows.

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

                // If the user picked a target folder explicitly, every link lands there.
                // Otherwise preserve the link's existing folderId only when that folder
                // already exists in the destination card (e.g. it was just transferred).
                let nextFolderId = '';
                if (targetFolderId) {
                    nextFolderId = targetFolderId;
                } else {
                    const existing = normFolder(link.folderId);
                    if (existing && folderApi?.getFolderById) {
                        const folder = folderApi.getFolderById(targetWorkspaceId, categoryName, existing);
                        if (folder) nextFolderId = existing;
                    }
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
                target: { categoryName, folderId: targetFolderId },
                touchedScopes: Array.from(touchedScopes.values())
            };
        }

        function confirmBulkMove() {
            const target = resolveBulkMoveTarget();
            const movedCount = getSelectedIds().size;
            if (!target.categoryName) {
                showToast('Enter or select a card.', 'warning');
                return false;
            }

            const result = applyBulkCategoryMove(target);
            if (!result?.applied) {
                showToast('Unable to move bookmarks.', 'error');
                return false;
            }

            closeBulkMoveModal();
            const folderSuffix = target.folderId ? ' (into a specific folder)' : '';
            showToast(`Moved ${movedCount} bookmark(s) to "${target.categoryName}"${folderSuffix}`, 'success');
            return result;
        }

        return {
            renderBulkMoveCategoryOptions,
            setBulkMoveMode,
            openBulkMoveModal,
            closeBulkMoveModal,
            resolveBulkMoveTarget,
            confirmBulkMove
        };
    };
})();
