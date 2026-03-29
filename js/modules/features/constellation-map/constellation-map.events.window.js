window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const view = ns._view || {};

    const { state, getViewportSize } = shared;
    const { fitToGraph, zoomAt } = view;

    function bindWindowEvents() {
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
                if (state.actionWheel?.visible && typeof ns._closeConstellationActionWheel === 'function') {
                    ns._closeConstellationActionWheel();
                    return;
                }
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
