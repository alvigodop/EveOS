// --- BULK TOOLBAR MODAL HELPERS ---
window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.modalsReady) return;
    if (!ns.sharedReady || !ns.templatesReady) {
        console.warn('[BulkToolbar] Shared state or templates missing; modal helpers not initialized.');
        return;
    }

    const getLinks = ns.getLinks;
    const getConfig = ns.getConfig;
    const getSelectedIds = ns.getSelectedIds;
    const toBulkId = ns.toBulkId;
    const getAllCategoryNames = ns.getAllCategoryNames;
    const getVisibleDashboardCategoryNames = ns.getVisibleDashboardCategoryNames;
    const escapeBulkMoveHtml = ns.escapeBulkMoveHtml;
    const getSelectedCategoryName = ns.getSelectedCategoryName;
    const getSelectedWorkspaceForMove = ns.getSelectedWorkspaceForMove;
    const getWorkspaceList = ns.getWorkspaceList;
    const getSelectedWorkspaceId = ns.getSelectedWorkspaceId;

    let overlayDismissReady = false;

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
        getLinks().forEach(link => {
            if (!getSelectedIds().has(toBulkId(link.id))) return;
            link.category = categoryName;
            if (typeof syncLinked === 'function') {
                syncLinked(link.id);
            }
        });
        return true;
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

    function closeAllModals() {
        closeBulkMoveModal();
        closeBulkTabModal();
    }

    function attachOverlayDismissHandlers() {
        if (overlayDismissReady) return;
        document.addEventListener('mousedown', (event) => {
            const moveOverlay = document.getElementById('bulk-move-modal-overlay');
            if (moveOverlay && moveOverlay.style.display === 'flex' && event.target === moveOverlay) {
                closeBulkMoveModal();
                return;
            }

            const tabOverlay = document.getElementById('bulk-tab-modal-overlay');
            if (tabOverlay && tabOverlay.style.display === 'flex' && event.target === tabOverlay) {
                closeBulkTabModal();
            }
        });
        overlayDismissReady = true;
    }

    Object.assign(ns, {
        renderBulkMoveCategoryOptions,
        setBulkMoveMode,
        openBulkMoveModal,
        closeBulkMoveModal,
        confirmBulkMove,
        renderBulkTabOptions,
        setBulkTabMode,
        openBulkTabModal,
        closeBulkTabModal,
        confirmBulkTabMove,
        closeAllModals,
        attachOverlayDismissHandlers
    });
    ns.modalsReady = true;
})();
