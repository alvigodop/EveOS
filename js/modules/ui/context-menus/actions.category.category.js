window.EveContextMenuActions = window.EveContextMenuActions || {};

(function () {
    const ns = window.EveContextMenuActions;
    if (ns.categoryCardActionsReady) return;

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
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');

        if (config.hideStats.includes(categoryName)) config.hideStats = config.hideStats.filter((entry) => entry !== categoryName);
        else config.hideStats.push(categoryName);

        saveConfig();
        renderDashboard();
    };

    window.ctxCatToggleSmartBadge = function () {
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');

        const wsId = String(config.activeWorkspace || 'main');
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
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        const api = window.EveCustomOrder;
        if (!api) return showToast('Custom order module not loaded', 'error');
        const wsId = String(config.activeWorkspace || 'main');
        var cardLinks = (typeof getModalLinks === 'function' ? getModalLinks() : (window.eveState?.links || []))
            .filter(function (l) { return String(l.workspace) === wsId && String(l.category || 'Unsorted') === categoryName; });
        api.toggle(wsId, categoryName, cardLinks);
        if (typeof closeAllMenus === 'function') closeAllMenus();
        showToast(api.isEnabled(wsId, categoryName) ? 'Custom numbering enabled' : 'Custom numbering disabled', 'info');
    };

    window.ctxCatCycleSortOrder = function () {
        const categoryName = ns.getCtxCategoryName?.();
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
        const categoryName = ns.getCtxCategoryName?.();
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
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        setFocus(categoryName);
    };

    window.ctxCatRename = function () {
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        openRenameModal(categoryName);
    };

    window.ctxCatLaunch = function () {
        const categoryName = ns.getCtxCategoryName?.();
        if (!categoryName) return showToast('No category selected', 'error');
        launchCategory(categoryName);
    };

    ns.categoryCardActionsReady = true;
})();
