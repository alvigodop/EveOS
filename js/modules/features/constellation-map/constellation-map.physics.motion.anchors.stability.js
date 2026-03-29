window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const physicsMotionProfiles = ns._physicsMotionProfiles || {};

    const {
        state,
        getMotionTuningValue,
        isNodeStatic
    } = shared;
    const { getMaxNodeSpeed } = physicsMotionProfiles;

    function stabilizeNodeMotion(node, anchor, motionProfile) {
        if (!node) return;

        const safeAnchor = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
            ? anchor
            : (state.worldAnchor || { x: 0, y: 0 });

        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
            node.x = safeAnchor.x;
            node.y = safeAnchor.y;
            node.vx = 0;
            node.vy = 0;
            return;
        }

        if (!Number.isFinite(node.vx)) node.vx = 0;
        if (!Number.isFinite(node.vy)) node.vy = 0;

        const maxSpeed = getMaxNodeSpeed(node, motionProfile);
        const speedSq = (node.vx * node.vx) + (node.vy * node.vy);
        const speed = Math.sqrt(speedSq);

        if (speed > maxSpeed && speed > 0.001) {
            const scale = maxSpeed / speed;
            node.vx *= scale;
            node.vy *= scale;
        }

        const settleThreshold = 0.02;
        if (speed < settleThreshold && speed > 0) {
            const settleFactor = Math.max(0, (speed / settleThreshold));
            node.vx *= settleFactor;
            node.vy *= settleFactor;
            if (speed < 0.001) {
                node.vx = 0;
                node.vy = 0;
            }
        }

        const anchorDx = node.x - safeAnchor.x;
        const anchorDy = node.y - safeAnchor.y;
        const anchorDist = Math.sqrt((anchorDx * anchorDx) + (anchorDy * anchorDy));
        const maxDist = Math.max(240, Number(state.worldRadius || 0) * 1.12);

        if (anchorDist > maxDist && anchorDist > 0.001) {
            const scale = maxDist / anchorDist;
            node.x = safeAnchor.x + (anchorDx * scale);
            node.y = safeAnchor.y + (anchorDy * scale);
            node.vx *= 0.38;
            node.vy *= 0.38;
        }
    }

    function applySoftWorldTether(node, motionProfile) {
        if (isNodeStatic(node) || node?.manualAnchor) return;

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
        const tetherScale = (Number(motionProfile?.worldTetherScale) || 1) * getMotionTuningValue('tether');
        const pull = overflow * (overflow > radius * 0.6 ? 0.00042 : 0.00018) * tetherScale;

        node.vx -= nx * pull;
        node.vy -= ny * pull;
    }

    ns._physicsMotionAnchorsStability = Object.assign(ns._physicsMotionAnchorsStability || {}, {
        stabilizeNodeMotion,
        applySoftWorldTether
    });
})(window.EveConstellationMap);
