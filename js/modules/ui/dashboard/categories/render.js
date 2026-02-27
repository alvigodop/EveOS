// --- DASHBOARD CATEGORIES MODULE ---
window.renderCategories = function (visibleLinks, gridContainer, focusCategory, searchStr) {
    if (!gridContainer) return;

    // Use Sorter Module
    const categories = window.DashboardCategories.sort(visibleLinks, config.categoryOrder);

    categories.forEach(cat => {
        if (focusCategory && cat !== focusCategory) return;

        const catLinks = visibleLinks.filter(l => (l.category || "Unsorted") === cat);
        if (catLinks.length > 0) {
            // Prepare config with searchStr override for the builder
            const buildConfig = {
                ...config,
                searchStr: searchStr,
                focusMode: !!focusCategory
            };
            window.DashboardCategories.renderCard(cat, catLinks, gridContainer, buildConfig);
        }
    });
};
