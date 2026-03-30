window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const shared = window.EveContextMenuActions;
    if (shared.categoryReady) return;

    window.deleteCategory = async function (name) {
        try {
            const workspaceId = String(window.config?.activeWorkspace || window.ctxWsId || 'main').trim() || 'main';
            if (window.EveDetachedDashboardCard?.isDetachedParkingCategory?.(name, workspaceId)) {
                if (typeof showToast === 'function') {
                    showToast('Detached parking is managed from the map and cannot be deleted as a normal card.', 'info');
                }
                if (typeof closeAllMenus === 'function') closeAllMenus();
                if (typeof closeModals === 'function') closeModals();
                return;
            }

            if (!(await showConfirm('Delete Category?'))) return;

            const removedIds = links.filter((entry) => entry.category === name).map((entry) => entry.id);
            links = links.filter((entry) => entry.category !== name);
            if (window.eveState) window.eveState.links = links;
            window.links = links;

            if (window.EveBookmarkFolders?.deleteCategoryEverywhere) {
                window.EveBookmarkFolders.deleteCategoryEverywhere(name);
            }
            if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
                removedIds.forEach((id) => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
            }
            if (window.EveCategoryOrder?.removeCategoryEverywhere) {
                window.EveCategoryOrder.removeCategoryEverywhere(name);
            } else if (window.config?.categoryOrder) {
                window.config.categoryOrder = window.config.categoryOrder.filter((category) => category !== name);
            }
            if (typeof saveConfig === 'function') saveConfig();
            if (typeof saveData === 'function') saveData();
            if (typeof closeAllMenus === 'function') closeAllMenus();
            if (typeof closeModals === 'function') closeModals();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderSidebar === 'function') renderSidebar();
        } catch (error) {
            console.error('Error in deleteCategory:', error);
            if (typeof showToast === 'function') {
                showToast(`Failed to delete category: ${error.message}`, 'error');
            } else {
                alert(`Failed to delete category: ${error.message}`);
            }
        }
    };

    window.ctxCatToggleTask = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');

        if (config.hideStats.includes(categoryName)) config.hideStats = config.hideStats.filter((entry) => entry !== categoryName);
        else config.hideStats.push(categoryName);

        saveConfig();
        renderDashboard();
    };

    window.ctxCatFocus = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        setFocus(categoryName);
    };

    window.ctxCatRename = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        openRenameModal(categoryName);
    };

    window.ctxCatLaunch = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        launchCategory(categoryName);
    };

    window.ctxWsDelete = async function () {
        if (config.workspaces.length <= 1) return showToast('Cannot delete last workspace', 'error');
        if (await showConfirm('Delete Workspace? Links move to Main.')) {
            config.workspaces = config.workspaces.filter((workspace) => workspace.id !== ctxWsId);
            const targetWorkspaceId = config.workspaces[0].id;
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            links.forEach((link) => {
                if (link.workspace !== ctxWsId) return;
                link.workspace = targetWorkspaceId;
                if (typeof syncLinked === 'function') syncLinked(link.id);
            });
            window.EveBookmarkFolders?.moveWorkspaceTrees?.(ctxWsId, targetWorkspaceId);
            config.activeWorkspace = config.workspaces[0].id;
            saveConfig();
            saveData();
            renderSidebar();
        }
    };

    shared.categoryReady = true;
})();
