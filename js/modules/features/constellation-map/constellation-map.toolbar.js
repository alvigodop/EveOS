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
        escapeHtml,
        cycleNodePolarity,
        toggleKindPolarity,
        setPolarityStrengthValue,
        setFxTuningValue,
        setMotionTuningValue,
        resetMotionTuning,
        resetFxControls,
        clearPolarityOverrides,
        toggleStaticForNode,
        toggleStaticForKind,
        toggleStaticBranch,
        clearStaticLocks,
        setAuraTuningValue,
        resetAuraControls,
        applyAuraPreset,
        toggleAuraVisuals,
        toggleAuraEffects,
        toggleAuraEmitterKind,
        toggleAuraDepth,
        setMapThemeColor,
        setMapThemeTuningValue,
        resetMapThemeControls,
        toggleMapThemeFollowSite,
        resetConstellationControls,
        ensureAuraControls,
        ensureFxControls,
        applyMapTheme,
        toggleFxControl
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
        if (state.container && state.canvas && state.ctx) {
            return;
        }

        ensureAuraControls();
        ensureFxControls();

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
        applyMapTheme(container);

        if (!state.themeObserver && typeof MutationObserver === 'function') {
            state.themeObserver = new MutationObserver(() => {
                if (!state.container) return;
                applyMapTheme(state.container);
                if (state.container.style.display === 'none') return;
                renderToolbarState();
                requestDraw();
            });
            state.themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-native-scheme']
            });
        }

        if (ns.FX && ns.FX.manager) {
            ns.FX.manager.init(container);
        }

        const toolbarHandlers = ns._toolbarHandlers || {};
        container.addEventListener('click', (event) => {
            toolbarHandlers.handleToolbarClick?.(event);
        });

        container.addEventListener('input', (event) => {
            toolbarHandlers.handleToolbarInput?.(event);
        });

        bindEvents();
        state.resizeHandler?.();
        renderInspector();
        updateInspectorCoverState();
        renderToolbarState();
    }

    ns._toolbar = {
        ensureContainer
    };

})(window.EveConstellationMap);
