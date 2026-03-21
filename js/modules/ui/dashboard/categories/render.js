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

function buildDetachedDashboardModel(workspaceId) {
    const detachedApi = window.EveConstellationMap?._detached;
    const parkingCategoryName = String(detachedApi?.PARKING_CATEGORY_NAME || 'Detached Nodes');
    const entries = typeof detachedApi?.getDetachedEntriesForScope === 'function'
        ? detachedApi.getDetachedEntriesForScope({ scope: 'workspace', workspaceId: workspaceId })
        : [];
    if (!Array.isArray(entries) || !entries.length) return null;

    const nodes = [];
    const rootLinks = [];
    const folderLinks = new Map();
    const childrenMap = new Map();
    const topLevelFolders = [];

    function pushChild(parentId, node) {
        const key = parentId || null;
        if (!childrenMap.has(key)) childrenMap.set(key, []);
        childrenMap.get(key).push(node);
    }

    entries.forEach(function (entry) {
        if (!entry || entry.workspaceId !== workspaceId) return;
        if (entry.kind === 'link') {
            const liveishLink = Object.assign({}, entry.link || {}, {
                workspace: workspaceId,
                category: parkingCategoryName,
                detached: true,
                detachedEntryId: String(entry.id || '')
            });
            rootLinks.push(liveishLink);
            return;
        }

        const folderData = entry.folder || {};
        const folderNodes = Array.isArray(folderData.nodes) ? folderData.nodes : [];
        const folderLinksRaw = Array.isArray(folderData.links) ? folderData.links : [];
        const idMap = new Map();

        folderNodes.forEach(function (node) {
            const originalId = String(node?.id || '');
            if (!originalId) return;
            idMap.set(originalId, 'detached::' + String(entry.id || '') + '::' + originalId);
        });

        folderNodes.forEach(function (node) {
            const originalId = String(node?.id || '');
            const syntheticId = idMap.get(originalId);
            if (!syntheticId) return;
            const syntheticNode = Object.assign({}, node, {
                id: syntheticId,
                parentId: idMap.get(String(node?.parentId || '')) || null,
                detachedEntryId: String(entry.id || ''),
                detachedOriginalId: originalId,
                detachedEntryRoot: originalId === String(folderData?.rootId || '')
            });
            nodes.push(syntheticNode);
            if (!syntheticNode.parentId) topLevelFolders.push(syntheticNode);
            pushChild(syntheticNode.parentId, syntheticNode);
        });

        folderLinksRaw.forEach(function (link) {
            const syntheticFolderId = idMap.get(String(link?.folderId || '')) || '';
            const liveishLink = Object.assign({}, link || {}, {
                workspace: workspaceId,
                category: parkingCategoryName,
                folderId: syntheticFolderId,
                detached: true,
                detachedEntryId: String(entry.id || '')
            });
            if (!folderLinks.has(syntheticFolderId)) folderLinks.set(syntheticFolderId, []);
            folderLinks.get(syntheticFolderId).push(liveishLink);
        });
    });

    topLevelFolders.sort(function (left, right) {
        return String(left?.name || '').localeCompare(String(right?.name || ''));
    });
    childrenMap.forEach(function (items) {
        items.sort(function (left, right) {
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        });
    });

    return {
        categoryName: parkingCategoryName,
        links: rootLinks.concat(Array.from(folderLinks.values()).flat()),
        viewModel: {
            nodes: nodes,
            rootLinks: rootLinks,
            topLevelFolders: topLevelFolders,
            childrenMap: childrenMap,
            folderLinks: folderLinks
        }
    };
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
    const detachedModel = buildDetachedDashboardModel(activeWorkspace);
    const categories = collectDashboardCategories(visibleLinks, activeWorkspace, config.categoryOrder, detachedModel);

    categories.forEach(cat => {
        if (focusCategory && cat !== focusCategory) return;

        const isDetachedParkingCard = !!detachedModel && cat === detachedModel.categoryName;
        const catLinks = isDetachedParkingCard
            ? detachedModel.links.slice()
            : visibleLinks.filter(l => (l.category || "Unsorted") === cat);
        const hasFolderContent = isDetachedParkingCard
            ? !!(detachedModel?.viewModel?.nodes?.length)
            : hasFolderBackedCategory(activeWorkspace, cat);
        const shouldRenderEmptyCard = !searchStr && Array.isArray(config.categoryOrder) && config.categoryOrder.includes(cat);

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
            window.DashboardCategories.renderCard(cat, catLinks, gridContainer, buildConfig);
        }
    });
};
