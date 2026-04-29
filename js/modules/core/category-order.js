// --- WORKSPACE CATEGORY ORDER ---
window.EveCategoryOrder = window.EveCategoryOrder || {};

(function (ns) {
    function getConfig() {
        if (typeof window.config !== 'undefined' && window.config) return window.config;
        if (window.eveState?.config) return window.eveState.config;
        return {};
    }

    function getLinksSource() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.links)) return window.links;
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        return [];
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getDatapackStructureSummary() {
        var indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
        if (typeof indexApi.hasReadableStructureSnapshot === 'function' && !indexApi.hasReadableStructureSnapshot()) return null;
        if (typeof indexApi.hasReadableStructureSnapshot !== 'function' && typeof indexApi.hasUsableSnapshot === 'function' && !indexApi.hasUsableSnapshot()) return null;
        var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        if (!indexApi.hasReadableStructureSnapshot && !indexApi.hasUsableSnapshot && Number(buildState?.builtAt || 0) <= 0) return null;
        return indexApi.getStructureSummary();
    }

    function getFolderStore() {
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') return window.eveState.bookmarkFolders;
        return {};
    }

    function normalizeWorkspaceId(workspaceId) {
        return String(workspaceId || 'main').trim() || 'main';
    }

    function normalizeCategoryName(categoryName) {
        return String(categoryName || 'Unsorted').trim() || 'Unsorted';
    }

    function dedupeNormalizedCategoryList(list) {
        const ordered = [];
        const seen = new Set();
        (Array.isArray(list) ? list : []).forEach(function (value) {
            const categoryName = normalizeCategoryName(value);
            if (seen.has(categoryName)) return;
            seen.add(categoryName);
            ordered.push(categoryName);
        });
        return ordered;
    }

    function getWorkspaceOrderStore() {
        const config = getConfig();
        if (!config.categoryOrderByWorkspace || typeof config.categoryOrderByWorkspace !== 'object') {
            config.categoryOrderByWorkspace = {};
        }
        return config.categoryOrderByWorkspace;
    }

    function getKnownCategories(workspaceId) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        const summary = getDatapackStructureSummary();

        if (summary?.cards && typeof summary.cards === 'object') {
            Object.keys(summary.cards).forEach(function (cardKey) {
                if (String(cardKey || '').indexOf(normalizedWorkspaceId + '::') !== 0) return;
                const categoryName = normalizeCategoryName(String(cardKey).slice((normalizedWorkspaceId + '::').length));
                if (categoryName) names.add(categoryName);
            });
        }

        getLinksSource().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) !== normalizedWorkspaceId) return;
            names.add(normalizeCategoryName(link?.category));
        });

        const scopedPrefix = normalizedWorkspaceId + '::';
        const folderStore = getFolderStore();
        Object.keys(folderStore).forEach(function (scopedKey) {
            if (String(scopedKey || '').indexOf(scopedPrefix) !== 0) return;
            const tree = folderStore[scopedKey];
            const categoryName = normalizeCategoryName(String(scopedKey).slice(scopedPrefix.length));
            if (!categoryName) return;
            if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return;
            names.add(categoryName);
        });

        return names;
    }

    function buildDerivedWorkspaceOrder(workspaceId) {
        const config = getConfig();
        const legacyOrder = dedupeNormalizedCategoryList(config.categoryOrder);
        const knownCategories = Array.from(getKnownCategories(workspaceId));
        const knownSet = new Set(knownCategories);
        const ordered = legacyOrder.filter(function (categoryName) {
            return knownSet.has(categoryName);
        });

        knownCategories
            .sort(function (left, right) {
                return left.localeCompare(right, undefined, { sensitivity: 'base' });
            })
            .forEach(function (categoryName) {
                if (!ordered.includes(categoryName)) ordered.push(categoryName);
            });

        return ordered;
    }

    function syncLegacyCategoryOrder() {
        // Disabled to prevent cross-workspace category bleeding.
        // Legacy syncing caused newly created categories in one workspace
        // to appear as empty placeholder cards in unrelated workspaces.
        return [];
    }

    function getOrder(workspaceId, options = {}) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const store = getWorkspaceOrderStore();
        const persisted = !!options.persist;
        const storedOrder = Array.isArray(store[normalizedWorkspaceId])
            ? dedupeNormalizedCategoryList(store[normalizedWorkspaceId])
            : null;
        const baseOrder = storedOrder ? storedOrder.slice() : buildDerivedWorkspaceOrder(normalizedWorkspaceId);
        const knownCategories = Array.from(getKnownCategories(normalizedWorkspaceId))
            .sort(function (left, right) {
                return left.localeCompare(right, undefined, { sensitivity: 'base' });
            });

        knownCategories.forEach(function (categoryName) {
            if (!baseOrder.includes(categoryName)) baseOrder.push(categoryName);
        });

        if (persisted) {
            store[normalizedWorkspaceId] = baseOrder.slice();
            syncLegacyCategoryOrder();
        }

        return baseOrder;
    }

    function hasCategory(workspaceId, categoryName) {
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        return getOrder(workspaceId).includes(normalizedCategoryName);
    }

    function ensureCategory(workspaceId, categoryName) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        const store = getWorkspaceOrderStore();
        const order = getOrder(normalizedWorkspaceId, { persist: true });
        if (order.includes(normalizedCategoryName)) return false;
        order.push(normalizedCategoryName);
        store[normalizedWorkspaceId] = order;
        syncLegacyCategoryOrder();
        return true;
    }

    function removeCategory(workspaceId, categoryName) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        const store = getWorkspaceOrderStore();
        const order = getOrder(normalizedWorkspaceId, { persist: true }).filter(function (name) {
            return name !== normalizedCategoryName;
        });
        store[normalizedWorkspaceId] = order;
        syncLegacyCategoryOrder();
        return true;
    }

    function removeCategoryEverywhere(categoryName) {
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        const store = getWorkspaceOrderStore();
        Object.keys(store).forEach(function (workspaceId) {
            store[workspaceId] = dedupeNormalizedCategoryList(store[workspaceId]).filter(function (name) {
                return name !== normalizedCategoryName;
            });
        });
        syncLegacyCategoryOrder();
        return true;
    }

    function renameCategory(workspaceId, oldName, newName) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const previousName = normalizeCategoryName(oldName);
        const nextName = normalizeCategoryName(newName);
        const store = getWorkspaceOrderStore();
        const order = getOrder(normalizedWorkspaceId, { persist: true }).map(function (name) {
            return name === previousName ? nextName : name;
        });
        store[normalizedWorkspaceId] = dedupeNormalizedCategoryList(order);
        syncLegacyCategoryOrder();
        return true;
    }

    function renameCategoryEverywhere(oldName, newName) {
        const previousName = normalizeCategoryName(oldName);
        const nextName = normalizeCategoryName(newName);
        const store = getWorkspaceOrderStore();
        Object.keys(store).forEach(function (workspaceId) {
            const renamed = dedupeNormalizedCategoryList(store[workspaceId]).map(function (name) {
                return name === previousName ? nextName : name;
            });
            store[workspaceId] = dedupeNormalizedCategoryList(renamed);
        });
        syncLegacyCategoryOrder();
        return true;
    }

    function moveCategory(workspaceId, categoryName, direction) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        const step = Number(direction) || 0;
        if (!step) return false;
        const store = getWorkspaceOrderStore();
        const order = getOrder(normalizedWorkspaceId, { persist: true });
        const index = order.indexOf(normalizedCategoryName);
        const nextIndex = index + step;
        if (index === -1 || nextIndex < 0 || nextIndex >= order.length) return false;
        const nextOrder = order.slice();
        const temp = nextOrder[nextIndex];
        nextOrder[nextIndex] = nextOrder[index];
        nextOrder[index] = temp;
        store[normalizedWorkspaceId] = nextOrder;
        syncLegacyCategoryOrder();
        return true;
    }

    function moveCategoryToPosition(workspaceId, categoryName, absolutePosition) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        const store = getWorkspaceOrderStore();
        const order = getOrder(normalizedWorkspaceId, { persist: true });
        
        const index = order.indexOf(normalizedCategoryName);
        if (index === -1) return false;
        
        let targetIndex = Math.max(0, absolutePosition - 1);
        if (targetIndex >= order.length) {
            targetIndex = order.length - 1;
        }
        
        if (index === targetIndex) return false;
        
        const nextOrder = order.slice();
        nextOrder.splice(index, 1);
        nextOrder.splice(targetIndex, 0, normalizedCategoryName);
        
        store[normalizedWorkspaceId] = nextOrder;
        syncLegacyCategoryOrder();
        return true;
    }

    Object.assign(ns, {
        normalizeWorkspaceId,
        normalizeCategoryName,
        getKnownCategories,
        getOrder,
        hasCategory,
        ensureCategory,
        removeCategory,
        removeCategoryEverywhere,
        renameCategory,
        renameCategoryEverywhere,
        moveCategory,
        moveCategoryToPosition
    });
})(window.EveCategoryOrder);
