window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const eventState = ns._eventState || {};
    const eventCanvas = ns._eventCanvas || {};
    const eventInspector = ns._eventInspector || {};
    const eventWindow = ns._eventWindow || {};

    const { state } = shared;
    const { setSelectedNode, setHoveredNode, runFind } = eventState;
    const { bindCanvasEvents } = eventCanvas;
    const { bindInspectorEvents } = eventInspector;
    const { bindWindowEvents } = eventWindow;

    function bindEvents() {
        if (state.bound || !state.canvas || !state.container) return;
        bindCanvasEvents?.();
        bindInspectorEvents?.();
        bindWindowEvents?.();
        state.bound = true;
    }

    ns._events = {
        bindEvents,
        runFind,
        setSelectedNode,
        setHoveredNode
    };
})(window.EveConstellationMap);
