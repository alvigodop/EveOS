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

        function buildCardRowHtml(name, workspaceId, currentName) {
            const safeName = escapeBulkMoveHtml(name);
            const isSelected = name === currentName;
            const count = getBookmarkCountForCard(name, workspaceId);
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

        function attachListClickHandler(listId, onChange) {
            const list = document.getElementById(listId);
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
            const preferredCard = getSelectedCardNameFallback();

            if (!workspaceId || !cardNames.length) {
                list.innerHTML = '<div class="bulk-target-empty">' + (workspaceId ? 'No matching cards' : 'No cards in destination tab') + '</div>';
                list.dataset.selected = '';
                list.dataset.bulkAutoCardMode = 'new';
                setBulkTabCardMode('new');
                const input = document.getElementById('bulk-tab-card-new-input');
                if (input && !String(input.value || '').trim()) {
                    input.value = preferredCard;
                }
                return;
            }

            const currentSelected = String(list.dataset.selected || '').trim();
            const preferred = cardNames.includes(currentSelected)
                ? currentSelected
                : cardNames.includes(preferredCard) ? preferredCard : cardNames[0];

            list.innerHTML = cardNames.map((name) => buildCardRowHtml(name, workspaceId, preferred)).join('');
            list.dataset.selected = preferred;

            if (list.dataset.bulkAutoCardMode === 'new') {
                delete list.dataset.bulkAutoCardMode;
                setBulkTabCardMode('existing');
            }

            const input = document.getElementById('bulk-tab-card-new-input');
            if (input && !String(input.value || '').trim()) {
                input.value = preferredCard;
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
                return String(document.getElementById('bulk-tab-card-new-input')?.value || '').trim();
            }

            const existingValue = String(document.getElementById('bulk-tab-card-existing-list')?.dataset.selected || '').trim();
            if (existingValue) return existingValue;

            const categoryOptions = getAllCategoryNames(targetWorkspaceId);
            return categoryOptions[0] || '';
        }

        function applyBulkWorkspaceMove(workspaceId, categoryName) {
            const targetWorkspaceId = String(workspaceId || '').trim() || 'main';
            const targetCategoryName = String(categoryName || '').trim() || 'Unsorted';
            if (!targetWorkspaceId || !targetCategoryName) return false;

            const allLinks = getLinks();
            const selectedLinks = allLinks.filter(link => getSelectedIds().has(toBulkId(link.id)));
            if (selectedLinks.length === 0) return false;

            // 1) Identify source scopes.
            const sourceScopes = new Map();
            selectedLinks.forEach(link => {
                const scope = {
                    workspaceId: String(link.workspace || 'main').trim() || 'main',
                    categoryName: String(link.category || 'Unsorted').trim() || 'Unsorted'
                };
                sourceScopes.set(scope.workspaceId + '::' + scope.categoryName, scope);
            });

            const folderApi = window.EveBookmarkFolders;
            const selectedIdSet = getSelectedIds();
            const normFolder = (value) => String(value || '').trim();
            sourceScopes.forEach(scope => {
                const sWs = scope.workspaceId;
                const sCat = scope.categoryName;

                // Check if we are moving the "whole card"
                const allLinksInSource = allLinks.filter(l => l.workspace === sWs && (l.category || 'Unsorted') === sCat);
                const selectedLinksInSource = selectedLinks.filter(l => l.workspace === sWs && (l.category || 'Unsorted') === sCat);
                const isWholeCardMove = allLinksInSource.length > 0 && selectedLinksInSource.length === allLinksInSource.length;

                if (typeof folderApi?.transferCategoryFolders === 'function') {
                    // Always ensure target has the folder structure.
                    // If it's a partial move, we keep it in source too (mergeOnly: true).
                    folderApi.transferCategoryFolders(sWs, sCat, targetWorkspaceId, targetCategoryName, {
                        mergeOnly: !isWholeCardMove
                    });
                }

                // For partial-card moves where individual folders are *fully* covered by the
                // selection, the mergeOnly clone above leaves an empty copy of those folders in
                // the source. Remove them now so the source card doesn't keep ghost folders.
                if (!isWholeCardMove && typeof folderApi?.removeFolderNodesById === 'function') {
                    const folderIdsInSelection = new Set();
                    selectedLinksInSource.forEach((link) => {
                        const fid = normFolder(link.folderId);
                        if (fid) folderIdsInSelection.add(fid);
                    });
                    const fullyCovered = [];
                    folderIdsInSelection.forEach((fid) => {
                        const allInFolder = allLinksInSource.filter((link) => normFolder(link.folderId) === fid);
                        if (!allInFolder.length) return;
                        const allCovered = allInFolder.every((link) => selectedIdSet.has(toBulkId(link.id)));
                        if (allCovered) fullyCovered.push(fid);
                    });
                    if (fullyCovered.length) {
                        folderApi.removeFolderNodesById(sWs, sCat, fullyCovered, { persist: false });
                    }
                }
            });

            // 2) Update links
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            const mergeApi = window.EveBookmarkMerge;
            const movedLinkIds = [];
            const mergedLinkIds = [];
            const removedLinkIds = [];
            const touchedScopes = new Map();
            selectedLinks.forEach(selectedLink => {
                const link = allLinks.find(candidate => String(candidate?.id) === String(selectedLink.id));
                if (!link) return;
                addTouchedScope(touchedScopes, link.workspace, link.category);

                let nextFolderId = String(link.folderId || '').trim();
                if (nextFolderId && folderApi) {
                    const folder = folderApi.getFolderById(targetWorkspaceId, targetCategoryName, nextFolderId);
                    if (!folder) nextFolderId = '';
                }

                if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                    const result = mergeApi.moveOrMergeLinkToScope(link, {
                        workspaceId: targetWorkspaceId,
                        categoryName: targetCategoryName,
                        folderId: nextFolderId
                    }, {
                        source: 'bulk-workspace-bookmark-move',
                        links: allLinks
                    });
                    if (result?.moved || result?.merged) {
                        movedLinkIds.push(String(result.targetId || link.id));
                        if (result.merged) mergedLinkIds.push(String(result.targetId || ''));
                        if (Array.isArray(result.removedIds)) removedLinkIds.push(...result.removedIds.map(String));
                        addTouchedScope(touchedScopes, targetWorkspaceId, targetCategoryName);
                    }
                    return;
                }

                link.workspace = targetWorkspaceId;
                link.category = targetCategoryName;

                if (nextFolderId) link.folderId = nextFolderId;
                else if (folderApi) folderApi.clearLinkFolderAssignment(link);

                if (typeof syncLinked === 'function') syncLinked(link.id);
                movedLinkIds.push(String(link.id));
                addTouchedScope(touchedScopes, targetWorkspaceId, targetCategoryName);
            });

            setLinks(allLinks);
            return {
                applied: movedLinkIds.length > 0 || removedLinkIds.length > 0,
                source: 'bulk-workspace-bookmark-move',
                movedLinkIds: Array.from(new Set(movedLinkIds)),
                mergedLinkIds: Array.from(new Set(mergedLinkIds.filter(Boolean))),
                removedLinkIds: Array.from(new Set(removedLinkIds)),
                target: {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName
                },
                touchedScopes: Array.from(touchedScopes.values())
            };
        }
        function confirmBulkTabMove() {
            const movedCount = getSelectedIds().size;
            const target = resolveBulkWorkspaceTarget();
            if (!target?.workspaceId) {
                showToast('Select a tab or enter a new tab name.', 'warning');
                return false;
            }
            const nextCategory = resolveBulkTabCategoryTarget(target.workspaceId);
            if (!nextCategory) {
                showToast('Select a destination card or enter a new card name.', 'warning');
                return false;
            }

            const result = applyBulkWorkspaceMove(target.workspaceId, nextCategory);
            if (!result?.applied) {
                showToast('Unable to move bookmarks to tab.', 'error');
                return false;
            }

            closeBulkTabModal();
            showToast(`Moved ${movedCount} bookmark(s) to "${nextCategory}" in tab "${target.workspaceName}"`, 'success');
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
