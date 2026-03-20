window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, text } = shared;

    function getManualAnchorTarget(anchor) {
        if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
            return { x: 0, y: 0 };
        }
        const driftRadius = Math.max(0, Number(anchor.driftRadius) || 0);
        if (!driftRadius) {
            return { x: anchor.x, y: anchor.y };
        }
        const speed = Math.max(0.0001, Number(anchor.speed) || 0.0004);
        const phase = Number(anchor.phase) || 0;
        const now = Date.now();
        return {
            x: anchor.x + (Math.cos((now * speed) + phase) * driftRadius),
            y: anchor.y + (Math.sin((now * speed * 0.87) + (phase * 1.19)) * driftRadius * 0.78)
        };
    }

    function normalizeAngle(angle) {
        let value = Number.isFinite(angle) ? angle : 0;
        while (value <= -Math.PI) value += Math.PI * 2;
        while (value > Math.PI) value -= Math.PI * 2;
        return value;
    }

    function stepAngleToward(current, target, factor, maxStep) {
        const currentAngle = normalizeAngle(current);
        const targetAngle = normalizeAngle(target);
        let delta = normalizeAngle(targetAngle - currentAngle);
        delta *= Math.max(0, Math.min(1, Number(factor) || 0));
        const stepLimit = Math.max(0.0001, Number(maxStep) || 0.0001);
        if (delta > stepLimit) delta = stepLimit;
        if (delta < -stepLimit) delta = -stepLimit;
        return normalizeAngle(currentAngle + delta);
    }

    function getNodeAnchor(node) {
        if (node?.manualAnchor && Number.isFinite(node.manualAnchor.x) && Number.isFinite(node.manualAnchor.y)) {
            return getManualAnchorTarget(node.manualAnchor);
        }
        const optimal = state.hierarchyAnchors && state.hierarchyAnchors.get(node.id);
        if (optimal) return optimal;
        const anchorNodeId = text(node?.data?.anchorNodeId, '');
        if (anchorNodeId) {
            const anchorNode = state.nodeIndex.get(anchorNodeId);
            if (anchorNode) {
                return { x: anchorNode.x, y: anchorNode.y };
            }
        }
        return state.worldAnchor || { x: 0, y: 0 };
    }

    function getScreenPoint(node) {
        return {
            x: (node.x * state.transform.scale) + state.transform.tx,
            y: (node.y * state.transform.scale) + state.transform.ty
        };
    }

    const renderAnchors = ns._renderAnchors = ns._renderAnchors || {};
    Object.assign(renderAnchors, {
        getManualAnchorTarget,
        normalizeAngle,
        stepAngleToward,
        getNodeAnchor,
        getScreenPoint
    });
})(window.EveConstellationMap);
