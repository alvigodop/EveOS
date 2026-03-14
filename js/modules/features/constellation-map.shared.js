window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const state = {

        container: null,

        canvas: null,

        ctx: null,

        titleEl: null,

        scopeEl: null,

        statsEl: null,

        infoEl: null,

        findInput: null,

        nodes: [],

        nodeIndex: new Map(),

        edges: [],

        edgeKeys: new Set(),

        scope: null,

        running: false,

        animationFrameId: 0,

        bound: false,

        resizeHandler: null,

        keyHandler: null,

        hovered: null,

        selected: null,

        labelsVisible: true,

        transform: { scale: 1, tx: 0, ty: 0 },

        fitTransform: { scale: 1, tx: 0, ty: 0 },

        pointer: {

            mode: 'idle',

            startX: 0,

            startY: 0,

            baseTx: 0,

            baseTy: 0,

            node: null,

            moved: false,

            forcePan: false,

            canvasX: 0,

            canvasY: 0,

            lastWorldX: 0,

            lastWorldY: 0,

            releaseVx: 0,

            releaseVy: 0

        },

        lastClickAt: 0,

        lastClickNodeId: '',

        searchState: {

            query: '',

            index: -1,

            matches: []

        },

        motionMode: 'web',

        motionAnchors: new Map(),

        lastMotionMode: 'web',

        controlsExpanded: false,

        labelMode: 'auto',

        labelHitBoxes: [],

        infoCollapsed: true,

        infoHovered: false,

        infoHoverStartedAt: 0,

        coverRotationTimer: 0,

        coverPreviewSession: null,

        kindPolarities: {
            workspace: 'repel',
            category: 'repel',
            folder: 'repel',
            link: 'repel'
        },

        polarityStrength: {
            attract: 0.62,
            repel: 0.76
        },

        motionTuning: {
            repulsion: 1,
            centerPull: 1,
            spring: 1,
            hierarchy: 1,
            folderRecovery: 1,
            damping: 1,
            speed: 1,
            tether: 1
        },

        nodePolarities: new Map(),

        staticNodeIds: new Set(),

        staticKinds: new Set(),

        staticBranchRoots: new Map(),

        staticBranchNodeIds: new Set(),

        worldAnchor: { x: 0, y: 0 },

        worldBounds: null,

        worldRadius: 0

    };

    const MAP_PADDING = 48;

    const MAX_TAG_EDGES_PER_CLUSTER = 12;

    const LINK_LABEL_LIMIT = 90;

    const DOUBLE_CLICK_MS = 320;

    const MAX_VIEW_SCALE = 6;

    const FIT_MAX_SCALE = 3.2;

    const LABEL_MODE_ORDER = ['auto', 'all', 'focus', 'off'];

    const MOTION_MODE_ORDER = ['smooth', 'slow', 'web', 'free'];

    const LABEL_CURSOR_RADIUS = 170;

    const LABEL_FOCUS_LIMIT = 12;

    const KIND_ORDER = Object.freeze(['workspace', 'category', 'folder', 'link']);

    const DEFAULT_KIND_POLARITIES = Object.freeze({
        workspace: 'repel',
        category: 'repel',
        folder: 'repel',
        link: 'repel'
    });

    const MOTION_TUNING_FIELDS = Object.freeze([
        { key: 'repulsion', label: 'Repel Field', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'centerPull', label: 'Center Pull', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'spring', label: 'Spring', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'hierarchy', label: 'Hierarchy', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'folderRecovery', label: 'Folder Settle', min: 0, max: 3, step: 0.01, defaultValue: 1 },
        { key: 'damping', label: 'Damping', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'speed', label: 'Speed', min: 0, max: 2, step: 0.01, defaultValue: 1 },
        { key: 'tether', label: 'World Tether', min: 0, max: 3, step: 0.01, defaultValue: 1 }
    ]);

    function getMotionTuningField(key) {

        const normalizedKey = String(key || '').trim();

        return MOTION_TUNING_FIELDS.find((field) => field.key === normalizedKey) || null;

    }

    function normalizeMotionTuningValue(key, value) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, field.min, field.max);

        }

        return field.defaultValue;

    }

    function getMotionTuningValue(key) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        return normalizeMotionTuningValue(field.key, state.motionTuning?.[field.key]);

    }

    function setMotionTuningValue(key, value) {

        const field = getMotionTuningField(key);

        if (!field) return 1;

        if (!state.motionTuning || typeof state.motionTuning !== 'object') {

            state.motionTuning = {};

        }

        state.motionTuning[field.key] = normalizeMotionTuningValue(field.key, value);

        return state.motionTuning[field.key];

    }

    function getMotionTuningText(key) {

        return getMotionTuningValue(key).toFixed(2);

    }

    function resetMotionTuning() {

        state.motionTuning = {};

        MOTION_TUNING_FIELDS.forEach((field) => {

            state.motionTuning[field.key] = field.defaultValue;

        });

    }

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

    function getLabelModeText() {

        if (state.labelMode === 'all') return 'Labels: All';

        if (state.labelMode === 'focus') return 'Labels: Focus';

        if (state.labelMode === 'off') return 'Labels: Off';

        return 'Labels: Auto';

    }

    function getMotionModeText() {

        if (state.motionMode === 'slow') return 'Motion: Slow';

        if (state.motionMode === 'web') return 'Motion: Web';

        if (state.motionMode === 'free') return 'Motion: Free';

        return 'Motion: Smooth';

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

        const order = Array.isArray(config.categoryOrder) ? config.categoryOrder : [];

        links.forEach((link) => names.add(text(link?.category, 'Unsorted')));

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

    function addNode(node) {

        if (!node?.id) return null;

        const existing = state.nodeIndex.get(String(node.id));

        if (existing) return existing;

        state.nodes.push(node);

        state.nodeIndex.set(String(node.id), node);

        return node;

    }

    function addEdge(source, target, type) {

        if (!source || !target || source.id === target.id) return;

        const edgeType = text(type, 'hierarchy');

        const edgeKey = source.id + '|' + target.id + '|' + edgeType;

        if (state.edgeKeys.has(edgeKey)) return;

        state.edgeKeys.add(edgeKey);

        state.edges.push({ source, target, type: edgeType });

    }

    const shared = ns._shared = ns._shared || {};

    Object.assign(shared, {

        state,

        KIND_ORDER,

        MAP_PADDING,

        MAX_TAG_EDGES_PER_CLUSTER,

        LINK_LABEL_LIMIT,

        DOUBLE_CLICK_MS,

        MAX_VIEW_SCALE,

        FIT_MAX_SCALE,

        LABEL_MODE_ORDER,

        MOTION_MODE_ORDER,

        MOTION_TUNING_FIELDS,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

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

        getLabelModeText,

        getMotionModeText,

        getMotionTuningField,

        getMotionTuningValue,

        setMotionTuningValue,

        getMotionTuningText,

        resetMotionTuning,

        getKindDisplayName,

        placeOnRing,

        getAllWorkspaceIds,

        getScopedLinks,

        getCategoryNames,

        getFolderView,

        collectFolderSubtree,

        addNode,

        addEdge

    });

})(window.EveConstellationMap);

