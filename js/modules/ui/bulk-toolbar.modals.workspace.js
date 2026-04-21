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

        function getSelectedCardNameFallback() {
            return String(getSelectedCategoryName() || 'Unsorted').trim() || 'Unsorted';
        }

        function renderBulkTabOptions() {
            const select = document.getElementById('bulk-tab-existing-select');
            if (!select) return;

            const workspaces = getWorkspaceList();
            const currentWorkspaceId = getSelectedWorkspaceId();
            select.innerHTML = workspaces.map(workspace => {
                const selected = workspace.id === currentWorkspaceId ? ' selected' : '';
                const safeId = escapeBulkMoveHtml(workspace.id);
                const safeLabel = escapeBulkMoveHtml(`${workspace.icon ? `${workspace.icon} ` : ''}${workspace.name}`);
                return `<option value="${safeId}"${selected}>${safeLabel}</option>`;
            }).join('');
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
            const cardNames = workspaceId ? getAllCategoryNames(workspaceId) : [];
            const preferredCard = getSelectedCardNameFallback();

            if (!workspaceId || !cardNames.length) {
                select.innerHTML = '<option value="">No cards in destination tab</option>';
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

            const input = document.getElementById('bulk-tab-card-new-input');
            if (input && !String(input.value || '').trim()) {
                input.value = preferredCard;
            }
        }

        function openBulkTabModal() {
            const overlay = document.getElementById('bulk-tab-modal-overlay');
            if (!overlay) return;
            renderBulkTabOptions();
            setBulkTabMode('existing');
            setBulkTabCardMode('existing');
            const input = document.getElementById('bulk-tab-new-name-input');
            if (input) input.value = '';
            const cardInput = document.getElementById('bulk-tab-card-new-input');
            if (cardInput) cardInput.value = getSelectedCardNameFallback();
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
                if (typeof saveConfig === 'function') saveConfig();
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

            // 1) Identify source scopes (workspace::category)
            const sourceScopes = new Set();
            selectedLinks.forEach(link => {
                sourceScopes.add(`${link.workspace}::${link.category || 'Unsorted'}`);
            });

            const folderApi = window.EveBookmarkFolders;
            sourceScopes.forEach(scope => {
                const [sWs, sCat] = scope.split('::');

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
            selectedLinks.forEach(link => {
                link.workspace = targetWorkspaceId;
                link.category = targetCategoryName;

                // Check if the link's folder exists in the target scope.
                const folderId = link.folderId;
                if (folderId && folderApi) {
                    const folder = folderApi.getFolderById(targetWorkspaceId, targetCategoryName, folderId);
                    if (!folder) {
                        folderApi.clearLinkFolderAssignment(link);
                    }
                }

                if (typeof syncLinked === 'function') {
                    syncLinked(link.id);
                }
            });

            setLinks(allLinks);
            return true;
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

            if (!applyBulkWorkspaceMove(target.workspaceId, nextCategory)) {
                showToast('Unable to move bookmarks to tab.', 'error');
                return false;
            }

            closeBulkTabModal();
            showToast(`Moved ${movedCount} bookmark(s) to "${nextCategory}" in tab "${target.workspaceName}"`, 'success');
            return true;
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
