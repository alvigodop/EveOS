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

        motionMode: 'smooth',

        motionAnchors: new Map(),

        lastMotionMode: 'smooth',

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



    function normalizePolarityStrength(value, fallback) {

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {

            return clamp(numeric, 0.2, 1.6);

        }

        return clamp(Number(fallback) || 1, 0.2, 1.6);

    }



    function getPolarityStrengthValue(mode) {

        const key = mode === 'attract' ? 'attract' : 'repel';

        return normalizePolarityStrength(state.polarityStrength?.[key], key === 'attract' ? 0.62 : 0.76);

    }



    function setPolarityStrengthValue(mode, value) {

        const key = mode === 'attract' ? 'attract' : 'repel';

        state.polarityStrength[key] = normalizePolarityStrength(value, getPolarityStrengthValue(key));

        return state.polarityStrength[key];

    }



    function getPolarityStrengthText(mode) {

        return getPolarityStrengthValue(mode).toFixed(2);

    }



    function normalizePolarityMode(value, fallback, allowInherit) {

        const normalized = String(value || '').trim().toLowerCase();

        if (normalized === 'attract' || normalized === 'repel') return normalized;

        if (allowInherit && (normalized === 'inherit' || normalized === '')) return 'inherit';

        return fallback === 'attract' ? 'attract' : 'repel';

    }



    function getKindPolarity(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return 'repel';

        const current = state.kindPolarities?.[normalizedKind];

        if (current === 'attract' || current === 'repel') return current;

        return DEFAULT_KIND_POLARITIES[normalizedKind] || 'repel';

    }



    function getNodePolarityState(node) {

        if (!node?.id) {

            return {

                effective: 'repel',

                nodeOverride: 'inherit',

                kind: 'repel',

                source: 'default'

            };

        }

        const nodeId = String(node.id);

        const nodeOverride = normalizePolarityMode(state.nodePolarities.get(nodeId), 'repel', true);

        const kindPolarity = getKindPolarity(node.kind);

        if (nodeOverride === 'attract' || nodeOverride === 'repel') {

            return {

                effective: nodeOverride,

                nodeOverride,

                kind: kindPolarity,

                source: 'node'

            };

        }

        return {

            effective: kindPolarity,

            nodeOverride: 'inherit',

            kind: kindPolarity,

            source: kindPolarity === (DEFAULT_KIND_POLARITIES[String(node.kind || '')] || 'repel') ? 'default' : 'kind'

        };

    }



    function getEffectivePolarity(node) {

        return getNodePolarityState(node).effective;

    }



    function cycleNodePolarity(node) {

        if (!node?.id) return 'inherit';

        const nodeId = String(node.id);

        const current = normalizePolarityMode(state.nodePolarities.get(nodeId), 'repel', true);

        if (current === 'inherit') {

            state.nodePolarities.set(nodeId, 'attract');

            return 'attract';

        }

        if (current === 'attract') {

            state.nodePolarities.set(nodeId, 'repel');

            return 'repel';

        }

        state.nodePolarities.delete(nodeId);

        return 'inherit';

    }



    function toggleKindPolarity(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return 'repel';

        const next = getKindPolarity(normalizedKind) === 'attract' ? 'repel' : 'attract';

        state.kindPolarities[normalizedKind] = next;

        return next;

    }



    function clearPolarityOverrides() {

        state.kindPolarities = {
            workspace: 'repel',
            category: 'repel',
            folder: 'repel',
            link: 'repel'
        };

        state.polarityStrength = {
            attract: 0.62,
            repel: 0.76
        };

        state.nodePolarities = new Map();

    }



    function getPolaritySummary() {

        const attractKinds = Object.entries(state.kindPolarities || {})
            .filter(([, value]) => value === 'attract')
            .map(([kind]) => kind);

        const visibleNodeIds = new Set((Array.isArray(state.nodes) ? state.nodes : []).map((node) => String(node?.id || '')).filter(Boolean));

        let nodeOverrideCount = 0;

        state.nodePolarities.forEach((value, nodeId) => {

            if (!visibleNodeIds.has(String(nodeId || ''))) return;

            if (normalizePolarityMode(value, 'repel', true) === 'inherit') return;

            nodeOverrideCount += 1;

        });

        return {
            attractKinds,
            nodeOverrideCount,
            total: attractKinds.length + nodeOverrideCount
        };

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



    function hasResolvedCover(link) {

        return !!getResolvedLinkCover(link);

    }



    function getLinkColor(link) {

        if (link?.done) return '#6e7583';

        if (hasResolvedCover(link)) return '#42c9ff';

        if (Array.isArray(link?.tags) && link.tags.length) return '#7ee787';

        return '#00d4ff';

    }



    function getLinkMeta(workspaceId, categoryName, link) {

        const folderApi = window.EveBookmarkFolders;

        const folderName = folderApi?.getFolderNameForLink ? folderApi.getFolderNameForLink(link) : '';

        const segments = [getWorkspaceName(workspaceId), text(categoryName, 'Unsorted')];

        if (folderName) segments.push(folderName);

        const host = text((() => {

            try {

                return new URL(text(link?.url, '')).hostname.replace(/^www\./i, '');

            } catch (error) {

                return '';

            }

        })(), '');

        if (host) segments.push(host);

        return segments.join(' / ');

    }



    function getLinkById(linkId) {

        if (!linkId) return null;

        return getAllLinks().find((link) => String(link?.id || '') === String(linkId)) || null;

    }



    function getLinkedLibraryEntry(link) {

        if (!link?.id) return null;

        const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(link.id);

        return linked?.entry || null;

    }



    function getResolvedLinkCover(link) {

        if (!link) return '';

        const libraryEntry = getLinkedLibraryEntry(link);

        const fallbackImage = text(libraryEntry?.image, '') || text(libraryEntry?.imageUrl, '');

        const coverApi = window.EveBookmarkCovers;

        if (coverApi?.getDisplayCover) {

            return text(coverApi.getDisplayCover(link, fallbackImage), '');

        }

        return text(link?.coverImage, '') || fallbackImage;

    }



    function getFolderScopeLinks(workspaceId, categoryName, folderId) {

        const folderApi = window.EveBookmarkFolders;

        if (!folderApi?.buildFolderView || !folderId) return [];

        const categoryLinks = getAllLinks().filter((link) => (

            String(link?.workspace || 'main') === String(workspaceId || 'main')

            && text(link?.category, 'Unsorted') === text(categoryName, 'Unsorted')

        ));

        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks);

        const subtree = collectFolderSubtree(viewModel, folderId);

        if (!subtree) return [];

        const gathered = [];

        const visit = (folderNode) => {

            const currentId = String(folderNode?.id || '');

            (viewModel.folderLinks.get(currentId) || []).forEach((link) => gathered.push(link));

            (viewModel.childrenMap.get(currentId) || []).forEach((childNode) => visit(childNode));

        };

        (subtree.directLinks || []).forEach((link) => gathered.push(link));

        (subtree.childFolders || []).forEach((childNode) => visit(childNode));

        return gathered;

    }



    function getNodeCoverCandidates(node) {

        if (!node) return [];

        const cachedCovers = Array.isArray(node?.data?.coverCandidates)
            ? node.data.coverCandidates.map((value) => text(value, '')).filter(Boolean)
            : [];
        if (cachedCovers.length) return cachedCovers;

        if (node.kind === 'link') {

            return [getNodeCoverUrl({ ...node, kind: 'link' })].filter(Boolean);

        }



        let scopedLinks = [];

        if (node.kind === 'category') {

            scopedLinks = getAllLinks().filter((link) => (

                String(link?.workspace || 'main') === String(node?.data?.workspaceId || 'main')

                && text(link?.category, 'Unsorted') === text(node?.data?.categoryName, 'Unsorted')

            ));

        } else if (node.kind === 'workspace') {

            scopedLinks = getAllLinks().filter((link) => String(link?.workspace || 'main') === String(node?.data?.workspaceId || 'main'));

        } else if (node.kind === 'folder') {

            scopedLinks = getFolderScopeLinks(node?.data?.workspaceId, node?.data?.categoryName, node?.data?.folderId);

        }



        const covers = [];

        const seen = new Set();

        scopedLinks.forEach((link) => {

            const cover = getResolvedLinkCover(link);

            if (!cover || seen.has(cover)) return;

            seen.add(cover);

            covers.push(cover);

        });

        return covers;

    }



    function shuffleCoverCandidates(values) {

        const next = Array.isArray(values) ? values.slice() : [];

        for (let index = next.length - 1; index > 0; index--) {

            const swapIndex = Math.floor(Math.random() * (index + 1));

            const temp = next[index];

            next[index] = next[swapIndex];

            next[swapIndex] = temp;

        }

        return next;

    }



    function getCoverSessionKey(node, covers) {

        return `${String(node?.id || '')}::${(Array.isArray(covers) ? covers : []).join('\n')}`;

    }



    function ensureCoverPreviewSession(node, options = {}) {

        const covers = getNodeCoverCandidates(node);

        const interval = getNodeCoverRotationInterval(node);

        if (!covers.length || !interval) {

            state.coverPreviewSession = null;

            return covers;

        }



        const sessionKey = getCoverSessionKey(node, covers);

        const shouldReset = !!options.reset;

        const existing = state.coverPreviewSession;

        if (!shouldReset && existing?.key === sessionKey && Array.isArray(existing.covers) && existing.covers.length) {

            return existing.covers;

        }



        const randomized = shuffleCoverCandidates(covers);

        state.coverPreviewSession = {

            key: sessionKey,

            covers: randomized,

            startedAt: state.infoHovered ? Date.now() : 0,

            elapsedMs: 0

        };

        return randomized;

    }



    function getNodeCoverRotationInterval(node) {

        if (!node) return 0;

        if (node.kind === 'workspace') return 30000;

        if (node.kind === 'category') return 60000;

        return 0;

    }



    function getNodeCoverUrl(node) {

        if (!node) return '';

        if (node.kind === 'link') {

            const link = getLinkById(node?.data?.linkId);

            return getResolvedLinkCover(link);

        }

        const interval = getNodeCoverRotationInterval(node);

        const covers = interval ? ensureCoverPreviewSession(node) : getNodeCoverCandidates(node);

        if (!covers.length) return '';

        if (!interval) return covers[0];

        const baseElapsed = Math.max(0, Number(state.coverPreviewSession?.elapsedMs || 0));

        const hoverElapsed = state.infoHovered

            ? Math.max(0, Date.now() - Number(state.coverPreviewSession?.startedAt || Date.now()))

            : 0;

        const elapsed = baseElapsed + hoverElapsed;

        const index = Math.floor(elapsed / interval) % covers.length;

        return covers[index] || covers[0];

    }



    function clearInspectorCoverRotation() {

        if (state.coverRotationTimer) {

            window.clearTimeout(state.coverRotationTimer);

            state.coverRotationTimer = 0;

        }

    }



    function scheduleInspectorCoverRotation() {

        clearInspectorCoverRotation();

        if (!state.infoHovered) return;

        const node = state.selected || state.hovered;

        const interval = getNodeCoverRotationInterval(node);

        const covers = getNodeCoverCandidates(node);

        if (!interval || covers.length < 2) return;

        const elapsed = Math.max(0, Date.now() - (state.infoHoverStartedAt || Date.now()));

        const nextDelay = interval - (elapsed % interval) + 20;

        state.coverRotationTimer = window.setTimeout(() => {

            if (typeof state.renderInspector === 'function') state.renderInspector();

            scheduleInspectorCoverRotation();

        }, nextDelay);

    }



    function resetStaticLocks() {

        state.staticNodeIds = new Set();

        state.staticKinds = new Set();

        state.staticBranchRoots = new Map();

        state.staticBranchNodeIds = new Set();

        state.nodes.forEach((node) => {

            if (!node) return;

            node.staticAnchor = null;

        });

    }



    function getStaticStateForNode(node) {

        if (!node?.id) {

            return { isStatic: false, nodeLocked: false, kindLocked: false, branchLocked: false, source: '' };

        }

        const nodeLocked = state.staticNodeIds.has(String(node.id));

        const kindLocked = state.staticKinds.has(String(node.kind || ''));

        const branchLocked = state.staticBranchNodeIds.has(String(node.id));

        return {

            isStatic: nodeLocked || branchLocked || kindLocked,

            nodeLocked,

            kindLocked,

            branchLocked,

            source: nodeLocked ? 'node' : (branchLocked ? 'branch' : (kindLocked ? 'kind' : ''))

        };

    }



    function isNodeStatic(node) {

        return getStaticStateForNode(node).isStatic;

    }



    function setStaticAnchor(node, position) {

        if (!node) return null;

        const target = position && typeof position === 'object' ? position : node;

        node.staticAnchor = {

            x: Number.isFinite(target?.x) ? Number(target.x) : 0,

            y: Number.isFinite(target?.y) ? Number(target.y) : 0

        };

        return node.staticAnchor;

    }



    function toggleStaticForNode(node) {

        if (!node?.id) return false;

        const key = String(node.id);

        if (state.staticNodeIds.has(key)) {

            state.staticNodeIds.delete(key);

            if (!state.staticKinds.has(String(node.kind || '')) && !state.staticBranchNodeIds.has(key)) {

                node.staticAnchor = null;

            }

            return false;

        }

        setStaticAnchor(node);

        state.staticNodeIds.add(key);

        return true;

    }



    function toggleStaticForKind(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return false;

        if (state.staticKinds.has(normalizedKind)) {

            state.staticKinds.delete(normalizedKind);

            state.nodes.forEach((node) => {

                if (!node || String(node.kind || '') !== normalizedKind) return;

                const nodeId = String(node.id || '');

                if (!state.staticNodeIds.has(nodeId) && !state.staticBranchNodeIds.has(nodeId)) {

                    node.staticAnchor = null;

                }

            });

            return false;

        }

        state.staticKinds.add(normalizedKind);

        state.nodes.forEach((node) => {

            if (!node || String(node.kind || '') !== normalizedKind) return;

            state.staticNodeIds.delete(String(node.id || ''));

            setStaticAnchor(node);

        });

        return true;

    }



    function recomputeStaticBranchNodeIds() {

        const next = new Set();

        state.staticBranchRoots.forEach((ids) => {

            (ids || []).forEach((id) => {

                if (id) next.add(String(id));

            });

        });

        state.staticBranchNodeIds = next;

    }



    function getStaticBranchIds(rootNode) {

        if (!rootNode?.id) return [];

        const rootId = String(rootNode.id);

        const ids = new Set([rootId]);

        let changed = true;

        while (changed) {

            changed = false;

            state.nodes.forEach((node) => {

                if (!node || node.kind === 'link') return;

                const nodeId = String(node.id || '');

                if (!nodeId || ids.has(nodeId)) return;

                const parentId = text(node?.data?.anchorNodeId, '');

                if (parentId && ids.has(parentId)) {

                    ids.add(nodeId);

                    changed = true;

                }

            });

        }

        return Array.from(ids.values());

    }



    function toggleStaticBranch(rootNode) {

        if (!rootNode?.id) return false;

        const rootId = String(rootNode.id);

        if (state.staticBranchRoots.has(rootId)) {

            const previousIds = state.staticBranchRoots.get(rootId) || [];

            state.staticBranchRoots.delete(rootId);

            recomputeStaticBranchNodeIds();

            previousIds.forEach((nodeId) => {

                const targetNode = state.nodeIndex.get(String(nodeId));

                if (!targetNode) return;

                const targetState = getStaticStateForNode(targetNode);

                if (!targetState.nodeLocked && !targetState.kindLocked && !targetState.branchLocked) {

                    targetNode.staticAnchor = null;

                }

            });

            return false;

        }

        const branchIds = getStaticBranchIds(rootNode);

        state.staticBranchRoots.set(rootId, branchIds);

        recomputeStaticBranchNodeIds();

        branchIds.forEach((nodeId) => {

            const targetNode = state.nodeIndex.get(String(nodeId));

            if (!targetNode) return;

            setStaticAnchor(targetNode);

        });

        return true;

    }



    function isStaticBranchRoot(node) {

        if (!node?.id) return false;

        return state.staticBranchRoots.has(String(node.id));

    }



    function clearStaticLocks() {

        state.staticNodeIds.clear();

        state.staticKinds.clear();

        state.staticBranchRoots.clear();

        state.staticBranchNodeIds.clear();

        state.nodes.forEach((node) => {

            if (!node) return;

            node.staticAnchor = null;

        });

    }



    function getStaticSummary() {

        return {

            nodeCount: state.staticNodeIds.size,

            kinds: Array.from(state.staticKinds.values()),

            branchCount: state.staticBranchRoots.size,

            total: state.staticNodeIds.size + state.staticKinds.size + state.staticBranchRoots.size

        };

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

        getKindDisplayName,

        getKindPolarity,

        getNodePolarityState,

        getEffectivePolarity,

        cycleNodePolarity,

        toggleKindPolarity,

        getPolarityStrengthValue,

        setPolarityStrengthValue,

        getPolarityStrengthText,

        clearPolarityOverrides,

        getPolaritySummary,

        placeOnRing,

        getAllWorkspaceIds,

        getScopedLinks,

        getCategoryNames,

        getFolderView,

        collectFolderSubtree,

        addNode,

        addEdge,

        hasResolvedCover,

        getLinkColor,

        getLinkMeta,

        getLinkById,

        getLinkedLibraryEntry,

        getResolvedLinkCover,

        getFolderScopeLinks,

        getNodeCoverCandidates,

        shuffleCoverCandidates,

        getCoverSessionKey,

        ensureCoverPreviewSession,

        getNodeCoverRotationInterval,

        getNodeCoverUrl,

        clearInspectorCoverRotation,

        scheduleInspectorCoverRotation,

        resetStaticLocks,

        getStaticStateForNode,

        isNodeStatic,

        setStaticAnchor,

        toggleStaticForNode,

        toggleStaticForKind,

        toggleStaticBranch,

        isStaticBranchRoot,

        clearStaticLocks,

        getStaticSummary

    });

})(window.EveConstellationMap);

