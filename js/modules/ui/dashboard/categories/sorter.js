window.DashboardCategories = window.DashboardCategories || {};

window.DashboardCategories.sort = function (visibleLinks, categoryOrder) {
    let categories = [...new Set(visibleLinks.map(l => l.category || "Unsorted"))];

    if (categoryOrder && categoryOrder.length > 0) {
        categories.sort((a, b) => {
            const idxA = categoryOrder.indexOf(a), idxB = categoryOrder.indexOf(b);
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    } else {
        categories.sort();
    }
    return categories;
};
