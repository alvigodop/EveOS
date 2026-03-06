// --- BULK TOOLBAR WORKSPACE MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
window.EveBulkToolbar.ModalModules = window.EveBulkToolbar.ModalModules || {};

(function () {
    window.EveBulkToolbar.ModalModules.createWorkspaceModalHelpers = function createWorkspaceModalHelpers(deps) {
        const getLinks = deps.getLinks;
        const getConfig = deps.getConfig;
        const getSelectedIds = deps.getSelectedIds;
        const toBulkId = deps.toBulkId;
        const escapeBulkMoveHtml = deps.escapeBulkMoveHtml;
        const getWorkspaceList = deps.getWorkspaceList;
        const getSelectedWorkspaceId = deps.getSelectedWorkspaceId;

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
        }

        function openBulkTabModal() {
            const overlay = document.getElementById('bulk-tab-modal-overlay');
            if (!overlay) return;
            renderBulkTabOptions();
            setBulkTabMode('existing');
            const input = document.getElementById('bulk-tab-new-name-input');
            if (input) input.value = '';
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

        function applyBulkWorkspaceMove(workspaceId) {
            const targetWorkspaceId = String(workspaceId || '').trim();
            if (!targetWorkspaceId) return false;

            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            getLinks().forEach(link => {
                if (!getSelectedIds().has(toBulkId(link.id))) return;
                link.workspace = targetWorkspaceId;
                if (typeof syncLinked === 'function') {
                    syncLinked(link.id);
                }
            });
            return true;
        }

        function confirmBulkTabMove() {
            const movedCount = getSelectedIds().size;
            const target = resolveBulkWorkspaceTarget();
            if (!target?.workspaceId) {
                showToast('Select a tab or enter a new tab name.', 'warning');
                return false;
            }

            if (!applyBulkWorkspaceMove(target.workspaceId)) {
                showToast('Unable to move bookmarks to tab.', 'error');
                return false;
            }

            closeBulkTabModal();
            showToast(`Moved ${movedCount} bookmark(s) to tab "${target.workspaceName}"`, 'success');
            return true;
        }

        return {
            renderBulkTabOptions,
            setBulkTabMode,
            openBulkTabModal,
            closeBulkTabModal,
            confirmBulkTabMove
        };
    };
})();
