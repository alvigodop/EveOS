window.DashboardCategories = window.DashboardCategories || {};

(function (DashboardCategories) {
    function normalizeFilterMode(rawMode) {
        var mode = String(rawMode || 'all');
        if (mode === 'linked' || mode === 'bookmark-only') return mode;
        return 'all';
    }

    function isLibraryLinked(linkId) {
        var api = window.EveLibrary?.ConnectionsAPI;
        if (!api) return false;

        var linked = api.getLinkedEntry?.(linkId)?.entry;
        if (linked) return true;

        return !!api.findConnectionByLinkId?.(linkId);
    }

    DashboardCategories.getFocusedEntriesFilterMode = function () {
        return normalizeFilterMode(config?.focusedEntriesFilter || 'all');
    };

    DashboardCategories.setFocusedEntriesFilterMode = function (mode) {
        var nextMode = normalizeFilterMode(mode);
        if (String(config?.focusedEntriesFilter || 'all') === nextMode) return;
        config.focusedEntriesFilter = nextMode;
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    };

    DashboardCategories.matchesFocusedEntriesFilter = function (link, mode) {
        var filterMode = normalizeFilterMode(mode);
        if (filterMode === 'all') return true;

        var linked = isLibraryLinked(link?.id);
        if (filterMode === 'linked') return linked;
        if (filterMode === 'bookmark-only') return !linked;
        return true;
    };
})(window.DashboardCategories);
