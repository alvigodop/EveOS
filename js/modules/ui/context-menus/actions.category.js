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

    window.ctxCatToggleSmartBadge = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        
        const wsId = String(config.activeWorkspace || 'main');
        // Scoped key combining workspace and category name
        const scopedKey = wsId + '::' + categoryName;
        
        if (!Array.isArray(config.smartCardWeights)) config.smartCardWeights = [];
        
        if (config.smartCardWeights.includes(scopedKey)) {
            config.smartCardWeights = config.smartCardWeights.filter((entry) => entry !== scopedKey);
            showToast('Smart Average Badge Disabled', 'info');
        } else {
            config.smartCardWeights.push(scopedKey);
            showToast('Smart Average Badge Enabled', 'info');
        }

        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    };

    window.ctxCatToggleCustomOrder = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveCustomOrder;
        if (!api) return showToast('Custom order module not loaded', 'error');
        const wsId = String(config.activeWorkspace || 'main');
        // Get current links for this card to initialize numbering
        var cardLinks = (typeof getModalLinks === 'function' ? getModalLinks() : (window.eveState?.links || []))
            .filter(function (l) { return String(l.workspace) === wsId && String(l.category || 'Unsorted') === categoryName; });
        api.toggle(wsId, categoryName, cardLinks);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(api.isEnabled(wsId, categoryName) ? 'Custom numbering enabled' : 'Custom numbering disabled', 'info');
    };

    window.ctxCatCycleSortOrder = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveCustomOrder;
        if (!api) return;
        const wsId = String(config.activeWorkspace || 'main');
        api.cycleSortMode(wsId, categoryName);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        var mode = api.getSortMode(wsId, categoryName);
        var labels = { none: 'Sort: None (positional)', asc: 'Sort: Ascending', desc: 'Sort: Descending' };
        showToast(labels[mode] || mode, 'info');
    };

    window.ctxCatToggleTrueValue = function () {
        const categoryName = shared.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveTrueValue;
        if (!api) return;
        const wsId = String(config.activeWorkspace || 'main');
        api.toggle(wsId, categoryName);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        var enabled = api.isEnabled(wsId, categoryName);
        showToast(enabled ? 'True Value Sort enabled' : 'True Value Sort disabled', 'info');
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
        const helpers = window.EveWorkspaceHelpers;
        const allFlat = helpers ? helpers.flatten(config.workspaces) : config.workspaces;
        if (allFlat.length <= 1) return showToast('Cannot delete last workspace', 'error');
        if (await showConfirm('Delete Workspace? Links move to Main.')) {
            // Gather all IDs being removed (this workspace + all descendants)
            const targetWs = helpers ? helpers.findById(config.workspaces, ctxWsId) : null;
            const removedIds = new Set([ctxWsId]);
            if (targetWs && helpers) {
                helpers.getDescendantIds(targetWs).forEach(function (id) { removedIds.add(id); });
            }
            // Remove from tree
            if (helpers) {
                config.workspaces = helpers.removeById(config.workspaces, ctxWsId);
            } else {
                config.workspaces = config.workspaces.filter((workspace) => workspace.id !== ctxWsId);
            }
            const targetWorkspaceId = config.workspaces[0].id;
            const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
            links.forEach((link) => {
                if (!removedIds.has(link.workspace)) return;
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

    window.ctxWsAddSubTab = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        // Open workspace modal in "create sub-tab" mode
        if (typeof openWorkspaceModal === 'function') {
            openWorkspaceModal(null, { parentId: ctxWsId });
        }
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsCreateShortcut = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        if (!helpers) return;
        const ws = helpers.findById(config.workspaces, ctxWsId);
        if (!ws) return showToast('Workspace not found', 'error');

        const newId = 'ws_' + Date.now();
        const newTab = {
            id: newId,
            name: ws.name + ' (Link)',
            icon: '🔗',
            linkedTo: ws.id,
            subTabs: []
        };
        config.workspaces.push(newTab);
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        showToast('Shortcut Tab Created at Root', 'success');
        if (typeof closeAllMenus === 'function') closeAllMenus();
    };

    window.ctxWsToggleHideSubTabs = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');
        ws.hideSubTabs = !ws.hideSubTabs;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(ws.hideSubTabs ? 'Sub-tab content hidden from this tab' : 'Sub-tab content visible in this tab', 'info');
    };

    window.ctxWsToggleHiddenInParent = function () {
        if (!ctxWsId) return showToast('No workspace selected', 'error');
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, ctxWsId)
            : config.workspaces.find(function (w) { return w.id === ctxWsId; });
        if (!ws) return showToast('Workspace not found', 'error');
        ws.hiddenInParent = !ws.hiddenInParent;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderSidebar === 'function') renderSidebar();
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(ws.hiddenInParent ? (ws.name + ' hidden from parent view') : (ws.name + ' visible in parent view'), 'info');
    };

    shared.categoryReady = true;
})();
