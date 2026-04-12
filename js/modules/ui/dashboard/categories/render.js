// --- DASHBOARD CATEGORIES MODULE ---
function getDashboardFolderStore() {
    if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') return window.eveState.bookmarkFolders;
    if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') return bookmarkFolders;
    if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
    return {};
}

function getDashboardActiveWorkspace() {
    return String(config?.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
}

function getFolderBackedCategories(workspaceId) {
    const scopedPrefix = String(workspaceId || 'main') + '::';
    const store = getDashboardFolderStore();
    return Object.keys(store)
        .filter(function (key) { return key.indexOf(scopedPrefix) === 0; })
        .map(function (key) { return key.slice(scopedPrefix.length) || 'Unsorted'; });
}

function hasFolderBackedCategory(workspaceId, categoryName) {
    const scopedKey = String(workspaceId || 'main') + '::' + String(categoryName || 'Unsorted');
    const store = getDashboardFolderStore();
    const tree = store && typeof store === 'object' ? store[scopedKey] : null;
    return !!(tree && Array.isArray(tree.nodes) && tree.nodes.length);
}

function collectDashboardCategories(visibleLinks, workspaceId, categoryOrder, detachedModel) {
    const linkedCategories = window.DashboardCategories.sort(visibleLinks, categoryOrder);
    const folderCategories = getFolderBackedCategories(workspaceId);
    const ordered = [];
    const seen = new Set();

    function addCategory(name) {
        const normalized = String(name || 'Unsorted').trim() || 'Unsorted';
        if (seen.has(normalized)) return;
        seen.add(normalized);
        ordered.push(normalized);
    }

    (Array.isArray(categoryOrder) ? categoryOrder : []).forEach(addCategory);
    linkedCategories.forEach(addCategory);
    folderCategories.forEach(addCategory);
    if (detachedModel?.links?.length || detachedModel?.viewModel?.nodes?.length) {
        addCategory(detachedModel.categoryName);
    }

    return ordered;
}

window.renderCategories = function (visibleLinks, gridContainer, focusCategory, searchStr) {
    if (!gridContainer) return;
    const activeWorkspace = getDashboardActiveWorkspace();
    const workspaceCategoryOrder = window.EveCategoryOrder?.getOrder
        ? window.EveCategoryOrder.getOrder(activeWorkspace)
        : (Array.isArray(config.categoryOrder) ? config.categoryOrder : []);
    const detachedModel = window.EveDetachedDashboardCard?.buildDetachedDashboardModel
        ? window.EveDetachedDashboardCard.buildDetachedDashboardModel(activeWorkspace)
        : null;
    const categories = collectDashboardCategories(visibleLinks, activeWorkspace, workspaceCategoryOrder, detachedModel);

    // Pre-index links by category — O(n) instead of O(n * categories)
    const linksByCat = new Map();
    for (var i = 0; i < visibleLinks.length; i++) {
        var cat = (visibleLinks[i].category || 'Unsorted');
        if (!linksByCat.has(cat)) linksByCat.set(cat, []);
        linksByCat.get(cat).push(visibleLinks[i]);
    }

    var CARD_CAP = 20; // Max cards to render in first frame
    var renderCount = 0;
    var deferredCards = [];

    categories.forEach(cat => {
        if (focusCategory && cat !== focusCategory) return;

        const isDetachedParkingCard = !!detachedModel && cat === detachedModel.categoryName;
        const catLinks = isDetachedParkingCard
            ? detachedModel.links.slice()
            : (linksByCat.get(cat) || []);
        const hasFolderContent = isDetachedParkingCard
            ? !!(detachedModel?.viewModel?.nodes?.length)
            : hasFolderBackedCategory(activeWorkspace, cat);
        const shouldRenderEmptyCard = !searchStr && (
            window.EveCategoryOrder?.hasCategory
                ? window.EveCategoryOrder.hasCategory(activeWorkspace, cat)
                : workspaceCategoryOrder.includes(cat)
        );

        if (catLinks.length > 0 || hasFolderContent || shouldRenderEmptyCard) {
            const buildConfig = {
                ...config,
                searchStr: searchStr,
                focusMode: !!focusCategory,
                activeWorkspace: activeWorkspace
            };
            if (isDetachedParkingCard) {
                buildConfig.virtualFolderViewModel = detachedModel.viewModel;
                buildConfig.detachedParkingCard = true;
            }

            if (renderCount < CARD_CAP) {
                window.DashboardCategories.renderCard(cat, catLinks, gridContainer, buildConfig);
                renderCount++;
            } else {
                deferredCards.push({ cat: cat, catLinks: catLinks, buildConfig: buildConfig });
            }
        }
    });

    // Render remaining cards in batches via setTimeout
    if (deferredCards.length > 0) {
        var batchIdx = 0;
        function renderNextBatch() {
            var end = Math.min(batchIdx + 5, deferredCards.length);
            for (var j = batchIdx; j < end; j++) {
                var d = deferredCards[j];
                window.DashboardCategories.renderCard(d.cat, d.catLinks, gridContainer, d.buildConfig);
            }
            batchIdx = end;
            if (batchIdx < deferredCards.length) {
                setTimeout(renderNextBatch, 0);
            }
        }
        setTimeout(renderNextBatch, 0);
    }
};
