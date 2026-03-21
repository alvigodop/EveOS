window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {



    const shared = ns._shared || {};

    const graph = ns._graph || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const view = ns._view || {};

    const toolbar = ns._toolbar || {};

    const coreActions = ns._coreActions || {};

    const coreDebug = ns._coreDebug || {};



    const {

        state,

        getConfig,

        getViewportSize,

        clearInspectorCoverRotation

    } = shared;

    const { buildGraphData } = graph;

    const { requestDraw, renderHeader, renderInspector, draw } = render;

    const { syncMotionAnchors, tickPhysics } = physics;

    const { fitToGraph } = view;

    const { ensureContainer } = toolbar;



    if (ns.ready) return;



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



        state.selectionIds = new Set();



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



        state.actionWheel = {
            visible: false,
            nodeId: '',
            clientX: 0,
            clientY: 0,
            items: []
        };

        if (state.rewire) {
            const rewireEnabled = !!state.rewire.enabled;
            state.rewire = {
                enabled: rewireEnabled,
                dragging: false,
                sourceNodeId: '',
                sourceNodeIds: [],
                targetNodeId: '',
                validTargetIds: new Set(),
                previewWorldX: 0,
                previewWorldY: 0,
                sourceStartX: 0,
                sourceStartY: 0,
                canDetachToRoot: false,
                hint: ''
            };
        }



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



    ns.openAllMap = function openAllMap() { ns.openMap({ scope: 'all' }); };

    ns.openWorkspaceMap = function openWorkspaceMap(workspaceId) { ns.openMap({ scope: 'workspace', workspaceId }); };

    ns.openCardMap = function openCardMap(workspaceId, categoryName) { ns.openMap({ scope: 'card', workspaceId, categoryName }); };

    ns.openFolderMap = function openFolderMap(workspaceId, categoryName, folderId, folderLabel) { ns.openMap({ scope: 'folder', workspaceId, categoryName, folderId, folderLabel }); };

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



    ns.__debugGetGraphStats = coreDebug.__debugGetGraphStats;

    ns.__debugGetInspectorCoverState = coreDebug.__debugGetInspectorCoverState;

    ns.__debugSelectNode = coreDebug.__debugSelectNode;

    ns.__debugShiftInspectorHover = coreDebug.__debugShiftInspectorHover;



    ns.ready = true;



})(window.EveConstellationMap);

