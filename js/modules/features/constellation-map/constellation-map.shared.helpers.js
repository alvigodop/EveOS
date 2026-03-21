window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    function getConfig() {

        return (typeof window.config !== 'undefined' && window.config)

            ? window.config

            : (window.eveState?.config || {});

    }

    function getAllLinks() {

        if (Array.isArray(window.links)) return window.links;

        if (Array.isArray(window.eveState?.links)) return window.eveState.links;

        return [];

    }

    function text(value, fallback) {

        const normalized = String(value ?? '').trim();

        if (normalized) return normalized;

        return String(fallback ?? '').trim();

    }

    function escapeHtml(value) {

        return String(value || '')

            .replace(/&/g, '&amp;')

            .replace(/</g, '&lt;')

            .replace(/>/g, '&gt;')

            .replace(/"/g, '&quot;')

            .replace(/'/g, '&#39;');

    }

    function clamp(value, min, max) {

        return Math.min(max, Math.max(min, value));

    }

    function getViewportSize() {

        return {

            width: Math.max(960, Math.floor(window.innerWidth || 0)),

            height: Math.max(640, Math.floor(window.innerHeight || 0))

        };

    }

    function getWorkspaceName(workspaceId) {

        const id = text(workspaceId, 'main');

        const config = getConfig();

        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];

        const match = workspaces.find((workspace) => String(workspace?.id || '') === id);

        return text(match?.name, id);

    }

    function getScopeText(scope) {

        if (!scope) return 'Unknown Scope';

        if (scope.scope === 'all') return 'All Tabs / Whole Data Pack';

        if (scope.scope === 'card') return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card');

        if (scope.scope === 'folder') {

            const folderLabel = text(scope.folderLabel, scope.folderId || 'Folder');

            return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card') + ' / ' + folderLabel;

        }

        if (scope.scope === 'derived') {

            return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card') + ' / ' + text(scope.scopeLabel, 'Smart View');

        }

        return getWorkspaceName(scope.workspaceId) + ' / Current Tab';

    }

    function normalizeScope(scopeOption) {

        const config = getConfig();

        const scope = (scopeOption && typeof scopeOption === 'object') ? scopeOption : {};

        const normalized = String(scope.scope || 'workspace').trim();

        return {

            scope: ['all', 'workspace', 'card', 'folder', 'derived'].includes(normalized) ? normalized : 'workspace',

            workspaceId: text(scope.workspaceId, config.activeWorkspace || 'main'),

            categoryName: text(scope.categoryName, ''),

            folderId: text(scope.folderId, ''),

            folderLabel: text(scope.folderLabel, ''),

            scopeLabel: text(scope.scopeLabel, ''),

            linkIds: Array.isArray(scope.linkIds)

                ? scope.linkIds.map((value) => String(value || '').trim()).filter(Boolean)

                : []

        };

    }

    function createNode(options) {

        const source = options || {};

        return {

            id: text(source.id, ''),

            chainId: text(source.chainId, ''),

            label: text(source.label, 'Untitled'),

            color: text(source.color, '#00d4ff'),

            radius: Number.isFinite(source.radius) ? source.radius : 5,

            kind: text(source.kind, 'link'),

            meta: text(source.meta, ''),

            data: source.data && typeof source.data === 'object' ? source.data : {},

            x: Number.isFinite(source.x) ? source.x : 0,

            y: Number.isFinite(source.y) ? source.y : 0,

            vx: Number.isFinite(source.vx) ? source.vx : ((Math.random() - 0.5) * 0.8),

            vy: Number.isFinite(source.vy) ? source.vy : ((Math.random() - 0.5) * 0.8),

            manualAnchor: source.manualAnchor && typeof source.manualAnchor === 'object'

                ? {

                    x: Number.isFinite(source.manualAnchor.x) ? source.manualAnchor.x : 0,

                    y: Number.isFinite(source.manualAnchor.y) ? source.manualAnchor.y : 0

                }

                : null,

            staticAnchor: source.staticAnchor && typeof source.staticAnchor === 'object'

                ? {

                    x: Number.isFinite(source.staticAnchor.x) ? source.staticAnchor.x : 0,

                    y: Number.isFinite(source.staticAnchor.y) ? source.staticAnchor.y : 0

                }

                : null

        };

    }

    function getKindDisplayName(kind) {

        if (kind === 'workspace') return 'Tab';

        if (kind === 'category') return 'Card';

        if (kind === 'link') return 'Bookmark';

        if (kind === 'folder') return 'Folder';

        return text(kind, 'Node');

    }

    function placeOnRing(index, total, radius, centerX, centerY, jitter) {

        const count = Math.max(1, total);

        const angle = ((index % count) / count) * Math.PI * 2;

        const jitterAmount = Number.isFinite(jitter) ? (((index % 7) - 3) * jitter) : 0;

        return {

            x: centerX + Math.cos(angle) * (radius + jitterAmount),

            y: centerY + Math.sin(angle) * (radius + jitterAmount)

        };

    }

    function getAllWorkspaceIds(links) {

        const config = getConfig();

        const ids = new Set();

        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];

        workspaces.forEach((workspace) => ids.add(text(workspace?.id, 'main')));

        links.forEach((link) => ids.add(text(link?.workspace, 'main')));

        if (!ids.size) ids.add(text(config.activeWorkspace, 'main'));

        return Array.from(ids);

    }

    function getScopedLinks(scope) {

        const allLinks = getAllLinks();

        if (scope.scope === 'all') return allLinks.slice();

        if (scope.scope === 'derived') {

            const linkIds = new Set(scope.linkIds || []);

            return allLinks.filter((link) => linkIds.has(String(link?.id || '')));

        }

        const workspaceLinks = allLinks.filter((link) => String(link?.workspace || 'main') === String(scope.workspaceId));

        if (scope.scope === 'card') {

            return workspaceLinks.filter((link) => text(link?.category, 'Unsorted') === text(scope.categoryName, 'Unsorted'));

        }

        if (scope.scope === 'folder') {

            return workspaceLinks.filter((link) => text(link?.category, 'Unsorted') === text(scope.categoryName, 'Unsorted'));

        }

        return workspaceLinks;

    }

    function getCategoryNames(workspaceId, links) {

        const config = getConfig();

        const names = new Set();

        const order = window.EveCategoryOrder?.getOrder
            ? window.EveCategoryOrder.getOrder(workspaceId)
            : (Array.isArray(config.categoryOrder) ? config.categoryOrder : []);

        links.forEach((link) => names.add(text(link?.category, 'Unsorted')));

        const folderStore = window.bookmarkFolders && typeof window.bookmarkFolders === 'object'
            ? window.bookmarkFolders
            : (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object'
                ? window.eveState.bookmarkFolders
                : {});
        Object.keys(folderStore).forEach((scopedKey) => {
            const parts = String(scopedKey || '').split('::');
            const scopedWorkspaceId = text(parts[0], 'main');
            const scopedCategoryName = text(parts[1], '');
            const tree = folderStore[scopedKey];
            if (scopedWorkspaceId !== text(workspaceId, 'main')) return;
            if (!scopedCategoryName) return;
            if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return;
            names.add(scopedCategoryName);
        });

        if (!names.size) return ['Unsorted'];

        const sortedNames = Array.from(names).filter(Boolean);

        sortedNames.sort((left, right) => {

            const idxLeft = order.indexOf(left);

            const idxRight = order.indexOf(right);

            if (idxLeft !== -1 || idxRight !== -1) {

                if (idxLeft === -1) return 1;

                if (idxRight === -1) return -1;

                if (idxLeft !== idxRight) return idxLeft - idxRight;

            }

            return left.localeCompare(right, undefined, { sensitivity: 'base' });

        });

        return sortedNames;

    }

    function getFolderView(workspaceId, categoryName, scopedLinks) {

        const folderApi = window.EveBookmarkFolders;

        if (!folderApi?.buildFolderView) {

            return {

                nodes: [],

                childrenMap: new Map(),

                folderLinks: new Map(),

                rootLinks: Array.isArray(scopedLinks) ? scopedLinks.slice() : []

            };

        }

        const raw = folderApi.buildFolderView(workspaceId, categoryName, Array.isArray(scopedLinks) ? scopedLinks : []);

        const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];

        const realNodes = rawNodes.filter((node) => !node?.isGhost);

        const realIds = new Set(realNodes.map((node) => String(node.id)));

        const childrenMap = new Map();

        const folderLinks = new Map();

        realNodes.forEach((node) => {

            childrenMap.set(String(node.id), []);

            folderLinks.set(String(node.id), []);

        });

        realNodes.forEach((node) => {

            const parentId = node?.parentId ? String(node.parentId) : '';

            if (!parentId || !realIds.has(parentId)) return;

            childrenMap.get(parentId).push(node);

        });

        const rawFolderLinks = raw?.folderLinks instanceof Map ? raw.folderLinks : new Map();

        rawFolderLinks.forEach((links, folderId) => {

            const id = String(folderId || '');

            if (!realIds.has(id)) return;

            folderLinks.set(id, Array.isArray(links) ? links.slice() : []);

        });

        const rootLinks = Array.isArray(raw?.rootLinks)

            ? raw.rootLinks.slice()

            : (Array.isArray(scopedLinks) ? scopedLinks.filter((link) => {

                const folderId = link?.folderId ? String(link.folderId) : '';

                return !folderId || !realIds.has(folderId);

            }) : []);

        const topLevelFolders = realNodes.filter((node) => {

            const parentId = node?.parentId ? String(node.parentId) : '';

            return !parentId || !realIds.has(parentId);
        });

        return {

            nodes: realNodes,

            childrenMap,

            folderLinks,

            rootLinks,

            topLevelFolders

        };

    }

    function collectFolderSubtree(viewModel, folderId) {

        const normalizedId = text(folderId, '');

        if (!normalizedId || !viewModel?.nodes?.length) return null;

        const targetNode = viewModel.nodes.find((node) => String(node?.id || '') === normalizedId);

        if (!targetNode) return null;

        const descendantIds = new Set();

        const stack = [normalizedId];

        while (stack.length) {

            const currentId = stack.pop();

            if (!currentId || descendantIds.has(currentId)) continue;

            descendantIds.add(currentId);

            (viewModel.childrenMap.get(String(currentId)) || []).forEach((childNode) => {

                if (childNode?.id) stack.push(String(childNode.id));

            });

        }

        return {

            targetNode,

            descendantIds,

            childFolders: viewModel.childrenMap.get(normalizedId) || [],

            directLinks: viewModel.folderLinks.get(normalizedId) || []

        };

    }

    const sharedHelpers = ns._sharedHelpers = ns._sharedHelpers || {};

    Object.assign(sharedHelpers, {
        getConfig,
        getAllLinks,
        text,
        escapeHtml,
        clamp,
        getViewportSize,
        getWorkspaceName,
        getScopeText,
        normalizeScope,
        createNode,
        getKindDisplayName,
        placeOnRing,
        getAllWorkspaceIds,
        getScopedLinks,
        getCategoryNames,
        getFolderView,
        collectFolderSubtree
    });

})(window.EveConstellationMap);
