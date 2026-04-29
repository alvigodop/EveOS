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
        const getSelectedWorkspaceId = deps.getSelectedWorkspaceId;
        const addTouchedScope = deps.addTouchedScope || function () {};
        const formatSelectionSummary = deps.formatSelectionSummary || function () { return ''; };

        function getSelectedCardNameFallback() {
            return String(getSelectedCategoryName() || 'Unsorted').trim() || 'Unsorted';
        }

        function renderBulkTabOptions() {
            const select = document.getElementById('bulk-tab-existing-select');
            if (!select) return;

            const workspaces = getWorkspaceList();
            const currentWorkspaceId = getSelectedWorkspaceId();
            const filterText = String(document.getElementById('bulk-tab-workspace-filter')?.value || '').trim().toLowerCase();
            const summary = document.getElementById('bulk-tab-selection-summary');
            if (summary) summary.textContent = formatSelectionSummary();
            const filteredWorkspaces = workspaces.filter((workspace) => {
                if (!filterText) return true;
                return String(workspace.id || '').toLowerCase().includes(filterText)
                    || String(workspace.name || '').toLowerCase().includes(filterText);
            });
            select.innerHTML = filteredWorkspaces.length ? filteredWorkspaces.map(workspace => {
                const selected = workspace.id === currentWorkspaceId ? ' selected' : '';
                const safeId = escapeBulkMoveHtml(workspace.id);
                const safeLabel = escapeBulkMoveHtml(`${workspace.icon ? `${workspace.icon} ` : ''}${workspace.name}`);
                return `<option value="${safeId}"${selected}>${safeLabel}</option>`;
            }).join('') : '<option value="">No matching tabs</option>';
            renderBulkTabCardOptions();
        }

        function setBulkTabMode(mode) {
            const isNewMode = mode === 'new';
            const select = document.getElementById('bulk-tab-existing-select');
            const input = document.getElementById('bulk-tab-new-name-input');
            const existingRadio = document.querySelector('input[name="bulkTabMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkTabMode"][value="new"]');

            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (select) select.disabled = isNewMode;
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
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
            const select = document.getElementById('bulk-tab-card-existing-select');
            const input = document.getElementById('bulk-tab-card-new-input');
            const existingRadio = document.querySelector('input[name="bulkTabCardMode"][value="existing"]');
            const newRadio = document.querySelector('input[name="bulkTabCardMode"][value="new"]');

            if (existingRadio) existingRadio.checked = !isNewMode;
            if (newRadio) newRadio.checked = isNewMode;
            if (select) select.disabled = isNewMode;
            if (input) {
                input.disabled = !isNewMode;
                if (isNewMode) input.focus();
            }
        }

        function getResolvedBulkTabWorkspaceId() {
            const mode = document.querySelector('input[name="bulkTabMode"]:checked')?.value || 'existing';
            if (mode === 'new') return '';
            return String(document.getElementById('bulk-tab-existing-select')?.value || '').trim();
        }

        function renderBulkTabCardOptions() {
            const select = document.getElementById('bulk-tab-card-existing-select');
            if (!select) return;

            const workspaceId = getResolvedBulkTabWorkspaceId();
            const filterText = String(document.getElementById('bulk-tab-card-filter')?.value || '').trim().toLowerCase();
            const cardNames = workspaceId
                ? getAllCategoryNames(workspaceId).filter((name) => !filterText || String(name || '').toLowerCase().includes(filterText))
                : [];
            const preferredCard = getSelectedCardNameFallback();

            if (!workspaceId || !cardNames.length) {
                select.innerHTML = '<option value="">' + (workspaceId ? 'No matching cards' : 'No cards in destination tab') + '</option>';
                select.dataset.bulkAutoCardMode = 'new';
                setBulkTabCardMode('new');
                const input = document.getElementById('bulk-tab-card-new-input');
                if (input && !String(input.value || '').trim()) {
                    input.value = preferredCard;
                }
                return;
            }

            select.innerHTML = cardNames.map((name) => {
                const selected = name === preferredCard ? ' selected' : '';
                const safeName = escapeBulkMoveHtml(name);
                return `<option value="${safeName}"${selected}>${safeName}</option>`;
            }).join('');
            if (select.dataset.bulkAutoCardMode === 'new') {
                delete select.dataset.bulkAutoCardMode;
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
            renderBulkTabOptions();
            setBulkTabMode('existing');
            setBulkTabCardMode('existing');
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

            const workspaceId = String(document.getElementById('bulk-tab-existing-select')?.value || '').trim();
            const workspace = getWorkspaceList().find(item => item.id === workspaceId);
            if (!workspaceId || !workspace) return null;
            return { workspaceId, workspaceName: workspace.name };
        }

        function resolveBulkTabCategoryTarget(targetWorkspaceId) {
            const mode = document.querySelector('input[name="bulkTabCardMode"]:checked')?.value || 'existing';
            if (mode === 'new') {
                return String(document.getElementById('bulk-tab-card-new-input')?.value || '').trim();
            }

            const existingValue = String(document.getElementById('bulk-tab-card-existing-select')?.value || '').trim();
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
