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
            canvasY: 0
        },
        lastClickAt: 0,
        lastClickNodeId: '',
        searchState: {
            query: '',
            index: -1,
            matches: []
        },
        labelMode: 'auto',
        labelHitBoxes: [],
        infoCollapsed: true,
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
    const LABEL_CURSOR_RADIUS = 170;
    const LABEL_FOCUS_LIMIT = 12;

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
        return getWorkspaceName(scope.workspaceId) + ' / Current Tab';
    }

    function normalizeScope(scopeOption) {
        const config = getConfig();
        const scope = (scopeOption && typeof scopeOption === 'object') ? scopeOption : {};
        const normalized = String(scope.scope || 'workspace').trim();
        return {
            scope: ['all', 'workspace', 'card'].includes(normalized) ? normalized : 'workspace',
            workspaceId: text(scope.workspaceId, config.activeWorkspace || 'main'),
            categoryName: text(scope.categoryName, '')
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
                : null
        };
    }

    function getLabelModeText() {
        if (state.labelMode === 'all') return 'Labels: All';
        if (state.labelMode === 'focus') return 'Labels: Focus';
        if (state.labelMode === 'off') return 'Labels: Off';
        return 'Labels: Auto';
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

        const workspaceLinks = allLinks.filter((link) => String(link?.workspace || 'main') === String(scope.workspaceId));
        if (scope.scope === 'card') {
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

    function addNode(node) {
        if (!node?.id) return null;
        const existing = state.nodes.find((candidate) => candidate.id === node.id);
        if (existing) return existing;
        state.nodes.push(node);
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
        const coverApi = window.EveBookmarkCovers;
        if (coverApi?.resolveLinkCover) return !!coverApi.resolveLinkCover(link);
        return !!text(link?.coverImage, '');
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

    function buildGraphData(scopeOption) {
        const scope = normalizeScope(scopeOption);
        const scopedLinks = getScopedLinks(scope);
        const { width, height } = getViewportSize();
        const centerX = width / 2;
        const centerY = height / 2;
        const tagBuckets = new Map();

        state.scope = scope;
        state.nodes = [];
        state.edges = [];
        state.edgeKeys = new Set();
        state.hovered = null;
        state.selected = null;
        state.searchState = { query: '', index: -1, matches: [] };
        state.infoCollapsed = true;
        state.pointer.forcePan = false;

        function addTagEdges(linkNode, link) {
            if (!Array.isArray(link?.tags)) return;
            link.tags
                .map((tag) => text(tag, ''))
                .filter(Boolean)
                .forEach((tag) => {
                    const key = tag.toLowerCase();
                    if (!tagBuckets.has(key)) tagBuckets.set(key, []);
                    tagBuckets.get(key).push(linkNode);
                });
        }

        function addLinkNode(workspaceId, categoryName, parentNode, link, index, total, radius) {
            const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 6);
            const linkNode = addNode(createNode({
                id: 'link_' + String(link.id),
                label: text(link?.title, 'Bookmark'),
                color: getLinkColor(link),
                radius: 4,
                kind: 'link',
                x: position.x,
                y: position.y,
                meta: getLinkMeta(workspaceId, categoryName, link),
                data: {
                    linkId: String(link.id),
                    workspaceId,
                    categoryName,
                    url: text(link?.url, '')
                }
            }));
            addEdge(linkNode, parentNode, 'hierarchy');
            addTagEdges(linkNode, link);
        }

        function addFolderBranch(workspaceId, categoryName, folderNodeModel, viewModel, parentNode, index, total, radius) {
            const position = placeOnRing(index, Math.max(total, 1), radius, parentNode.x, parentNode.y, 10);
            const folderNode = addNode(createNode({
                id: 'folder_' + workspaceId + '_' + categoryName + '_' + String(folderNodeModel.id),
                label: text(folderNodeModel?.name, 'Folder'),
                color: '#b45eff',
                radius: 8,
                kind: 'folder',
                x: position.x,
                y: position.y,
                meta: getWorkspaceName(workspaceId) + ' / ' + text(categoryName, 'Unsorted') + ' / ' + text(folderNodeModel?.name, 'Folder'),
                data: {
                    workspaceId,
                    categoryName,
                    folderId: String(folderNodeModel.id)
                }
            }));
            addEdge(folderNode, parentNode, 'hierarchy');

            const directLinks = viewModel.folderLinks.get(String(folderNodeModel.id)) || [];
            directLinks.forEach((link, linkIndex) => {
                addLinkNode(workspaceId, categoryName, folderNode, link, linkIndex, directLinks.length, Math.max(40, radius - 20));
            });

            const childFolders = viewModel.childrenMap.get(String(folderNodeModel.id)) || [];
            childFolders.forEach((childFolder, childIndex) => {
                addFolderBranch(workspaceId, categoryName, childFolder, viewModel, folderNode, childIndex, childFolders.length, Math.max(54, radius - 6));
            });
        }

        function addCategoryBranch(workspaceId, categoryName, categoryCenter, parentNode) {
            const categoryLinks = scopedLinks.filter((link) => (
                String(link?.workspace || 'main') === String(workspaceId)
                && text(link?.category, 'Unsorted') === text(categoryName, 'Unsorted')
            ));
            const categoryNode = addNode(createNode({
                id: 'category_' + workspaceId + '_' + categoryName,
                label: text(categoryName, 'Unsorted'),
                color: '#ff4df1',
                radius: 12,
                kind: 'category',
                x: categoryCenter.x,
                y: categoryCenter.y,
                meta: getWorkspaceName(workspaceId) + ' / ' + categoryLinks.length + ' bookmark' + (categoryLinks.length === 1 ? '' : 's'),
                data: {
                    workspaceId,
                    categoryName
                }
            }));
            if (parentNode) addEdge(categoryNode, parentNode, 'hierarchy');

            const viewModel = getFolderView(workspaceId, categoryName, categoryLinks);
            (viewModel.topLevelFolders || []).forEach((folderNodeModel, index) => {
                addFolderBranch(workspaceId, categoryName, folderNodeModel, viewModel, categoryNode, index, viewModel.topLevelFolders.length, 78);
            });
            (viewModel.rootLinks || []).forEach((link, index) => {
                addLinkNode(workspaceId, categoryName, categoryNode, link, index, viewModel.rootLinks.length, 66);
            });
        }

        if (scope.scope === 'all') {
            const workspaceIds = getAllWorkspaceIds(scopedLinks);
            workspaceIds.forEach((workspaceId, workspaceIndex) => {
                const workspaceLinks = scopedLinks.filter((link) => String(link?.workspace || 'main') === String(workspaceId));
                const workspacePosition = placeOnRing(workspaceIndex, workspaceIds.length, Math.min(width, height) * 0.22, centerX, centerY, 18);
                const workspaceNode = addNode(createNode({
                    id: 'workspace_' + workspaceId,
                    label: getWorkspaceName(workspaceId),
                    color: '#ffd166',
                    radius: 15,
                    kind: 'workspace',
                    x: workspacePosition.x,
                    y: workspacePosition.y,
                    meta: workspaceLinks.length + ' bookmark' + (workspaceLinks.length === 1 ? '' : 's'),
                    data: { workspaceId }
                }));
                const categories = getCategoryNames(workspaceId, workspaceLinks);
                categories.forEach((categoryName, categoryIndex) => {
                    const categoryCenter = placeOnRing(categoryIndex, categories.length, 128 + ((categoryIndex % 4) * 12), workspaceNode.x, workspaceNode.y, 10);
                    addCategoryBranch(workspaceId, categoryName, categoryCenter, workspaceNode);
                });
            });
        } else if (scope.scope === 'card') {
            addCategoryBranch(
                scope.workspaceId,
                text(scope.categoryName, 'Unsorted'),
                { x: centerX, y: centerY },
                null
            );
        } else {
            const categories = getCategoryNames(scope.workspaceId, scopedLinks);
            categories.forEach((categoryName, categoryIndex) => {
                const categoryCenter = placeOnRing(categoryIndex, categories.length, Math.min(width, height) * 0.24, centerX, centerY, 16);
                addCategoryBranch(scope.workspaceId, categoryName, categoryCenter, null);
            });
        }

        tagBuckets.forEach((bucketNodes) => {
            const uniqueNodes = Array.from(new Set(bucketNodes));
            if (uniqueNodes.length < 2) return;
            const anchor = uniqueNodes[0];
            const maxEdges = Math.min(uniqueNodes.length - 1, MAX_TAG_EDGES_PER_CLUSTER);
            for (let index = 1; index <= maxEdges; index += 1) {
                addEdge(anchor, uniqueNodes[index], 'tag');
            }
        });

        initializeWorldField(centerX, centerY);
        renderHeader();
        renderInspector();
        fitToGraph();
    }

    function initializeWorldField(centerX, centerY) {
        const bounds = getGraphBounds();
        const viewport = state.canvas
            ? { width: state.canvas.width, height: state.canvas.height }
            : getViewportSize();
        const anchorX = Number.isFinite(centerX) ? centerX : ((bounds.minX + bounds.maxX) / 2);
        const anchorY = Number.isFinite(centerY) ? centerY : ((bounds.minY + bounds.maxY) / 2);
        const spreadBoost = Math.max(320, Math.sqrt(Math.max(state.nodes.length, 1)) * 44);
        const radius = Math.max(
            viewport.width * 2.9,
            viewport.height * 2.9,
            (Math.max(bounds.width, bounds.height) * 1.75) + spreadBoost
        );

        state.worldAnchor = { x: anchorX, y: anchorY };
        state.worldRadius = radius;
        state.worldBounds = {
            minX: anchorX - radius,
            maxX: anchorX + radius,
            minY: anchorY - radius,
            maxY: anchorY + radius
        };
    }

    function getGraphBounds() {
        if (!state.nodes.length) {
            const { width, height } = getViewportSize();
            return {
                minX: width / 2 - 40,
                minY: height / 2 - 40,
                maxX: width / 2 + 40,
                maxY: height / 2 + 40,
                width: 80,
                height: 80
            };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        state.nodes.forEach((node) => {
            minX = Math.min(minX, node.x - node.radius);
            minY = Math.min(minY, node.y - node.radius);
            maxX = Math.max(maxX, node.x + node.radius);
            maxY = Math.max(maxY, node.y + node.radius);
        });

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        };
    }

    function fitToGraph() {
        if (!state.canvas) return;
        const bounds = getGraphBounds();
        const availableWidth = Math.max(280, state.canvas.width - (MAP_PADDING * 2));
        const availableHeight = Math.max(220, state.canvas.height - (MAP_PADDING * 2));
        const scale = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), 0.42, FIT_MAX_SCALE);
        const tx = ((state.canvas.width - (bounds.width * scale)) / 2) - (bounds.minX * scale);
        const ty = ((state.canvas.height - (bounds.height * scale)) / 2) - (bounds.minY * scale);
        state.fitTransform = { scale, tx, ty };
        state.transform = { scale, tx, ty };
        requestDraw();
    }

    function setTransform(scale, tx, ty) {
        state.transform.scale = clamp(scale, 0.42, MAX_VIEW_SCALE);
        state.transform.tx = tx;
        state.transform.ty = ty;
        requestDraw();
    }

    function resetView() {
        state.transform = {
            scale: state.fitTransform.scale,
            tx: state.fitTransform.tx,
            ty: state.fitTransform.ty
        };
        requestDraw();
    }

    function centerOnNode(node, targetScale) {
        if (!node || !state.canvas) return;
        const scale = clamp(targetScale || state.transform.scale, 0.42, MAX_VIEW_SCALE);
        const tx = (state.canvas.width / 2) - (node.x * scale);
        const ty = (state.canvas.height / 2) - (node.y * scale);
        setTransform(scale, tx, ty);
    }

    function worldPointFromClient(clientX, clientY) {
        if (!state.canvas) return { x: 0, y: 0 };
        const rect = state.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - state.transform.tx) / state.transform.scale,
            y: (clientY - rect.top - state.transform.ty) / state.transform.scale
        };
    }

    function canvasPointFromClient(clientX, clientY) {
        if (!state.canvas) return { x: 0, y: 0 };
        const rect = state.canvas.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function zoomAt(factor, clientX, clientY) {
        if (!state.canvas) return;
        const rect = state.canvas.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX = (localX - state.transform.tx) / state.transform.scale;
        const worldY = (localY - state.transform.ty) / state.transform.scale;
        const nextScale = clamp(state.transform.scale * factor, 0.42, MAX_VIEW_SCALE);
        const nextTx = localX - (worldX * nextScale);
        const nextTy = localY - (worldY * nextScale);
        setTransform(nextScale, nextTx, nextTy);
    }

    function getHitNode(clientX, clientY) {
        const point = canvasPointFromClient(clientX, clientY);
        let bestNode = null;
        let bestScore = Infinity;
        for (let index = state.nodes.length - 1; index >= 0; index -= 1) {
            const node = state.nodes[index];
            const screenPoint = getScreenPoint(node);
            const dx = point.x - screenPoint.x;
            const dy = point.y - screenPoint.y;
            const minPixelRadius = node.kind === 'workspace'
                ? 34
                : node.kind === 'category'
                    ? 30
                    : node.kind === 'folder'
                        ? 24
                        : 18;
            const radius = Math.max((node.radius * state.transform.scale) + 10, minPixelRadius);
            const distSq = (dx * dx) + (dy * dy);
            if (distSq <= (radius * radius)) {
                const kindBias = node.kind === 'link' ? 1 : 0.72;
                const score = (distSq / Math.max(radius, 1)) * kindBias;
                if (score < bestScore) {
                    bestNode = node;
                    bestScore = score;
                }
            }
        }
        if (!bestNode) {
            let nearestNode = null;
            let nearestScore = Infinity;
            for (let index = state.nodes.length - 1; index >= 0; index -= 1) {
                const node = state.nodes[index];
                const screenPoint = getScreenPoint(node);
                const dx = point.x - screenPoint.x;
                const dy = point.y - screenPoint.y;
                const distSq = (dx * dx) + (dy * dy);
                if (distSq < nearestScore && distSq <= (30 * 30)) {
                    nearestNode = node;
                    nearestScore = distSq;
                }
            }
            if (nearestNode) return nearestNode;
        }
        if (bestNode) return bestNode;

        for (let index = state.labelHitBoxes.length - 1; index >= 0; index -= 1) {
            const box = state.labelHitBoxes[index];
            if (
                point.x >= box.left
                && point.x <= box.right
                && point.y >= box.top
                && point.y <= box.bottom
            ) {
                return box.node;
            }
        }
        return null;
    }

    function getPrimaryAction(node) {
        if (!node) return null;
        if (node.kind === 'link') {
            return { label: 'Open Bookmark', action: 'open-link' };
        }
        if (node.kind === 'workspace') {
            return { label: 'Open Tab', action: 'open-workspace' };
        }
        if (node.kind === 'category') {
            return { label: 'Open Card', action: 'open-category' };
        }
        return { label: 'Center Node', action: 'center-node' };
    }

    function activateNode(node) {
        if (!node) return;
        const data = node.data || {};

        if (node.kind === 'link' && data.linkId && typeof window.openBookmarkFromDashboard === 'function') {
            window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, data.linkId);
            ns.closeMap();
            return;
        }

        if (node.kind === 'workspace' && data.workspaceId && typeof window.switchWorkspace === 'function') {
            window.switchWorkspace(data.workspaceId);
            ns.closeMap();
            return;
        }

        if (node.kind === 'category' && data.categoryName) {
            if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {
                window.switchWorkspace(data.workspaceId);
            }
            if (typeof window.setFocus === 'function') {
                window.setFocus(data.categoryName);
                ns.closeMap();
                return;
            }
        }

        centerOnNode(node, Math.max(state.transform.scale, 1.2));
    }

    function renderHeader() {
        if (!state.titleEl || !state.scopeEl || !state.statsEl) return;
        state.titleEl.textContent = 'NEURAL CORE :: CONSTELLATION MAP';
        state.scopeEl.textContent = getScopeText(state.scope);
        state.statsEl.textContent = state.nodes.length + ' nodes - ' + state.edges.length + ' edges';
    }

    function getNodeAnchor(node) {
        if (node?.manualAnchor && Number.isFinite(node.manualAnchor.x) && Number.isFinite(node.manualAnchor.y)) {
            return node.manualAnchor;
        }
        return state.worldAnchor || { x: 0, y: 0 };
    }

    function renderInspector() {
        if (!state.infoEl) return;
        const targetNode = state.selected || state.hovered;
        const headerLabel = targetNode ? targetNode.label : 'Map Inspector';
        const headerKind = targetNode ? targetNode.kind : 'overview';
        const toggleLabel = state.infoCollapsed ? 'Expand' : 'Collapse';
        const header = [
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">',
            '<div style="min-width:0;flex:1;">',
            '<div style="font-size:0.96rem;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(headerLabel) + '</div>',
            '<div style="font-size:0.72rem;opacity:0.72;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">' + escapeHtml(headerKind) + '</div>',
            '</div>',
            '<button type="button" data-map-info-toggle="1" style="border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;white-space:nowrap;">' + escapeHtml(toggleLabel) + '</button>',
            '</div>'
        ].join('');

        if (!targetNode) {
            state.infoEl.innerHTML = [
                header,
                state.infoCollapsed
                    ? ''
                    : '<div style="font-size:0.82rem;opacity:0.78;line-height:1.45;margin-top:10px;">'
                        + 'Drag the background to pan. Use the mouse wheel to zoom. Drag nodes to reorganize the field. Double-click a bookmark to open it.'
                        + '</div>'
            ].join('');
            return;
        }

        const primaryAction = getPrimaryAction(targetNode);
        const actionRow = primaryAction
            ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'
                + '<button type="button" data-map-action="primary" style="border:1px solid rgba(0,212,255,0.32);background:rgba(0,212,255,0.12);color:#eafcff;border-radius:10px;padding:8px 12px;cursor:pointer;">' + escapeHtml(primaryAction.label) + '</button>'
                + '<button type="button" data-map-action="center" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Center</button>'
                + '</div>'
            : '';

        state.infoEl.innerHTML = [
            header,
            state.infoCollapsed
                ? '<div style="font-size:0.74rem;opacity:0.68;margin-top:8px;">' + escapeHtml(getScopeText(state.scope)) + '</div>'
                : [
                    '<div style="font-size:0.74rem;opacity:0.68;margin-top:8px;">' + escapeHtml(getScopeText(state.scope)) + '</div>',
                    '<div style="font-size:0.82rem;opacity:0.82;line-height:1.45;margin-top:10px;">' + escapeHtml(targetNode.meta || 'No details') + '</div>',
                    actionRow
                ].join('')
        ].join('');
    }

    function requestDraw() {
        if (!state.running) draw();
    }

    function updateCursor() {
        if (!state.canvas) return;
        if (state.pointer.mode === 'pan' || state.pointer.mode === 'node') {
            state.canvas.style.cursor = 'grabbing';
            return;
        }
        state.canvas.style.cursor = state.hovered ? 'pointer' : 'grab';
    }

    function getScreenPoint(node) {
        return {
            x: (node.x * state.transform.scale) + state.transform.tx,
            y: (node.y * state.transform.scale) + state.transform.ty
        };
    }

    function shouldRenderLabel(node, isHovered, isSelected) {
        if (state.labelMode === 'off') return false;
        if (isHovered || isSelected) return true;
        if (node.kind !== 'link') return state.labelMode !== 'off';
        if (state.labelMode === 'focus') return false;
        if (state.labelMode === 'all') return true;
        return true;
    }

    function getAutoLinkLabelBudget() {
        const nodeCount = state.nodes.length;
        const scale = state.transform.scale;
        if (state.labelMode === 'all') return Infinity;
        if (state.labelMode === 'focus') return 0;
        if (nodeCount > 5000) return scale >= 2.8 ? 480 : scale >= 1.85 ? 200 : 90;
        if (nodeCount > 2500) return scale >= 2.6 ? 420 : scale >= 1.7 ? 180 : 80;
        if (nodeCount > 1200) return scale >= 2.4 ? 320 : scale >= 1.55 ? 140 : 60;
        if (nodeCount > 500) return scale >= 2.1 ? 240 : scale >= 1.4 ? 110 : 40;
        if (nodeCount > 220) return scale >= 1.8 ? 170 : scale >= 1.25 ? 90 : 34;
        if (nodeCount > 120) return scale >= 1.45 ? 120 : 56;
        return Infinity;
    }

    function getCursorFocusIds() {
        const focusIds = new Set();
        const pointerX = Number(state.pointer.canvasX);
        const pointerY = Number(state.pointer.canvasY);
        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return focusIds;

        const ranked = [];
        state.nodes.forEach((node) => {
            const point = getScreenPoint(node);
            const dx = point.x - pointerX;
            const dy = point.y - pointerY;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq > (LABEL_CURSOR_RADIUS * LABEL_CURSOR_RADIUS)) return;
            ranked.push({ node, distSq });
        });

        ranked.sort((left, right) => left.distSq - right.distSq);
        ranked.slice(0, LABEL_FOCUS_LIMIT).forEach((entry) => {
            focusIds.add(entry.node.id);
        });
        return focusIds;
    }

    function getLabelBackdropColor(box) {
        if (box.isSelected) return 'rgba(12, 20, 32, 0.82)';
        if (box.isHovered) return 'rgba(8, 18, 30, 0.76)';
        if (box.node.kind === 'link') return 'rgba(6, 12, 22, 0.52)';
        return 'rgba(6, 12, 22, 0.66)';
    }

    function drawRoundedBackdrop(ctx, box) {
        const width = Math.max(12, box.right - box.left);
        const height = Math.max(12, box.bottom - box.top);
        const radius = Math.min(8, Math.max(5, height * 0.38));
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(box.left, box.top, width, height, radius);
        } else {
            ctx.moveTo(box.left + radius, box.top);
            ctx.lineTo(box.right - radius, box.top);
            ctx.quadraticCurveTo(box.right, box.top, box.right, box.top + radius);
            ctx.lineTo(box.right, box.bottom - radius);
            ctx.quadraticCurveTo(box.right, box.bottom, box.right - radius, box.bottom);
            ctx.lineTo(box.left + radius, box.bottom);
            ctx.quadraticCurveTo(box.left, box.bottom, box.left, box.bottom - radius);
            ctx.lineTo(box.left, box.top + radius);
            ctx.quadraticCurveTo(box.left, box.top, box.left + radius, box.top);
        }
        ctx.closePath();
        ctx.fillStyle = getLabelBackdropColor(box);
        ctx.fill();
    }

    function renderLabels(ctx) {
        state.labelHitBoxes = [];
        if (state.labelMode === 'off') return;
        const focusIds = getCursorFocusIds();
        const searchMatchIds = new Set((state.searchState.matches || []).map((match) => match.id));
        const autoLinkBudget = getAutoLinkLabelBudget();

        const candidates = state.nodes.map((node) => {
            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            const isPointerFocused = focusIds.has(node.id);
            const isSearchMatch = searchMatchIds.has(node.id);
            if (!shouldRenderLabel(node, isHovered, isSelected)) return null;
            if (
                state.labelMode === 'focus'
                && node.kind === 'link'
                && !isHovered
                && !isSelected
                && !isPointerFocused
                && !isSearchMatch
            ) {
                return null;
            }

            const point = getScreenPoint(node);
            const fontSize = isSelected || isHovered
                ? 13
                : node.kind === 'workspace'
                    ? 12.5
                    : node.kind === 'category' || node.kind === 'folder'
                        ? 12
                        : (state.labelMode === 'all' ? 10.5 : 10);
            const textX = point.x + (node.radius * state.transform.scale) + 8;
            const textY = point.y + (isHovered || isSelected ? 5 : 4);
            ctx.font = `${fontSize}px sans-serif`;
            const textWidth = ctx.measureText(node.label).width;
            const box = {
                node,
                left: textX - 6,
                right: textX + textWidth + 8,
                top: textY - fontSize - 5,
                bottom: textY + 8,
                fontSize,
                textX,
                textY,
                isHovered,
                isSelected,
                isPointerFocused,
                isSearchMatch,
                priority: (isSelected ? 100 : 0)
                    + (isHovered ? 60 : 0)
                    + (isPointerFocused ? 40 : 0)
                    + (isSearchMatch ? 32 : 0)
                    + (node.kind === 'workspace' ? 40 : 0)
                    + (node.kind === 'category' ? 32 : 0)
                    + (node.kind === 'folder' ? 24 : 0)
                    + Math.min(node.radius, 12)
            };
            return box;
        }).filter(Boolean);

        candidates.sort((left, right) => {
            if (right.priority !== left.priority) return right.priority - left.priority;
            if (left.node.kind === 'link' && right.node.kind !== 'link') return 1;
            if (left.node.kind !== 'link' && right.node.kind === 'link') return -1;
            return left.node.label.localeCompare(right.node.label, undefined, { sensitivity: 'base' });
        });

        const occupied = [];
        let renderedLinkLabels = 0;
        candidates.forEach((box) => {
            if (
                state.labelMode === 'auto'
                && box.node.kind === 'link'
                && !box.isHovered
                && !box.isSelected
                && !box.isPointerFocused
                && !box.isSearchMatch
                && autoLinkBudget !== Infinity
                && renderedLinkLabels >= autoLinkBudget
            ) {
                return;
            }
            const allowOverlap = state.labelMode === 'all'
                ? (box.isHovered || box.isSelected)
                : false;
            if (!allowOverlap && state.labelMode === 'auto') {
                const overlaps = occupied.some((taken) => !(
                    box.right < taken.left
                    || box.left > taken.right
                    || box.bottom < taken.top
                    || box.top > taken.bottom
                ));
                if (overlaps && box.node.kind === 'link' && !box.isHovered && !box.isSelected) {
                    return;
                }
            }

            state.labelHitBoxes.push(box);
            occupied.push(box);
            if (box.node.kind === 'link') renderedLinkLabels += 1;

            const labelOpacity = box.isSelected
                ? 0.98
                : box.isHovered
                    ? 0.94
                    : box.isPointerFocused || box.isSearchMatch
                        ? 0.9
                    : box.node.kind === 'link'
                        ? (state.labelMode === 'all' ? 0.62 : 0.78)
                        : 0.88;
            ctx.font = `${box.fontSize}px sans-serif`;
            ctx.lineJoin = 'round';
            drawRoundedBackdrop(ctx, box);
            ctx.strokeStyle = 'rgba(4, 10, 18, 0.82)';
            ctx.lineWidth = box.isSelected || box.isHovered ? 4.4 : 3.2;
            ctx.shadowBlur = box.isHovered || box.isSelected ? 12 : 6;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.strokeText(box.node.label, box.textX, box.textY);
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(255,255,255,${labelOpacity})`;
            ctx.fillText(box.node.label, box.textX, box.textY);
        });
    }

    function draw() {
        if (!state.ctx || !state.canvas) return;
        const ctx = state.ctx;
        ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        ctx.save();
        ctx.translate(state.transform.tx, state.transform.ty);
        ctx.scale(state.transform.scale, state.transform.scale);

        state.edges.forEach((edge) => {
            ctx.beginPath();
            ctx.moveTo(edge.source.x, edge.source.y);
            ctx.lineTo(edge.target.x, edge.target.y);
            ctx.strokeStyle = edge.type === 'tag' ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 212, 255, 0.28)';
            ctx.lineWidth = edge.type === 'tag' ? (0.9 / state.transform.scale) : (1.5 / state.transform.scale);
            ctx.stroke();
        });

        state.nodes.forEach((node) => {
            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            ctx.shadowBlur = (isHovered || isSelected ? 20 : 10) / state.transform.scale;
            ctx.shadowColor = node.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (isHovered || isSelected) {
                ctx.lineWidth = 2 / state.transform.scale;
                ctx.strokeStyle = 'rgba(255,255,255,0.92)';
                ctx.stroke();
            }
        });

        ctx.restore();
        renderLabels(ctx);
        updateCursor();
    }

    function applySoftWorldTether(node) {
        if (node?.manualAnchor) return;
        const anchor = state.worldAnchor || { x: 0, y: 0 };
        const radius = Math.max(Number(state.worldRadius) || 0, 120);
        const dx = node.x - anchor.x;
        const dy = node.y - anchor.y;
        const dist = Math.max(0.001, Math.sqrt((dx * dx) + (dy * dy)));
        const startRadius = radius * 1.18;
        if (dist <= startRadius) return;

        const overflow = dist - startRadius;
        const nx = dx / dist;
        const ny = dy / dist;
        const pull = overflow * (overflow > radius * 0.6 ? 0.00042 : 0.00018);
        node.vx -= nx * pull;
        node.vy -= ny * pull;
    }

    function tickPhysics() {
        if (!state.nodes.length || !state.canvas) return;
        const nodeCount = state.nodes.length;
        const repulsion = nodeCount > 400 ? 900 : nodeCount > 220 ? 1200 : nodeCount > 120 ? 1600 : nodeCount > 70 ? 2200 : 3200;
        const centerPull = nodeCount > 400 ? 0.00038 : nodeCount > 220 ? 0.0005 : nodeCount > 120 ? 0.0007 : 0.0011;
        const springStrength = nodeCount > 120 ? 0.0024 : 0.0032;

        for (let index = 0; index < state.nodes.length; index += 1) {
            const node = state.nodes[index];
            if (state.pointer.mode === 'node' && state.pointer.node && state.pointer.node.id === node.id) {
                node.vx = 0;
                node.vy = 0;
                continue;
            }

            for (let inner = index + 1; inner < state.nodes.length; inner += 1) {
                const other = state.nodes[inner];
                const dx = other.x - node.x;
                const dy = other.y - node.y;
                const distSq = Math.max(36, (dx * dx) + (dy * dy));
                const force = repulsion / distSq;
                const dist = Math.sqrt(distSq);
                const nx = dx / dist;
                const ny = dy / dist;
                node.vx -= nx * force;
                node.vy -= ny * force;
                other.vx += nx * force;
                other.vy += ny * force;
            }
        }

        state.edges.forEach((edge) => {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const dist = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
            const desired = edge.type === 'tag' ? 120 : 78;
            const stretch = dist - desired;
            const nx = dx / dist;
            const ny = dy / dist;
            const force = stretch * springStrength;
            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.source.id)) {
                edge.source.vx += nx * force;
                edge.source.vy += ny * force;
            }
            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.target.id)) {
                edge.target.vx -= nx * force;
                edge.target.vy -= ny * force;
            }
        });

        state.nodes.forEach((node) => {
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;
            const anchor = getNodeAnchor(node);
            const anchorPull = node.manualAnchor ? 0.08 : centerPull;
            node.vx += (anchor.x - node.x) * anchorPull;
            node.vy += (anchor.y - node.y) * anchorPull;
            const velocityDamping = node.manualAnchor ? 0.72 : 0.88;
            node.vx *= velocityDamping;
            node.vy *= velocityDamping;
            node.x += node.vx;
            node.y += node.vy;
            applySoftWorldTether(node);
        });
    }

    function step() {
        if (!state.running) return;
        tickPhysics();
        draw();
        state.animationFrameId = window.requestAnimationFrame(step);
    }

    function stopAnimation() {
        state.running = false;
        if (state.animationFrameId) {
            window.cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = 0;
        }
    }

    function startAnimation() {
        stopAnimation();
        state.running = true;
        step();
    }

    function setSelectedNode(node) {
        state.selected = node || null;
        renderInspector();
        requestDraw();
    }

    function setHoveredNode(node) {
        if ((state.hovered?.id || '') === (node?.id || '')) return;
        state.hovered = node || null;
        requestDraw();
        if (!state.selected) renderInspector();
    }

    function runFind() {
        const query = text(state.findInput?.value, '').toLowerCase();
        state.searchState.query = query;
        if (!query) {
            state.searchState.matches = [];
            state.searchState.index = -1;
            if (!state.selected) renderInspector();
            return;
        }
        const matches = state.nodes.filter((node) => {
            return node.label.toLowerCase().includes(query)
                || text(node.meta, '').toLowerCase().includes(query)
                || text(node.data?.url, '').toLowerCase().includes(query);
        });
        state.searchState.matches = matches;
        if (!matches.length) {
            state.searchState.index = -1;
            state.infoEl.innerHTML = '<div style="font-size:0.9rem;font-weight:700;">No matches</div><div style="font-size:0.8rem;opacity:0.78;margin-top:6px;">Nothing in this map matched "' + escapeHtml(query) + '".</div>';
            return;
        }
        state.searchState.index = (state.searchState.index + 1) % matches.length;
        const node = matches[state.searchState.index];
        setSelectedNode(node);
        centerOnNode(node, Math.max(state.transform.scale, 1.28));
    }

    function bindEvents() {
        if (state.bound || !state.canvas || !state.container) return;

        state.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.12 : 0.9;
            zoomAt(factor, event.clientX, event.clientY);
        }, { passive: false });

        state.canvas.addEventListener('pointerdown', (event) => {
            const canvasPoint = canvasPointFromClient(event.clientX, event.clientY);
            let hitNode = null;
            if (!state.pointer.forcePan && state.selected && state.selected.kind !== 'link') {
                const selectedPoint = getScreenPoint(state.selected);
                const dx = canvasPoint.x - selectedPoint.x;
                const dy = canvasPoint.y - selectedPoint.y;
                const keepRadius = Math.max((state.selected.radius * state.transform.scale) + 24, 34);
                if (((dx * dx) + (dy * dy)) <= (keepRadius * keepRadius)) {
                    hitNode = state.selected;
                }
            }
            if (!hitNode && !state.pointer.forcePan) {
                hitNode = getHitNode(event.clientX, event.clientY);
            }
            state.pointer.mode = hitNode ? 'node' : 'pan';
            state.pointer.node = hitNode;
            state.pointer.startX = event.clientX;
            state.pointer.startY = event.clientY;
            state.pointer.baseTx = state.transform.tx;
            state.pointer.baseTy = state.transform.ty;
            state.pointer.moved = false;
            state.pointer.canvasX = canvasPoint.x;
            state.pointer.canvasY = canvasPoint.y;
            if (hitNode) {
                setSelectedNode(hitNode);
                state.canvas.setPointerCapture?.(event.pointerId);
            }
            updateCursor();
        });

        state.canvas.addEventListener('pointermove', (event) => {
            const canvasPoint = canvasPointFromClient(event.clientX, event.clientY);
            state.pointer.canvasX = canvasPoint.x;
            state.pointer.canvasY = canvasPoint.y;
            if (state.pointer.mode === 'pan') {
                const dx = event.clientX - state.pointer.startX;
                const dy = event.clientY - state.pointer.startY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.pointer.moved = true;
                setTransform(state.transform.scale, state.pointer.baseTx + dx, state.pointer.baseTy + dy);
                return;
            }
            if (state.pointer.mode === 'node' && state.pointer.node) {
                const point = worldPointFromClient(event.clientX, event.clientY);
                if (Math.abs(event.clientX - state.pointer.startX) > 2 || Math.abs(event.clientY - state.pointer.startY) > 2) state.pointer.moved = true;
                state.pointer.node.x = point.x;
                state.pointer.node.y = point.y;
                state.pointer.node.vx = 0;
                state.pointer.node.vy = 0;
                requestDraw();
                return;
            }
            setHoveredNode(getHitNode(event.clientX, event.clientY));
        });

        function clearPointer(event) {
            if (state.pointer.mode === 'idle') return;
            const hitNode = getHitNode(event.clientX, event.clientY);
            const previousNode = state.pointer.node;
            const moved = state.pointer.moved;
            state.pointer.mode = 'idle';
            state.pointer.node = null;
            updateCursor();

            if (previousNode && moved && previousNode.kind !== 'link') {
                previousNode.manualAnchor = { x: previousNode.x, y: previousNode.y };
                previousNode.vx = 0;
                previousNode.vy = 0;
            }

            if (previousNode && !moved && hitNode && hitNode.id === previousNode.id) {
                const now = Date.now();
                if (state.lastClickNodeId === hitNode.id && now - state.lastClickAt < DOUBLE_CLICK_MS) {
                    activateNode(hitNode);
                    state.lastClickAt = 0;
                    state.lastClickNodeId = '';
                } else {
                    setSelectedNode(hitNode);
                    state.lastClickAt = now;
                    state.lastClickNodeId = hitNode.id;
                }
            }
        }

        state.canvas.addEventListener('pointerup', clearPointer);
        state.canvas.addEventListener('pointerleave', (event) => {
            state.pointer.canvasX = 0;
            state.pointer.canvasY = 0;
            if (state.pointer.mode !== 'idle') {
                clearPointer(event);
                return;
            }
            setHoveredNode(null);
        });

        state.infoEl.addEventListener('click', (event) => {
            if (event.target?.dataset?.mapInfoToggle) {
                state.infoCollapsed = !state.infoCollapsed;
                renderInspector();
                return;
            }
            const action = event.target?.dataset?.mapAction;
            if (!action || !state.selected) return;
            if (action === 'primary') {
                activateNode(state.selected);
            } else if (action === 'center') {
                centerOnNode(state.selected, Math.max(state.transform.scale, 1.24));
            }
        });

        state.findInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runFind();
            }
        });

        state.resizeHandler = function () {
            if (!state.canvas) return;
            const { width, height } = getViewportSize();
            state.canvas.width = width;
            state.canvas.height = height;
            fitToGraph();
        };
        window.addEventListener('resize', state.resizeHandler);

        state.keyHandler = function (event) {
            if (!state.container || state.container.style.display === 'none') return;
            if (event.key === 'Escape') {
                event.preventDefault();
                ns.closeMap();
            } else if (event.key === ' ' || event.code === 'Space') {
                state.pointer.forcePan = true;
            } else if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);
            } else if (event.key === '-') {
                event.preventDefault();
                zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);
            }
        };
        window.addEventListener('keydown', state.keyHandler);
        window.addEventListener('keyup', (event) => {
            if (event.key === ' ' || event.code === 'Space') {
                state.pointer.forcePan = false;
            }
        });

        state.bound = true;
    }

    function ensureContainer() {
        if (state.container && state.canvas && state.ctx) return;
        const container = document.createElement('div');
        container.id = 'constellation-map-overlay';
        container.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:99999',
            'display:none',
            'background:radial-gradient(circle at top, rgba(8,21,38,0.94), rgba(2,6,16,0.97))',
            'backdrop-filter:blur(10px)'
        ].join(';');
        container.innerHTML = [
            '<div style="position:absolute;z-index:3;top:16px;left:20px;display:flex;flex-direction:column;gap:4px;max-width:min(48vw,680px);pointer-events:auto;">',
            '<div data-map-title style="font-size:1.05rem;font-weight:700;letter-spacing:0.06em;color:#f3f8ff;">NEURAL CORE :: CONSTELLATION MAP</div>',
            '<div data-map-scope style="font-size:0.82rem;color:rgba(255,255,255,0.76);"></div>',
            '<div data-map-stats style="font-size:0.78rem;color:rgba(255,255,255,0.58);"></div>',
            '</div>',
            '<div style="position:absolute;z-index:3;top:16px;right:20px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(52vw,900px);justify-content:flex-end;pointer-events:auto;">',
            '<input data-map-find type="search" placeholder="Find bookmark, card, folder..." style="min-width:240px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;outline:none;">',
            '<button type="button" data-map-toolbar="find" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Find</button>',
            '<button type="button" data-map-toolbar="zoom-out" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">-</button>',
            '<button type="button" data-map-toolbar="zoom-in" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">+</button>',
            '<button type="button" data-map-toolbar="fit" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Fit</button>',
            '<button type="button" data-map-toolbar="reset" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Reset</button>',
            '<button type="button" data-map-toolbar="labels" style="border:1px solid rgba(0,212,255,0.28);background:rgba(0,212,255,0.12);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Labels: Auto</button>',
            '<button type="button" data-map-toolbar="close" style="border:1px solid rgba(255,80,120,0.3);background:rgba(255,80,120,0.14);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Close</button>',
            '</div>',
            '<canvas data-map-canvas style="position:absolute;z-index:1;inset:0;width:100%;height:100%;display:block;cursor:grab;"></canvas>',
            '<div style="position:absolute;z-index:3;left:20px;bottom:20px;max-width:320px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);border-radius:14px;padding:12px 14px;color:rgba(255,255,255,0.8);font-size:0.78rem;line-height:1.45;pointer-events:auto;">Drag background to pan. Hold Space to force-pan through dense clusters. Drag nodes to reorganize. Mouse wheel zooms. Double-click a bookmark node to open it.</div>',
            '<div data-map-info style="position:absolute;z-index:3;right:108px;bottom:20px;max-width:min(360px,calc(100vw - 200px));min-width:260px;border:1px solid rgba(255,255,255,0.14);background:rgba(3,10,20,0.86);border-radius:16px;padding:14px 16px;color:#fff;box-shadow:0 18px 40px rgba(0,0,0,0.35);pointer-events:auto;"></div>'
        ].join('');
        document.body.appendChild(container);

        state.container = container;
        state.canvas = container.querySelector('[data-map-canvas]');
        state.ctx = state.canvas.getContext('2d');
        state.titleEl = container.querySelector('[data-map-title]');
        state.scopeEl = container.querySelector('[data-map-scope]');
        state.statsEl = container.querySelector('[data-map-stats]');
        state.infoEl = container.querySelector('[data-map-info]');
        state.findInput = container.querySelector('[data-map-find]');

        container.addEventListener('click', (event) => {
            const toolbarAction = event.target?.dataset?.mapToolbar;
            if (!toolbarAction) return;
            if (toolbarAction === 'find') runFind();
            else if (toolbarAction === 'zoom-in') zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);
            else if (toolbarAction === 'zoom-out') zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);
            else if (toolbarAction === 'fit') fitToGraph();
            else if (toolbarAction === 'reset') resetView();
            else if (toolbarAction === 'labels') {
                const currentIndex = LABEL_MODE_ORDER.indexOf(state.labelMode);
                state.labelMode = LABEL_MODE_ORDER[(currentIndex + 1) % LABEL_MODE_ORDER.length];
                event.target.textContent = getLabelModeText();
                requestDraw();
            } else if (toolbarAction === 'close') {
                ns.closeMap();
            }
        });

        bindEvents();
        state.resizeHandler?.();
        const labelsButton = container.querySelector('[data-map-toolbar="labels"]');
        if (labelsButton) labelsButton.textContent = getLabelModeText();
        renderInspector();
    }

    ns.openMap = function openMap(scopeOption) {
        ensureContainer();
        buildGraphData(scopeOption);
        state.container.style.display = 'block';
        document.body.style.overflow = 'hidden';
        startAnimation();
    };

    ns.openAllMap = function openAllMap() {
        ns.openMap({ scope: 'all' });
    };

    ns.openWorkspaceMap = function openWorkspaceMap(workspaceId) {
        ns.openMap({ scope: 'workspace', workspaceId });
    };

    ns.openCardMap = function openCardMap(workspaceId, categoryName) {
        ns.openMap({ scope: 'card', workspaceId, categoryName });
    };

    ns.openCurrentViewMap = function openCurrentViewMap() {
        const mainContent = document.getElementById('main-content');
        const isUnidexActive = !!mainContent?.classList?.contains('unidex-view-active');
        const unidex = window.UnidexView;
        if (isUnidexActive && unidex?.getConstellationScope) {
            ns.openMap(unidex.getConstellationScope());
            return;
        }
        ns.openWorkspaceMap(getConfig().activeWorkspace || 'main');
    };

    ns.closeMap = function closeMap() {
        stopAnimation();
        if (state.container) state.container.style.display = 'none';
        document.body.style.overflow = '';
    };

    ns.__debugGetGraphStats = function __debugGetGraphStats() {
        const viewport = state.canvas
            ? { width: state.canvas.width, height: state.canvas.height }
            : getViewportSize();
        const scale = Math.max(state.transform.scale || 1, 0.0001);
        const visibleWorldBounds = {
            minX: Number((((MAP_PADDING - state.transform.tx) / scale)).toFixed(2)),
            maxX: Number(((((viewport.width - MAP_PADDING) - state.transform.tx) / scale)).toFixed(2)),
            minY: Number((((MAP_PADDING - state.transform.ty) / scale)).toFixed(2)),
            maxY: Number(((((viewport.height - MAP_PADDING) - state.transform.ty) / scale)).toFixed(2))
        };
        const outOfBounds = state.nodes.reduce((count, node) => {
            if (!node) return count;
            if (
                node.x < visibleWorldBounds.minX
                || node.y < visibleWorldBounds.minY
                || node.x > visibleWorldBounds.maxX
                || node.y > visibleWorldBounds.maxY
            ) {
                return count + 1;
            }
            return count;
        }, 0);
        return {
            scope: state.scope,
            visible: !!state.container && state.container.style.display !== 'none',
            nodeCount: state.nodes.length,
            edgeCount: state.edges.length,
            labelCount: state.labelHitBoxes.length,
            outOfBounds,
            worldRadius: Number((state.worldRadius || 0).toFixed(2)),
            visibleWorldBounds,
            worldBounds: state.worldBounds ? {
                minX: Number(state.worldBounds.minX.toFixed(2)),
                maxX: Number(state.worldBounds.maxX.toFixed(2)),
                minY: Number(state.worldBounds.minY.toFixed(2)),
                maxY: Number(state.worldBounds.maxY.toFixed(2))
            } : null,
            transform: {
                scale: Number(state.transform.scale.toFixed(4)),
                tx: Number(state.transform.tx.toFixed(2)),
                ty: Number(state.transform.ty.toFixed(2))
            },
            sampleNodes: state.nodes.slice(0, 12).map((node) => ({
                id: node.id,
                kind: node.kind,
                x: Number(node.x.toFixed(2)),
                y: Number(node.y.toFixed(2))
            })),
            kinds: state.nodes.reduce((acc, node) => {
                acc[node.kind] = (acc[node.kind] || 0) + 1;
                return acc;
            }, {})
        };
    };
})(window.EveConstellationMap);
