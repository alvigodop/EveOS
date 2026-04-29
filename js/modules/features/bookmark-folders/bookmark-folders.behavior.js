window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared || {};
    const management = ns || {};
    const {
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeTreeSettings,
        normalizeClickBehaviorMode,
        normalizeTaskMode,
        getScopedNodes,
        getScopedTree,
        getLiveLinks,
        setScopedTree,
        setScopedNodes,
        buildNodeMap
    } = shared;
    const { getFolderById } = management;

    function getCardClickBehaviorMode(workspaceId, categoryName) {



        return normalizeTreeSettings(getScopedTree(workspaceId, categoryName)?.settings).clickBehaviorMode;

    }



    function setCardClickBehaviorMode(workspaceId, categoryName, mode, options = {}) {

        const currentTree = getScopedTree(workspaceId, categoryName);

        return setScopedTree(workspaceId, categoryName, {

            nodes: currentTree.nodes,

            settings: {

                ...currentTree.settings,

                clickBehaviorMode: normalizeClickBehaviorMode(mode)

            }

        }, options).settings.clickBehaviorMode;

    }



    function getFolderClickBehaviorMode(workspaceId, categoryName, folderId) {

        const folder = getFolderById(workspaceId, categoryName, folderId);

        return normalizeClickBehaviorMode(folder?.clickBehaviorMode);

    }



    function setFolderClickBehaviorMode(workspaceId, categoryName, folderId, mode) {

        const normalizedFolderId = normalizeFolderId(folderId);

        if (!normalizedFolderId) return 'inherit';

        const nodes = getScopedNodes(workspaceId, categoryName);

        const target = nodes.find((node) => node.id === normalizedFolderId);

        if (!target) return 'inherit';

        target.clickBehaviorMode = normalizeClickBehaviorMode(mode);

        target.updatedAt = Date.now();

        setScopedNodes(workspaceId, categoryName, nodes);

        return target.clickBehaviorMode;

    }



    function getFolderTaskMode(workspaceId, categoryName, folderId) {

        const folder = getFolderById(workspaceId, categoryName, folderId);

        return normalizeTaskMode(folder?.taskMode);

    }



    function setFolderTaskMode(workspaceId, categoryName, folderId, mode) {

        const normalizedFolderId = normalizeFolderId(folderId);

        if (!normalizedFolderId) return 'inherit';

        const nodes = getScopedNodes(workspaceId, categoryName);

        const target = nodes.find((node) => node.id === normalizedFolderId);

        if (!target) return 'inherit';

        target.taskMode = normalizeTaskMode(mode);

        target.updatedAt = Date.now();

        setScopedNodes(workspaceId, categoryName, nodes);

        return target.taskMode;

    }



    function getFolderTaskModeChain(workspaceId, categoryName, folderId) {

        const normalizedFolderId = normalizeFolderId(folderId);

        if (!normalizedFolderId) return [];

        const nodeMap = buildNodeMap(getScopedNodes(workspaceId, categoryName));

        const chain = [];

        let cursor = nodeMap.get(normalizedFolderId) || null;

        let guard = 0;

        while (cursor && guard < 64) {

            chain.unshift(cursor);

            cursor = cursor.parentId ? (nodeMap.get(cursor.parentId) || null) : null;

            guard += 1;

        }

        return chain;

    }



    function buildCardTaskScopeKey(workspaceId, categoryName) {

        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);

    }



    function getTaskConfigStore() {

        if (window.eveState?.config && typeof window.eveState.config === 'object') return window.eveState.config;

        if (typeof config !== 'undefined' && config && typeof config === 'object') return config;

        return null;

    }



    function getKnownCardTaskScopeKeys() {

        const scopedKeys = new Set();
        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        const hasUsableSnapshot = indexApi && typeof indexApi.hasReadableStructureSnapshot === 'function'
            ? indexApi.hasReadableStructureSnapshot()
            : (indexApi && typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : false);
        const structureSummary = hasUsableSnapshot && typeof indexApi?.getStructureSummary === 'function'
            ? indexApi.getStructureSummary()
            : null;

        if (hasUsableSnapshot && structureSummary?.cards) {
            Object.keys(structureSummary.cards).forEach((scopedKey) => {
                const parts = String(scopedKey || '').split('::');
                const summaryWorkspace = parts.shift();
                const summaryCategory = parts.join('::');
                scopedKeys.add(buildCardTaskScopeKey(summaryWorkspace, summaryCategory));
            });
        }

        const sourceLinks = typeof getLiveLinks === 'function' ? getLiveLinks() : [];

        sourceLinks.forEach((link) => {

            scopedKeys.add(buildCardTaskScopeKey(link?.workspace, link?.category));

        });

        const folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};

        Object.keys(folderStore || {}).forEach((scopedKey) => {

            const parts = String(scopedKey || '').split('::');

            const storeWorkspace = parts.shift();

            const storeCategory = parts.join('::');

            scopedKeys.add(buildCardTaskScopeKey(storeWorkspace, storeCategory));

        });

        return scopedKeys;

    }



    function ensureTaskModeStores() {

        const store = getTaskConfigStore();

        if (!store) return null;

        if (!Array.isArray(store.hideStats)) store.hideStats = [];

        if (!Array.isArray(store.hideStatsScoped)) store.hideStatsScoped = [];

        if (!store.hideStats.length) return store;

        const scopedKeys = getKnownCardTaskScopeKeys();

        if (!scopedKeys.size) return store;

        const nextScoped = new Set(store.hideStatsScoped.map((entry) => String(entry || '').trim()).filter(Boolean));

        const nextLegacy = [];

        store.hideStats.forEach((categoryName) => {

            const normalizedCategory = normalizeCategoryName(categoryName);

            let matched = false;

            scopedKeys.forEach((scopedKey) => {

                if (!String(scopedKey || '').endsWith('::' + normalizedCategory)) return;

                nextScoped.add(scopedKey);

                matched = true;

            });

            if (!matched) nextLegacy.push(normalizedCategory);

        });

        store.hideStatsScoped = Array.from(nextScoped);

        store.hideStats = nextLegacy;

        return store;

    }



    function getHideStatsStore() {

        const store = ensureTaskModeStores();

        if (Array.isArray(store?.hideStats)) return store.hideStats;

        return [];

    }



    function getHideStatsScopedStore() {

        const store = ensureTaskModeStores();

        if (Array.isArray(store?.hideStatsScoped)) return store.hideStatsScoped;

        return [];

    }



    function isCardTaskEnabled(workspaceId, categoryName) {

        const scopedKey = buildCardTaskScopeKey(workspaceId, categoryName);

        if (getHideStatsScopedStore().includes(scopedKey)) return false;

        const normalizedCategoryName = normalizeCategoryName(categoryName);

        return !getHideStatsStore().includes(normalizedCategoryName);

    }



    function setCardTaskEnabled(workspaceId, categoryName, enabled) {

        const store = ensureTaskModeStores();

        if (!store) return !!enabled;

        const scopedKey = buildCardTaskScopeKey(workspaceId, categoryName);

        store.hideStatsScoped = getHideStatsScopedStore().filter((entry) => String(entry || '').trim() !== scopedKey);

        if (!enabled) store.hideStatsScoped.push(scopedKey);

        return isCardTaskEnabled(workspaceId, categoryName);

    }



    function renameCardTaskScope(workspaceId, previousCategoryName, nextCategoryName) {

        const store = ensureTaskModeStores();

        if (!store) return false;

        const previousKey = buildCardTaskScopeKey(workspaceId, previousCategoryName);

        const nextKey = buildCardTaskScopeKey(workspaceId, nextCategoryName);

        let changed = false;

        const nextScoped = [];

        getHideStatsScopedStore().forEach((entry) => {

            const normalizedEntry = String(entry || '').trim();

            if (normalizedEntry === previousKey) {

                nextScoped.push(nextKey);

                changed = true;

                return;

            }

            nextScoped.push(normalizedEntry);

        });

        store.hideStatsScoped = Array.from(new Set(nextScoped.filter(Boolean)));

        if (!changed && getHideStatsStore().includes(normalizeCategoryName(previousCategoryName))) {

            store.hideStats = getHideStatsStore().map((entry) => {

                return normalizeCategoryName(entry) === normalizeCategoryName(previousCategoryName)

                    ? normalizeCategoryName(nextCategoryName)

                    : normalizeCategoryName(entry);

            });

            changed = true;

        }

        return changed;

    }



    function resolveTaskState(workspaceId, categoryName, folderId) {

        let isEnabled = isCardTaskEnabled(workspaceId, categoryName);

        getFolderTaskModeChain(workspaceId, categoryName, folderId).forEach((node) => {

            const mode = normalizeTaskMode(node?.taskMode);

            if (mode === 'task') isEnabled = true;

            if (mode === 'non_task') isEnabled = false;

        });

        return isEnabled;

    }



    function findLinkById(linkId) {

        const targetId = String(linkId || '').trim();

        if (!targetId) return null;

        const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(targetId);
            if (resolved) return resolved;
        }

        const source = typeof getLiveLinks === 'function' ? getLiveLinks() : [];

        return source.find((link) => String(link?.id || '').trim() === targetId) || null;

    }



    function isTaskEnabledForLink(linkOrId) {

        const link = (linkOrId && typeof linkOrId === 'object')

            ? linkOrId

            : findLinkById(linkOrId);

        if (!link || typeof link !== 'object') return false;

        return resolveTaskState(

            normalizeWorkspaceId(link.workspace),

            normalizeCategoryName(link.category),

            normalizeFolderId(link.folderId)

        );

    }



    function getTaskModeOptions() {

        return [

            { value: 'inherit', label: 'Inherit Card Task Mode' },

            { value: 'task', label: 'Force Task' },

            { value: 'non_task', label: 'Force Non-Task' }

        ];

    }



    function describeTaskMode(mode) {

        switch (normalizeTaskMode(mode)) {

            case 'task':

                return 'Bookmarks in this folder behave as tasks even if the card is not in task mode.';

            case 'non_task':

                return 'Bookmarks in this folder do not behave as tasks even if the card is in task mode.';

            default:

                return 'This folder follows the card task mode unless a deeper subfolder overrides it.';

        }

    }


    Object.assign(ns, {
        getCardClickBehaviorMode,
        setCardClickBehaviorMode,
        getFolderClickBehaviorMode,
        setFolderClickBehaviorMode,
        getFolderTaskMode,
        setFolderTaskMode,
        getFolderTaskModeChain,
        buildCardTaskScopeKey,
        isCardTaskEnabled,
        setCardTaskEnabled,
        renameCardTaskScope,
        resolveTaskState,
        isTaskEnabledForLink,
        getTaskModeOptions,
        describeTaskMode
    });
})(window.EveBookmarkFolders);
