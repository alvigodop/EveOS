window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const view = ns._view || {};

    const { state, getViewportSize } = shared;
    const { fitToGraph, zoomAt, getCanvasCenterClientPoint } = view;

    function bindWindowEvents() {
        state.resizeHandler = function () {
            if (!state.canvas) return;
            const viewport = getViewportSize();
            const rect = state.canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(Number(rect.width) || viewport.width || 1));
            const height = Math.max(1, Math.round(Number(rect.height) || viewport.height || 1));
            state.canvas.width = width;
            state.canvas.height = height;
            fitToGraph();
        };
        window.addEventListener('resize', state.resizeHandler);

        state.keyHandler = function (event) {
            if (!state.container || state.container.style.display === 'none') return;

            if (event.key === 'Escape') {
                event.preventDefault();
                if (state.actionWheel?.visible && typeof ns._closeConstellationActionWheel === 'function') {
                    ns._closeConstellationActionWheel();
                    return;
                }
                ns.closeMap();
            } else if (event.key === ' ' || event.code === 'Space') {
                state.pointer.forcePan = true;
            } else if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                const center = getCanvasCenterClientPoint();
                zoomAt(1.12, center.x, center.y);
            } else if (event.key === '-') {
                event.preventDefault();
                const center = getCanvasCenterClientPoint();
                zoomAt(0.9, center.x, center.y);
            }
        };
        window.addEventListener('keydown', state.keyHandler);

        state.keyUpHandler = function (event) {
            if (event.key === ' ' || event.code === 'Space') {
                state.pointer.forcePan = false;
            }
        };
        window.addEventListener('keyup', state.keyUpHandler);
    }

    ns._eventWindow = Object.assign(ns._eventWindow || {}, {
        bindWindowEvents
    });
})(window.EveConstellationMap);
