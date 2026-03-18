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



    function getHideStatsStore() {

        if (Array.isArray(window.eveState?.config?.hideStats)) return window.eveState.config.hideStats;

        if (typeof config !== 'undefined' && Array.isArray(config?.hideStats)) return config.hideStats;

        return [];

    }



    function isCardTaskEnabled(workspaceId, categoryName) {

        const normalizedCategoryName = normalizeCategoryName(categoryName);

        return !getHideStatsStore().includes(normalizedCategoryName);

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

        const source = Array.isArray(window.eveState?.links)

            ? window.eveState.links

            : (typeof links !== 'undefined' && Array.isArray(links) ? links : []);

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
        isCardTaskEnabled,
        resolveTaskState,
        isTaskEnabledForLink,
        getTaskModeOptions,
        describeTaskMode
    });
})(window.EveBookmarkFolders);
