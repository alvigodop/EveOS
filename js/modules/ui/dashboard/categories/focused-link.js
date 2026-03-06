window.DashboardCategories = window.DashboardCategories || {};
window.DashboardCategoriesModules = window.DashboardCategoriesModules || {};

(function (DashboardCategories, modules) {
    const view = modules.focusedLinkView || null;
    if (!view) {
        console.warn('[DashboardCategories] Focused link helpers missing.');
        return;
    }

    DashboardCategories.openFocusedEntry = view.openFocusedEntry;
    DashboardCategories.openFocusedEntryDirect = view.openFocusedEntryDirect;
    DashboardCategories.buildFocusedLinkHtml = view.buildFocusedLinkHtml;
})(window.DashboardCategories, window.DashboardCategoriesModules);
