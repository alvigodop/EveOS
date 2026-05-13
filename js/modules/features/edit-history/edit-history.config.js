// --- EveOS Scoped Edit History Config Capture ---
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    const ns = window.EveEditHistory;
    if (ns.configReady) return;
    if (!ns._helpers) {
        console.warn('[EditHistory] Core helpers missing; config history not initialized.');
        return;
    }

    const { text, clone, signature, scopedKey, splitScopedKey, parseFolderTargetId, maxTotal } = ns._helpers;
    const CARD_CONFIG_STORES = [
        'cardDescriptions',
        'cardHeaderButtonsVisible',
        'cardBookmarkProgressiveReveal',
        'customOrder',
        'customOrderSort',
        'trueValueSettings'
    ];
    const FOLDER_CONFIG_STORES = ['folderBookmarkProgressiveReveal'];

    function folderScopedKey(workspaceId, categoryName, folderId) {
        return `${scopedKey(workspaceId, categoryName)}::${text(folderId, '')}`;
    }

    function hasOwn(source, key) {
        return Object.prototype.hasOwnProperty.call(source || {}, key);
    }

    function captureScopedConfigStores(sourceConfig, storeNames, key) {
        const stores = {};
        storeNames.forEach((storeName) => {
            const sourceStore = sourceConfig?.[storeName];
            if (sourceStore && typeof sourceStore === 'object' && hasOwn(sourceStore, key)) {
                stores[storeName] = clone(sourceStore[key]);
            }
        });
        return stores;
    }

    function captureCardConfig(sourceConfig, workspaceId, categoryName) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const key = scopedKey(ws, cat);
        const orderStore = sourceConfig?.categoryOrderByWorkspace;
        return {
            workspaceId: ws,
            categoryName: cat,
            scopedKey: key,
            stores: captureScopedConfigStores(sourceConfig, CARD_CONFIG_STORES, key),
            categoryOrder: Array.isArray(orderStore?.[ws]) ? clone(orderStore[ws]) : null,
            legacyCategoryOrder: ws === 'main' && Array.isArray(sourceConfig?.categoryOrder) ? clone(sourceConfig.categoryOrder) : null
        };
    }

    function captureFolderConfig(sourceConfig, workspaceId, categoryName, folderId) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const id = text(folderId, '');
        const key = folderScopedKey(ws, cat, id);
        return {
            workspaceId: ws,
            categoryName: cat,
            folderId: id,
            scopedKey: key,
            stores: captureScopedConfigStores(sourceConfig, FOLDER_CONFIG_STORES, key)
        };
    }

    function addScopeToMap(scopes, workspaceId, categoryName) {
        const ws = text(workspaceId, '');
        const cat = text(categoryName, '');
        if (ws && cat) scopes.set(scopedKey(ws, cat), { workspaceId: ws, categoryName: cat });
    }

    function collectChangedScopedStoreKeys(previousConfig, nextConfig, storeName) {
        const previousStore = previousConfig?.[storeName] && typeof previousConfig[storeName] === 'object' ? previousConfig[storeName] : {};
        const nextStore = nextConfig?.[storeName] && typeof nextConfig[storeName] === 'object' ? nextConfig[storeName] : {};
        const keys = new Set([...Object.keys(previousStore), ...Object.keys(nextStore)]);
        return Array.from(keys).filter((key) => signature(previousStore[key]) !== signature(nextStore[key]));
    }

    function collectChangedCardConfigScopes(previousConfig, nextConfig, delta) {
        const changedKeys = new Set(delta?.changedKeys || []);
        const scopes = new Map();
        CARD_CONFIG_STORES.forEach((storeName) => {
            if (!changedKeys.has(storeName)) return;
            collectChangedScopedStoreKeys(previousConfig, nextConfig, storeName).forEach((key) => {
                const scope = splitScopedKey(key);
                addScopeToMap(scopes, scope.workspaceId, scope.categoryName);
            });
        });
        if (changedKeys.has('categoryOrderByWorkspace')) {
            const previousStore = previousConfig?.categoryOrderByWorkspace || {};
            const nextStore = nextConfig?.categoryOrderByWorkspace || {};
            const workspaceIds = new Set([...Object.keys(previousStore), ...Object.keys(nextStore)]);
            workspaceIds.forEach((workspaceId) => {
                const previousOrder = Array.isArray(previousStore[workspaceId]) ? previousStore[workspaceId] : [];
                const nextOrder = Array.isArray(nextStore[workspaceId]) ? nextStore[workspaceId] : [];
                if (signature(previousOrder) === signature(nextOrder)) return;
                new Set([...previousOrder, ...nextOrder]).forEach((categoryName) => addScopeToMap(scopes, workspaceId, categoryName));
            });
        }
        if (changedKeys.has('categoryOrder')) {
            const previousOrder = Array.isArray(previousConfig?.categoryOrder) ? previousConfig.categoryOrder : [];
            const nextOrder = Array.isArray(nextConfig?.categoryOrder) ? nextConfig.categoryOrder : [];
            if (signature(previousOrder) !== signature(nextOrder)) {
                new Set([...previousOrder, ...nextOrder]).forEach((categoryName) => addScopeToMap(scopes, 'main', categoryName));
            }
        }
        return Array.from(scopes.values()).slice(0, maxTotal || 800);
    }

    function collectChangedFolderConfigScopes(previousConfig, nextConfig, delta) {
        const changedKeys = new Set(delta?.changedKeys || []);
        if (!FOLDER_CONFIG_STORES.some((storeName) => changedKeys.has(storeName))) return [];
        const scopes = new Map();
        FOLDER_CONFIG_STORES.forEach((storeName) => {
            collectChangedScopedStoreKeys(previousConfig, nextConfig, storeName).forEach((key) => {
                const parsed = parseFolderTargetId(key);
                if (!parsed.folderId) return;
                scopes.set(key, parsed);
            });
        });
        return Array.from(scopes.values()).slice(0, maxTotal || 800);
    }

    ns._configHistory = {
        folderScopedKey,
        captureCardConfig,
        captureFolderConfig,
        collectChangedCardConfigScopes,
        collectChangedFolderConfigScopes
    };
    ns.configReady = true;
})();
