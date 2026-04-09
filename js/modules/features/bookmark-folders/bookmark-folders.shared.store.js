window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};

const CLICK_BEHAVIOR_MODES = new Set(['inherit', 'invert', 'focus_only', 'internal_only', 'open_and_focus', 'open_only']);

    const TASK_MODES = new Set(['inherit', 'task', 'non_task']);



    function getFolderStore() {

        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {

            return window.eveState.bookmarkFolders;

        }

        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {

            return bookmarkFolders;

        }

        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {

            return window.bookmarkFolders;

        }

        return {};

    }



    function normalizeWorkspaceId(workspaceId) {

        const value = String(

            workspaceId

            || window.eveState?.config?.activeWorkspace

            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')

            || 'main'

        ).trim();

        return value || 'main';

    }



    function normalizeCategoryName(categoryName) {

        return String(categoryName || '').trim() || 'Unsorted';

    }



    function normalizeFolderId(folderId) {

        return String(folderId || '').trim();

    }



    function normalizeParentId(parentId) {

        const normalized = normalizeFolderId(parentId);

        return normalized || null;

    }



    function normalizeClickBehaviorMode(value) {

        const normalized = String(value || '').trim().toLowerCase();

        return CLICK_BEHAVIOR_MODES.has(normalized) ? normalized : 'inherit';

    }



    function normalizeTaskMode(value) {

        const normalized = String(value || '').trim().toLowerCase();

        return TASK_MODES.has(normalized) ? normalized : 'inherit';

    }



    function normalizeTreeSettings(settings) {

        const source = settings && typeof settings === 'object' ? settings : {};

        return {

            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)

        };

    }



    function buildScopedKey(workspaceId, categoryName) {

        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;

    }



    function getToolbarConfigStore() {

        if (!window.eveState?.config) return [];

        if (!Array.isArray(window.eveState.config.bookmarkFolderToolbarExpanded)) {

            window.eveState.config.bookmarkFolderToolbarExpanded = [];

        }

        return window.eveState.config.bookmarkFolderToolbarExpanded;

    }



    function getScopedTreeByKey(scopedKey) {

        const store = getFolderStore();

        const rawTree = store[scopedKey] || {};

        return {

            nodes: dedupeNodes(rawTree?.nodes || []),

            settings: normalizeTreeSettings(rawTree?.settings)

        };

    }



    function getScopedTree(workspaceId, categoryName) {

        return getScopedTreeByKey(buildScopedKey(workspaceId, categoryName));

    }



    function normalizeNode(node, index) {

        const normalizedId = normalizeFolderId(node?.id);

        if (!normalizedId) return null;

        return {

            id: normalizedId,

            parentId: normalizeParentId(node?.parentId),

            name: String(node?.name || 'Folder').trim() || 'Folder',

            order: Number.isFinite(Number(node?.order)) ? Number(node.order) : index,

            createdAt: Number.isFinite(Number(node?.createdAt)) ? Number(node.createdAt) : Date.now(),

            updatedAt: Number.isFinite(Number(node?.updatedAt)) ? Number(node.updatedAt) : Date.now(),

            clickBehaviorMode: normalizeClickBehaviorMode(node?.clickBehaviorMode),

            taskMode: normalizeTaskMode(node?.taskMode)

        };

    }



    function dedupeNodes(nodes) {

        const seen = new Set();

        return (Array.isArray(nodes) ? nodes : [])

            .map((node, index) => normalizeNode(node, index))

            .filter((node) => {

                if (!node || seen.has(node.id)) return false;

                seen.add(node.id);

                return true;

            });

    }



    function treeHasMeaningfulState(tree) {

        const settings = normalizeTreeSettings(tree?.settings);

        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];

        return nodes.length > 0 || settings.clickBehaviorMode !== 'inherit';

    }



    function getScopedNodes(workspaceId, categoryName) {

        return dedupeNodes(getScopedTree(workspaceId, categoryName)?.nodes || []);

    }



    function cloneStore() {

        const store = getFolderStore();

        const nextStore = {};

        Object.keys(store || {}).forEach((key) => {

            const normalizedTree = getScopedTreeByKey(key);

            if (!treeHasMeaningfulState(normalizedTree)) return;

            nextStore[key] = {

                nodes: normalizedTree.nodes,

                settings: normalizedTree.settings

            };

        });

        return nextStore;

    }



    function writeStore(nextStore, persist = true) {

        // Ensure all global refs point to the same object

        window.bookmarkFolders = nextStore;

        if (typeof bookmarkFolders !== 'undefined') {

            bookmarkFolders = nextStore;

        }

        if (window.eveState) {

            window.eveState.bookmarkFolders = nextStore;

        }



        if (persist && typeof saveData === 'function') {

            saveData();

        }

    }



    function setScopedTree(workspaceId, categoryName, tree, options = {}) {

        const persist = options.persist !== false;

        const normalizedNodes = dedupeNodes(tree?.nodes || []);

        const normalizedSettings = normalizeTreeSettings(tree?.settings);

        const nextStore = cloneStore();

        const scopedKey = buildScopedKey(workspaceId, categoryName);

        if (normalizedNodes.length > 0 || normalizedSettings.clickBehaviorMode !== 'inherit') {

            nextStore[scopedKey] = {

                nodes: normalizedNodes,

                settings: normalizedSettings

            };

        } else {

            delete nextStore[scopedKey];

        }

        writeStore(nextStore, persist);

        return nextStore[scopedKey] || { nodes: [], settings: normalizeTreeSettings({}) };

    }



    function setScopedNodes(workspaceId, categoryName, nodes, options = {}) {

        const currentTree = getScopedTree(workspaceId, categoryName);

        const nextTree = setScopedTree(workspaceId, categoryName, {

            nodes,

            settings: currentTree.settings

        }, options);

        return nextTree.nodes;

    }



    function buildNodeMap(nodes) {

        const map = new Map();

        dedupeNodes(nodes).forEach((node) => map.set(node.id, node));

        return map;

    }



    function buildChildrenMap(nodes) {

        const map = new Map();

        dedupeNodes(nodes).forEach((node) => {

            const parentId = normalizeParentId(node.parentId);

            if (!map.has(parentId)) map.set(parentId, []);

            map.get(parentId).push(node);

        });

        map.forEach((siblings) => {

            siblings.sort((a, b) => {

                const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);

                if (orderDiff !== 0) return orderDiff;

                return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });

            });

        });

        return map;

    }



    

    Object.assign(shared, {
        CLICK_BEHAVIOR_MODES,
        TASK_MODES,
        getFolderStore,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        normalizeClickBehaviorMode,
        normalizeTaskMode,
        normalizeTreeSettings,
        buildScopedKey,
        getToolbarConfigStore,
        getScopedTreeByKey,
        getScopedTree,
        normalizeNode,
        dedupeNodes,
        treeHasMeaningfulState,
        getScopedNodes,
        cloneStore,
        writeStore,
        setScopedTree,
        setScopedNodes,
        buildNodeMap,
        buildChildrenMap
    });
})(window.EveBookmarkFolders);
