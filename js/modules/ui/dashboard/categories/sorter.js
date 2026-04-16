window.DashboardCategories = window.DashboardCategories || {};

window.DashboardCategories.sort = function (visibleLinks, categoryOrder) {
    let catWsMap = new Map();

    visibleLinks.forEach(l => {
        let cat = String(l.category || "Unsorted").trim();
        let wsId = String(l.workspace || "main").trim();
        let key = `${wsId}::${cat}`;
        if (!catWsMap.has(key)) {
            catWsMap.set(key, { category: cat, workspaceId: wsId });
        }
    });

    let categories = Array.from(catWsMap.values());

    if (categoryOrder && categoryOrder.length > 0) {
        categories.sort((a, b) => {
            const idxA = categoryOrder.indexOf(a.category);
            const idxB = categoryOrder.indexOf(b.category);
            
            // Primary sort by categoryOrder
            if (idxA !== -1 && idxB !== -1) {
                if (idxA !== idxB) return idxA - idxB;
            } else if (idxA !== -1) {
                return -1;
            } else if (idxB !== -1) {
                return 1;
            } else {
                // Secondary sort by category name if not in order
                let nameCompare = a.category.localeCompare(b.category);
                if (nameCompare !== 0) return nameCompare;
            }
            
            // Tertiary sort by workspaceId to ensure stability
            return a.workspaceId.localeCompare(b.workspaceId);
        });
    } else {
        categories.sort((a, b) => {
            let nc = a.category.localeCompare(b.category);
            if (nc !== 0) return nc;
            return a.workspaceId.localeCompare(b.workspaceId);
        });
    }
    return categories;
};
