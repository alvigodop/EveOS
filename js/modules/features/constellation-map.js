window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const graph = ns._graph || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const view = ns._view || {};

    const events = ns._events || {};

    const toolbar = ns._toolbar || {};

    const {

        state,

        MAP_PADDING,

        MOTION_TUNING_FIELDS,

        getConfig,

        text,

        getViewportSize,

        getNodePolarityState,

        getPolarityStrengthValue,

        getNodeCoverCandidates,

        getNodeCoverRotationInterval,

        getNodeCoverUrl,

        isNodeStatic,

        getStaticStateForNode,

        clearInspectorCoverRotation,

        getPolaritySummary,

        getMotionTuningValue,

        hashNodeId

    } = shared;

    const { buildGraphData } = graph;

    const {

        requestDraw,

        renderHeader,

        renderInspector,

        updateInspectorCoverState,

        renderToolbarState,

        draw

    } = render;

    const {

        getMotionProfile,

        syncMotionAnchors,

        tickPhysics

    } = physics;

    const {

        isNodeMain,

        centerOnNode,

        fitToGraph

    } = view;

    const { setSelectedNode } = events;

    const { ensureContainer } = toolbar;

    if (ns.ready) return;



    function applyPassiveReleaseImpulse(node) {

        if (!node || node.kind !== 'folder') return;

        const speed = Math.hypot(Number(node.vx) || 0, Number(node.vy) || 0);

        if (speed >= 0.48) return;

        const hash = hashNodeId(node);

        const angle = (hash % 6283) / 1000;

        const impulse = 0.76 + ((hash % 7) * 0.05);

        node.vx = Math.cos(angle) * impulse;

        node.vy = Math.sin(angle) * impulse;

    }

    // Expose for late-binding from events module
    ns._applyPassiveReleaseImpulse = applyPassiveReleaseImpulse;



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

        if (node.kind === 'folder') {

            return { label: 'Open Folder', action: 'open-folder' };

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

        if (node.kind === 'folder' && data.folderId && data.categoryName && openFolderFromMap(node)) {

            return;

        }

        centerOnNode(node, Math.max(state.transform.scale, 1.2));

    }

    // Expose for late-binding from events module
    ns._activateNode = activateNode;

    function openFolderFromMap(node) {

        const data = node?.data || {};

        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');
        const folderId = text(data.folderId, '');

        if (!categoryName || !folderId || !window.EveFolderViewV2?.enterFolder) return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {

            window.switchWorkspace(workspaceId);

        }

        if (categoryName && typeof window.setFocus === 'function') {

            window.setFocus(categoryName);

        }

        window.setTimeout(() => {

            try {

                window.EveFolderViewV2.enterFolder(null, categoryName, folderId, workspaceId);

            } catch (error) {

                console.warn('[ConstellationMap] Failed to open folder from map', error);

            }

        }, 70);

        ns.closeMap();

        return true;

    }

    function openCategorySettingsFromMap(node) {

        const data = node?.data || {};

        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');

        if (!categoryName || typeof window.openCategorySettings !== 'function') return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {

            window.switchWorkspace(workspaceId);

        }

        if (typeof window.setFocus === 'function') {

            window.setFocus(categoryName);

        }

        window.setTimeout(() => {

            try {

                window.openCategorySettings(categoryName);

            } catch (error) {

                console.warn('[ConstellationMap] Failed to open card settings from map', error);

            }

        }, 60);

        return true;

    }

    function runNodeAction(node, action) {

        if (!node || !action) return;

        if (action === 'primary') {

            activateNode(node);
            return;

        }

        if (action === 'center') {

            centerOnNode(node, Math.max(state.transform.scale, 1.24));
            return;

        }

        if (action === 'open-category') {

            const data = node.data || {};

            if (data.categoryName) {

                if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {

                    window.switchWorkspace(data.workspaceId);

                }

                if (typeof window.setFocus === 'function') {

                    window.setFocus(data.categoryName);
                    ns.closeMap();
                }

            }

            return;

        }

        if (action === 'open-folder') {

            openFolderFromMap(node);
            return;

        }

        if (action === 'open-category-settings') {

            openCategorySettingsFromMap(node);

        }

    }

    // Expose for late-binding from events module
    ns._runNodeAction = runNodeAction;



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

    function releaseTransientMapState() {

        state.nodes = [];

        state.nodeIndex = new Map();

        state.edges = [];

        state.edgeKeys = new Set();

        state.scope = null;

        state.hovered = null;

        state.selected = null;

        state.labelHitBoxes = [];

        state.motionAnchors = new Map();

        state.lastMotionMode = state.motionMode;

        state.nodePolarities = new Map();

        state.staticNodeIds = new Set();

        state.staticKinds = new Set();

        state.staticBranchRoots = new Map();

        state.staticBranchNodeIds = new Set();

        state.coverPreviewSession = null;

        state.searchState = {

            query: '',

            index: -1,

            matches: []

        };

        state.pointer.mode = 'idle';

        state.pointer.node = null;

        state.pointer.moved = false;

        state.pointer.releaseVx = 0;

        state.pointer.releaseVy = 0;

        state.worldAnchor = { x: 0, y: 0 };

        state.worldBounds = null;

        state.worldRadius = 0;

        if (state.ctx && state.canvas) {

            state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

        }

    }



    ns.openMap = function openMap(scopeOption) {
        console.log('[ConstellationMap] openMap called', scopeOption);
        const startTime = Date.now();

        ensureContainer();
        console.log('[ConstellationMap] after ensureContainer', Date.now() - startTime, 'ms');

        buildGraphData(scopeOption);
        console.log('[ConstellationMap] after buildGraphData', Date.now() - startTime, 'ms');

        syncMotionAnchors(true);

        renderHeader();

        renderInspector();

        state.container.style.display = 'block';
        state.resizeHandler?.();

        fitToGraph();

        document.body.style.overflow = 'hidden';

        startAnimation();
        console.log('[ConstellationMap] openMap completed in', Date.now() - startTime, 'ms');
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



    ns.openFolderMap = function openFolderMap(workspaceId, categoryName, folderId, folderLabel) {

        ns.openMap({ scope: 'folder', workspaceId, categoryName, folderId, folderLabel });

    };



    ns.openDerivedMap = function openDerivedMap(options) {

        const source = options && typeof options === 'object' ? options : {};

        ns.openMap({

            scope: 'derived',

            workspaceId: source.workspaceId,

            categoryName: source.categoryName,

            scopeLabel: source.scopeLabel,

            linkIds: Array.isArray(source.linkIds) ? source.linkIds : []

        });

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

        clearInspectorCoverRotation();

        if (state.container) state.container.style.display = 'none';

        document.body.style.overflow = '';

        releaseTransientMapState();

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

        const motionProfile = getMotionProfile(state.nodes.length);

        return {

            motionProfile: {
                mode: motionProfile.mode,
                repulsionScale: Number((motionProfile.repulsionScale || 0).toFixed(3)),
                centerPullScale: Number((motionProfile.centerPullScale || 0).toFixed(3)),
                springScale: Number((motionProfile.springScale || 0).toFixed(3)),
                hierarchyReactionScale: Number((motionProfile.hierarchyReactionScale || 0).toFixed(3)),
                folderRecoveryScale: Number((motionProfile.folderRecoveryScale || 0).toFixed(3)),
                dampingScale: Number((motionProfile.dampingScale || 0).toFixed(3)),
                speedScale: Number((motionProfile.speedScale || 0).toFixed(3)),
                worldTetherScale: Number((motionProfile.worldTetherScale || 0).toFixed(3))
            },

            scope: state.scope,

            motionMode: state.motionMode,

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

            sampleNodes: state.nodes.slice(0, 60).map((node) => ({

                id: node.id,

                kind: node.kind,

                label: node.label,

                x: Number(node.x.toFixed(2)),

                y: Number(node.y.toFixed(2)),

                vx: Number((Number(node.vx) || 0).toFixed(3)),

                vy: Number((Number(node.vy) || 0).toFixed(3)),

                isStatic: isNodeStatic(node),

                staticSource: getStaticStateForNode(node).source || '',

                hasManualAnchor: !!node.manualAnchor,

                polarity: getNodePolarityState(node).effective,

                polaritySource: getNodePolarityState(node).source || '',

                nodePolarity: getNodePolarityState(node).nodeOverride,

                kindPolarity: getNodePolarityState(node).kind

            })),

            staticSummary: {

                nodeIds: Array.from(state.staticNodeIds.values()),

                kinds: Array.from(state.staticKinds.values()),

                branchRoots: Array.from(state.staticBranchRoots.keys()),

                branchNodeIds: Array.from(state.staticBranchNodeIds.values())

            },

            polaritySummary: {

                nodeOverrideCount: getPolaritySummary().nodeOverrideCount,

                attractKinds: getPolaritySummary().attractKinds.slice(),

                strength: {

                    repel: Number(getPolarityStrengthValue('repel').toFixed(2)),

                    attract: Number(getPolarityStrengthValue('attract').toFixed(2))

                }

            },

            motionTuning: Object.fromEntries(MOTION_TUNING_FIELDS.map((field) => [
                field.key,
                Number(getMotionTuningValue(field.key).toFixed(2))
            ])),

            kinds: state.nodes.reduce((acc, node) => {

                acc[node.kind] = (acc[node.kind] || 0) + 1;

                return acc;

            }, {})

        };

    };



    ns.__debugGetInspectorCoverState = function __debugGetInspectorCoverState() {

        const targetNode = state.selected || state.hovered || null;

        return {

            targetNode: targetNode ? {

                id: targetNode.id,

                kind: targetNode.kind,

                label: targetNode.label

            } : null,

            now: Date.now(),

            infoHovered: !!state.infoHovered,

            infoHoverStartedAt: state.infoHoverStartedAt || 0,

            interval: getNodeCoverRotationInterval(targetNode),

            candidates: getNodeCoverCandidates(targetNode),

            current: getNodeCoverUrl(targetNode),

            session: state.coverPreviewSession ? {

                key: state.coverPreviewSession.key,

                startedAt: state.coverPreviewSession.startedAt,

                elapsedMs: state.coverPreviewSession.elapsedMs,

                covers: state.coverPreviewSession.covers.slice()

            } : null

        };

    };

    ns.__debugSelectNode = function __debugSelectNode(nodeId) {

        const node = state.nodeIndex.get(String(nodeId || '')) || null;

        if (!node) return false;

        setSelectedNode(node);

        requestDraw();

        return true;

    };



    ns.__debugShiftInspectorHover = function __debugShiftInspectorHover(deltaMs) {

        const amount = Number(deltaMs) || 0;

        if (!state.infoHoverStartedAt) {

            state.infoHoverStartedAt = Date.now();

        }

        state.infoHoverStartedAt -= amount;

        if (state.coverPreviewSession?.startedAt) {

            state.coverPreviewSession.startedAt -= amount;

        } else if (state.coverPreviewSession) {

            state.coverPreviewSession.elapsedMs = Math.max(0, Number(state.coverPreviewSession.elapsedMs || 0) + amount);

        }

        renderInspector();

        return state.infoHoverStartedAt;

    };



    ns.ready = true;

})(window.EveConstellationMap);
