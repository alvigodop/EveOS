window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, getViewportSize } = shared;

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

    ns._graphWorld = Object.assign(ns._graphWorld || {}, {
        initializeWorldField,
        getGraphBounds
    });
})(window.EveConstellationMap);
