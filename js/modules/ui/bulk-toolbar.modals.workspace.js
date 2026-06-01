// --- BULK TOOLBAR WORKSPACE MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
window.EveBulkToolbar.ModalModules = window.EveBulkToolbar.ModalModules || {};
(function () {
    window.EveBulkToolbar.ModalModules.createWorkspaceModalHelpers = function createWorkspaceModalHelpers(deps) {
        const getLinks = deps.getLinks;
        const setLinks = deps.setLinks;
        const getConfig = deps.getConfig;
        const getSelectedIds = deps.getSelectedIds;
        const toBulkId = deps.toBulkId;
        const escapeBulkMoveHtml = deps.escapeBulkMoveHtml;
        const getAllCategoryNames = deps.getAllCategoryNames;
        const getSelectedCategoryName = deps.getSelectedCategoryName;
        const getWorkspaceList = deps.getWorkspaceList;
        const getWorkspaceTree = deps.getWorkspaceTree || function () { return []; };
        const getSelectedWorkspaceId = deps.getSelectedWorkspaceId;
        const addTouchedScope = deps.addTouchedScope || function () {};
        const formatSelectionSummary = deps.formatSelectionSummary || function () { return ''; };
        const getBookmarkCountForCard = deps.getBookmarkCountForCard || function () { return 0; };
        const getBookmarkCountForWorkspace = deps.getBookmarkCountForWorkspace || function () { return 0; };
        const getFolderTreeForScope = deps.getFolderTreeForScope || function () { return []; };
        const getBookmarkCountForFolder = deps.getBookmarkCountForFolder || function () { return 0; };
        function getSelectedCardNameFallback() {
            return String(getSelectedCategoryName() || 'Unsorted').trim() || 'Unsorted';
        }
        function filterWorkspaceTree(nodes, filterText) {
            if (!filterText) return nodes;
            const needle = String(filterText || '').toLowerCase();
            return nodes
                .map((node) => {
                    const matchesSelf = String(node.id || '').toLowerCase().includes(needle)
                        || String(node.name || '').toLowerCase().includes(needle);
                    const filteredChildren = filterWorkspaceTree(node.children || [], filterText);
                    if (matchesSelf || filteredChildren.length) {
                        return { ...node, children: filteredChildren };
                    }
                    return null;
                })
                .filter(Boolean);
        }
        function collectAncestorIds(nodes, targetId, trail = []) {
            for (const node of nodes) {
                if (node.id === targetId) return trail;
                if (node.children?.length) {
                    const result = collectAncestorIds(node.children, targetId, trail.concat(node.id));
                    if (result) return result;
                }
            }
            return null;
        }
        function flattenTreeIds(nodes, accumulator = []) {
            nodes.forEach((node) => {
                accumulator.push(node.id);
                if (node.children?.length) flattenTreeIds(node.children, accumulator);
            });
            return accumulator;
        }
        function buildWorkspaceTreeRowHtml(node, currentWorkspaceId, depth, autoExpandIds) {
            const id = String(node?.id || '');
            const safeId = escapeBulkMoveHtml(id);
            const name = String(node?.name || 'Unnamed').trim() || 'Unnamed';
            const safeName = escapeBulkMoveHtml(name);
            const iconRaw = String(node?.icon || '').trim();
            const safeIcon = iconRaw ? escapeBulkMoveHtml(iconRaw) : escapeBulkMoveHtml(name.charAt(0).toUpperCase() || '?');
            const isSelected = id === currentWorkspaceId;
            const count = getBookmarkCountForWorkspace(id);
            const children = Array.isArray(node?.children) ? node.children : [];
            const hasChildren = children.length > 0;
            const expanded = hasChildren && autoExpandIds.has(id);
            const indentStyle = depth ? ` style="padding-left:${depth * 18}px"` : '';
            let html = `<div class="bulk-target-node${expanded ? ' is-expanded' : ''}" data-tab-id="${safeId}" data-depth="${depth}">`;
            html += `<div class="bulk-target-row-wrap"${indentStyle}>`;
            html += `<button type="button" class="bulk-target-row${isSelected ? ' is-selected' : ''}" role="option" aria-selected="${isSelected}" data-value="${safeId}">`;
            html += `<span class="bulk-target-row-bar" aria-hidden="true"></span>`;
            html += `<span class="bulk-target-row-icon" aria-hidden="true">${safeIcon}</span>`;
            html += `<span class="bulk-target-row-body">`;
            html += `<span class="bulk-target-row-title">${safeName}</span>`;
            html += `<span class="bulk-target-row-meta">${count} bookmark${count === 1 ? '' : 's'}${hasChildren ? ` &middot; ${children.length} subtab${children.length === 1 ? '' : 's'}` : ''}</span>`;
            html += `</span>`;
            html += `<span class="bulk-target-row-count" aria-hidden="true">${count}</span>`;
            html += `</button>`;
            if (hasChildren) {
                html += `<button type="button" class="bulk-target-tree-toggle" aria-label="Toggle subtabs" aria-expanded="${expanded}" onclick="toggleBulkTreeNode(this)">`;
                html += `<span class="bulk-section-chevron" aria-hidden="true">&#9662;</span>`;
                html += `</button>`;
            }
            html += `</div>`;
            if (hasChildren) {
                html += `<div class="bulk-target-children"${expanded ? '' : ' hidden'}>`;
                children.forEach((child) => {
                    html += buildWorkspaceTreeRowHtml(child, currentWorkspaceId, depth + 1, autoExpandIds);
                });
                html += `</div>`;
            }
            html += `</div>`;
            return html;
        }
        function buildCardFolderRowsHtml(folders, workspaceId, categoryName, depth, currentCard, currentFolder) {
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
                    html += buildCardFolderRowsHtml(children, workspaceId, categoryName, depth + 1, currentCard, currentFolder);
                    html += `</div>`;
                }
                html += `</div>`;
                return html;
            }).join('');
        }
        function buildDestinationCardNodeHtml(name, workspaceId, currentCard, currentFolder) {
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
                html += buildCardFolderRowsHtml(folderTree, workspaceId, name, 1, currentCard, currentFolder);
                html += `</div>`;
            }
            html += `</div>`;
            return html;
        }
        function attachListClickHandler(listId, onChange) {
            const list = document.getElementById(listId);
            if (!list || list.dataset.bulkClickReady === '1') return;
            list.addEventListener('click', (event) => {
                const row = event.target.closest('.bulk-target-row[data-value], .bulk-target-row[data-card]');
                if (!row || !list.contains(row)) return;
                event.preventDefault();
                let value = '';
                if (row.hasAttribute('data-card')) {
                    const card = row.getAttribute('data-card') || '';
                    const folderId = row.getAttribute('data-folder-id') || '';
                    list.dataset.selected = card;
                    list.dataset.selectedCard = card;
                    list.dataset.selectedFolder = folderId;
                    value = card;
                } else {
                    value = row.getAttribute('data-value') || '';
                    list.dataset.selected = value;
                }
                Array.from(list.querySelectorAll('.bulk-target-row')).forEach((node) => {
                    const matches = node === row;
                    node.classList.toggle('is-selected', matches);
                    node.setAttribute('aria-selected', matches ? 'true' : 'false');
                });
                if (typeof onChange === 'function') onChange(value);
            });
            list.dataset.bulkClickReady = '1';
        }
        function renderBulkTabOptions() {
            const list = document.getElementById('bulk-tab-existing-list');
            if (!list) return;
            const tree = getWorkspaceTree();
            const currentWorkspaceId = getSelectedWorkspaceId();
            const filterText = String(document.getElementById('bulk-tab-workspace-filter')?.value || '').trim().toLowerCase();
            const summary = document.getElementById('bulk-tab-selection-summary');
            if (summary) summary.textContent = formatSelectionSummary();
            const filteredTree = filterWorkspaceTree(tree, filterText);
            const currentSelected = String(list.dataset.selected || '').trim();
            const allIds = flattenTreeIds(filteredTree);
            const preferred = allIds.includes(currentSelected)
                ? currentSelected
                : allIds.includes(currentWorkspaceId) ? currentWorkspaceId : (allIds[0] || '');
            if (!filteredTree.length) {
                list.innerHTML = '<div class="bulk-target-empty">No matching tabs</div>';
                list.dataset.selected = '';
                renderBulkTabCardOptions();
                return;
            }
            // Auto-expand: when filtering, expand every node so matches are visible.
            // Otherwise expand the chain leading to the preferred selection (if nested).
            const autoExpandIds = new Set();
            if (filterText) {
                flattenTreeIds(filteredTree).forEach((id) => autoExpandIds.add(id));
            } else if (preferred) {
                const ancestors = collectAncestorIds(filteredTree, preferred) || [];
                ancestors.forEach((id) => autoExpandIds.add(id));
            }
            list.innerHTML = filteredTree.map((node) => buildWorkspaceTreeRowHtml(node, preferred, 0, autoExpandIds)).join('');
            list.dataset.selected = preferred;
            renderBulkTabCardOptions();
        }
        function setBulkTabMode(mode) {
            const isNewMode = mode === 'new';
            const list = document.getElementById('bulk-tab-existing-list');
            const input = document.getElementById('bulk-tab-new-name-input');
            const existingRadio = document.querySelector('input[name="bulkTabMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkTabMode"][value="new"]');
            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (list) list.classList.toggle('is-disabled', isNewMode);
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkTabMode', mode);
            if (isNewMode) {
                setBulkTabCardMode('new');
                const cardInput = document.getElementById('bulk-tab-card-new-input');
                if (cardInput && !String(cardInput.value || '').trim()) {
                    cardInput.value = getSelectedCardNameFallback();
                }
            } else {
                renderBulkTabCardOptions();
            }
        }
        function setBulkTabCardMode(mode) {
            const isNewMode = mode === 'new';
            const list = document.getElementById('bulk-tab-card-existing-list');
            const input = document.getElementById('bulk-tab-card-new-input');
            const existingRadio = document.querySelector('input[name="bulkTabCardMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkTabCardMode"][value="new"]');
            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (list) list.classList.toggle('is-disabled', isNewMode);
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkTabCardMode', mode);
        }
        function getResolvedBulkTabWorkspaceId() {
            const mode = document.querySelector('input[name="bulkTabMode"]:checked')?.value || 'existing';
            if (mode === 'new') return '';
            return String(document.getElementById('bulk-tab-existing-list')?.dataset.selected || '').trim();
        }
        function renderBulkTabCardOptions() {
            const list = document.getElementById('bulk-tab-card-existing-list');
            if (!list) return;
            const workspaceId = getResolvedBulkTabWorkspaceId();
            const filterText = String(document.getElementById('bulk-tab-card-filter')?.value || '').trim().toLowerCase();
            const cardNames = workspaceId
                ? getAllCategoryNames(workspaceId).filter((name) => !filterText || String(name || '').toLowerCase().includes(filterText))
                : [];
            const preferredCardFallback = getSelectedCardNameFallback();
            if (!workspaceId || !cardNames.length) {
                list.innerHTML = '<div class="bulk-target-empty">' + (workspaceId ? 'No matching cards' : 'No cards in destination tab') + '</div>';
                list.dataset.selected = '';
                list.dataset.selectedCard = '';
                list.dataset.selectedFolder = '';
                list.dataset.bulkAutoCardMode = 'new';
                setBulkTabCardMode('new');
                const input = document.getElementById('bulk-tab-card-new-input');
                if (input && !String(input.value || '').trim()) {
                    input.value = preferredCardFallback;
                }
                return;
            }
            const currentCard = String(list.dataset.selectedCard || list.dataset.selected || '').trim();
            const currentFolder = String(list.dataset.selectedFolder || '').trim();
            const preferredCard = cardNames.includes(currentCard)
                ? currentCard
                : cardNames.includes(preferredCardFallback) ? preferredCardFallback : cardNames[0];
            const preferredFolder = preferredCard === currentCard ? currentFolder : '';
            list.innerHTML = cardNames.map((name) => buildDestinationCardNodeHtml(name, workspaceId, preferredCard, preferredFolder)).join('');
            list.dataset.selected = preferredCard;
            list.dataset.selectedCard = preferredCard;
            list.dataset.selectedFolder = preferredFolder;
            if (list.dataset.bulkAutoCardMode === 'new') {
                delete list.dataset.bulkAutoCardMode;
                setBulkTabCardMode('existing');
            }
            const input = document.getElementById('bulk-tab-card-new-input');
            if (input && !String(input.value || '').trim()) {
                input.value = preferredCardFallback;
            }
        }
        function openBulkTabModal() {
            const overlay = document.getElementById('bulk-tab-modal-overlay');
            if (!overlay) return;
            const input = document.getElementById('bulk-tab-new-name-input');
            if (input) input.value = '';
            const cardInput = document.getElementById('bulk-tab-card-new-input');
            if (cardInput) cardInput.value = getSelectedCardNameFallback();
            const workspaceFilter = document.getElementById('bulk-tab-workspace-filter');
            if (workspaceFilter) workspaceFilter.value = '';
            const cardFilter = document.getElementById('bulk-tab-card-filter');
            if (cardFilter) cardFilter.value = '';
            const tabList = document.getElementById('bulk-tab-existing-list');
            if (tabList) tabList.dataset.selected = '';
            const cardList = document.getElementById('bulk-tab-card-existing-list');
            if (cardList) cardList.dataset.selected = '';
            renderBulkTabOptions();
            attachListClickHandler('bulk-tab-existing-list', () => renderBulkTabCardOptions());
            attachListClickHandler('bulk-tab-card-existing-list');
            setBulkTabMode('existing');
            setBulkTabCardMode('existing');
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkTabMode', 'existing');
            window.EveBulkToolbar?.syncBulkSectionGroup?.('bulkTabCardMode', 'existing');
            overlay.style.display = 'flex';
        }
        function closeBulkTabModal() {
            const overlay = document.getElementById('bulk-tab-modal-overlay');
            if (overlay) overlay.style.display = 'none';
        }
        function resolveBulkWorkspaceTarget() {
            const mode = document.querySelector('input[name="bulkTabMode"]:checked')?.value || 'existing';
            if (mode === 'new') {
                const name = String(document.getElementById('bulk-tab-new-name-input')?.value || '').trim();
                if (!name) return null;
                const existingByName = getWorkspaceList().find(workspace => workspace.name.toLowerCase() === name.toLowerCase());
                if (existingByName) return { workspaceId: existingByName.id, workspaceName: existingByName.name };
                const workspaceId = `ws_${Date.now()}`;
                const newWorkspace = { id: workspaceId, name, icon: '\uD83D\uDCC1' };
                const appConfig = getConfig();
                if (!Array.isArray(appConfig.workspaces)) appConfig.workspaces = [];
                appConfig.workspaces.push(newWorkspace);
                if (typeof saveConfig === 'function') {
                    saveConfig({
                        source: 'bulk-workspace-created',
                        meta: { workspaceId, workspaceName: name }
                    });
                }
                if (typeof renderSidebar === 'function') renderSidebar();
                return { workspaceId, workspaceName: name };
            }
            const workspaceId = String(document.getElementById('bulk-tab-existing-list')?.dataset.selected || '').trim();
            const workspace = getWorkspaceList().find(item => item.id === workspaceId);
            if (!workspaceId || !workspace) return null;
            return { workspaceId, workspaceName: workspace.name };
        }
        function resolveBulkTabCategoryTarget(targetWorkspaceId) {
            const mode = document.querySelector('input[name="bulkTabCardMode"]:checked')?.value || 'existing';
            if (mode === 'new') {
                return {
                    categoryName: String(document.getElementById('bulk-tab-card-new-input')?.value || '').trim(),
                    folderId: ''
                };
            }
            const list = document.getElementById('bulk-tab-card-existing-list');
            const existingCard = String(list?.dataset.selectedCard || list?.dataset.selected || '').trim();
            const existingFolder = String(list?.dataset.selectedFolder || '').trim();
            if (existingCard) return { categoryName: existingCard, folderId: existingFolder };
            const categoryOptions = getAllCategoryNames(targetWorkspaceId);
            return { categoryName: categoryOptions[0] || '', folderId: '' };
        }
        const applyBulkWorkspaceMove = window.EveBulkToolbar.createWorkspaceMoveApplier({
            getLinks,
            setLinks,
            getSelectedIds,
            toBulkId,
            addTouchedScope
        });
        function confirmBulkTabMove() {
            const movedCount = getSelectedIds().size;
            const target = resolveBulkWorkspaceTarget();
            if (!target?.workspaceId) {
                showToast('Select a tab or enter a new tab name.', 'warning');
                return false;
            }
            const cardTarget = resolveBulkTabCategoryTarget(target.workspaceId);
            if (!cardTarget?.categoryName) {
                showToast('Select a destination card or enter a new card name.', 'warning');
                return false;
            }
            const result = applyBulkWorkspaceMove(target.workspaceId, cardTarget.categoryName, cardTarget.folderId);
            if (!result?.applied) {
                showToast('Unable to move bookmarks to tab.', 'error');
                return false;
            }
            closeBulkTabModal();
            const folderSuffix = cardTarget.folderId ? ' (into a specific folder)' : '';
            showToast(`Moved ${movedCount} bookmark(s) to "${cardTarget.categoryName}" in tab "${target.workspaceName}"${folderSuffix}`, 'success');
            return result;
        }
        return {
            renderBulkTabOptions,
            renderBulkTabCardOptions,
            setBulkTabMode,
            setBulkTabCardMode,
            openBulkTabModal,
            closeBulkTabModal,
            confirmBulkTabMove
        };
    };
})();
