window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

    const graph = ns._graph || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const view = ns._view || {};

    const events = ns._events || {};

    const toolbarMarkup = ns._toolbarMarkup || {};

    const {

        state,

        LABEL_MODE_ORDER,

        MOTION_MODE_ORDER,

        MOTION_TUNING_FIELDS,

        escapeHtml,

        getMotionTuningText,

        cycleNodePolarity,

        toggleKindPolarity,

        setPolarityStrengthValue,

        setMotionTuningValue,

        resetMotionTuning,

        clearPolarityOverrides,

        toggleStaticForNode,

        toggleStaticForKind,

        toggleStaticBranch,

        clearStaticLocks

    } = shared;

    const { buildGraphData } = graph;

    const {

        requestDraw,

        renderHeader,

        renderInspector,

        renderToolbarState,

        updateInspectorCoverState

    } = render;

    const { syncMotionAnchors } = physics;

    const { fitToGraph, resetView, zoomAt } = view;

    const { bindEvents, runFind } = events;
    const { getInteractionTargetNode, buildOverlayMarkup } = toolbarMarkup;



    function ensureContainer() {
        console.log('[ConstellationMap] ensureContainer called');
        if (state.container && state.canvas && state.ctx) {
            console.log('[ConstellationMap] Container already exists');
            return;
        }

        console.log('[ConstellationMap] Creating container...');
        const container = document.createElement('div');
        container.id = 'constellation-map-overlay';
        container.classList.add('map-container');
        container.style.display = 'none';
        
        container.innerHTML = buildOverlayMarkup();

        document.body.appendChild(container);

        state.container = container;
        state.canvas = container.querySelector('[data-map-canvas]');
        state.ctx = state.canvas.getContext('2d');
        state.titleEl = container.querySelector('[data-map-title]');
        state.scopeEl = container.querySelector('[data-map-scope]');
        state.statsEl = container.querySelector('[data-map-stats]');
        state.infoEl = container.querySelector('[data-map-info]');
        state.findInput = container.querySelector('[data-map-find]');

        console.log('[ConstellationMap] state assignments:', {
            container: !!state.container,
            canvas: !!state.canvas,
            ctx: !!state.ctx
        });

        if (ns.FX && ns.FX.manager) {
            console.log('[ConstellationMap] Initializing FX manager');
            ns.FX.manager.init(container);
        }

        container.addEventListener('click', (event) => {
            const toolbarEl = event.target.closest('[data-map-toolbar]');
            const toolbarAction = toolbarEl?.dataset?.mapToolbar;
            
            const fxEngineEl = event.target.closest('[data-fx-engine]');
            if (fxEngineEl) {
                state.activeWebGlFx = fxEngineEl.dataset.fxEngine;
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }

            const fxToggleEl = event.target.closest('[data-fx-toggle]');
            if (fxToggleEl) {
                const type = fxToggleEl.dataset.fxToggle;
                if (type === 'grid') state.fxGridEnabled = !state.fxGridEnabled;
                if (type === 'scanline') state.fxScanlineEnabled = !state.fxScanlineEnabled;
                if (type === 'tech') state.fxTechEnabled = !state.fxTechEnabled;
                if (type === 'circuit') state.fxCircuitEnabled = !state.fxCircuitEnabled;
                if (type === 'neuralhud') state.fxNeuralHudEnabled = !state.fxNeuralHudEnabled;
                if (type === 'tech') state.fxTechEnabled = !state.fxTechEnabled;
                if (type === 'circuit') state.fxCircuitEnabled = !state.fxCircuitEnabled;
                if (ns.FX && ns.FX.manager) ns.FX.manager.update();
                renderToolbarState();
                return;
            }
            
            const staticKindEl = event.target.closest('[data-map-static-kind]');
            const directStaticKind = staticKindEl?.dataset?.mapStaticKind;
            if (directStaticKind) {
                toggleStaticForKind(directStaticKind);
                renderInspector();
                requestDraw();
                return;
            }

            if (!toolbarAction) return;

            if (toolbarAction === 'find') runFind();
            else if (toolbarAction === 'zoom-in') zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);
            else if (toolbarAction === 'zoom-out') zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);
            else if (toolbarAction === 'fit') fitToGraph();
            else if (toolbarAction === 'reset') resetView();
            else if (toolbarAction === 'labels') {
                const currentIndex = LABEL_MODE_ORDER.indexOf(state.labelMode);
                state.labelMode = LABEL_MODE_ORDER[(currentIndex + 1) % LABEL_MODE_ORDER.length];
                requestDraw();
                renderToolbarState();
            } else if (toolbarAction === 'fx') {
                state.fxExpanded = !state.fxExpanded;
                renderToolbarState();
            } else if (toolbarAction === 'motion') {
                const currentIndex = MOTION_MODE_ORDER.indexOf(state.motionMode);
                state.motionMode = MOTION_MODE_ORDER[(currentIndex + 1) % MOTION_MODE_ORDER.length];
                syncMotionAnchors(true);
                requestDraw();
                renderToolbarState();
            } else if (toolbarAction === 'controls') {
                state.controlsExpanded = !state.controlsExpanded;
                renderToolbarState();
            } else if (toolbarAction === 'static-node') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticForNode(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-chain') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticBranch(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-kind') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleStaticForKind(targetNode.kind);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'static-clear') {
                clearStaticLocks();
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-node') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                cycleNodePolarity(targetNode);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-kind') {
                const targetNode = getInteractionTargetNode();
                if (!targetNode) return;
                toggleKindPolarity(targetNode.kind);
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'polarity-clear') {
                clearPolarityOverrides();
                renderInspector();
                requestDraw();
            } else if (toolbarAction === 'motion-reset') {
                resetMotionTuning();
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'stability') {
                state.stableMainNodes = !state.stableMainNodes;
                buildGraphData(state.scope);
                renderHeader();
                requestDraw();
            } else if (toolbarAction === 'chain-internal') {
                state.chainInternalForcesEnabled = !state.chainInternalForcesEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'chain-external') {
                state.chainExternalForcesEnabled = !state.chainExternalForcesEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'chain-hierarchy') {
                state.chainHierarchyEnabled = !state.chainHierarchyEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'bookmark-hierarchy') {
                state.bookmarkHierarchyEnabled = !state.bookmarkHierarchyEnabled;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'physics-auras') {
                state.showPhysicsAuras = !state.showPhysicsAuras;
                renderToolbarState();
                requestDraw();
            } else if (toolbarAction === 'close') {
                ns.closeMap();
            }
        });

        container.addEventListener('input', (event) => {
            const polarityMode = event.target?.dataset?.mapPolarityStrength;
            const polarityNumberMode = event.target?.dataset?.mapPolarityStrengthNumber;
            const motionTuningMode = event.target?.dataset?.mapMotionTuning;
            const motionTuningNumberMode = event.target?.dataset?.mapMotionTuningNumber;

            if (polarityMode || polarityNumberMode) {
                setPolarityStrengthValue(polarityMode || polarityNumberMode, event.target.value);
                renderToolbarState();
                renderInspector();
                requestDraw();
                return;
            }

            if (!motionTuningMode && !motionTuningNumberMode) return;
            setMotionTuningValue(motionTuningMode || motionTuningNumberMode, event.target.value);
            renderToolbarState();
            requestDraw();
        });

        bindEvents();
        state.resizeHandler?.();
        renderInspector();
        updateInspectorCoverState();
        renderToolbarState();
        console.log('[ConstellationMap] ensureContainer completed');
    }



    ns._toolbar = {
        ensureContainer
    };

})(window.EveConstellationMap);
