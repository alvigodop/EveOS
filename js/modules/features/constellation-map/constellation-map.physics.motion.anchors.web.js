window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const physicsAura = ns._physicsAura || {};

    const {
        state,
        MOTION_MODE_ORDER,
        isNodeStatic
    } = shared;
    const { isNodeMain } = physicsAura;

    function applyMotionModePositioning(node, anchor, motionProfile) {
        if (!node || !anchor || motionProfile?.mode !== 'web' || node?.manualAnchor || isNodeStatic(node)) return;

        if (node.kind === 'workspace') {
            node.x += (anchor.x - node.x) * 0.26;
            node.y += (anchor.y - node.y) * 0.26;
            node.vx *= 0.18;
            node.vy *= 0.18;
            return;
        }

        if (node.kind === 'category') {
            node.x += (anchor.x - node.x) * 0.22;
            node.y += (anchor.y - node.y) * 0.22;
            node.vx *= 0.22;
            node.vy *= 0.22;
            return;
        }

        if (node.kind === 'folder') {
            const dx = anchor.x - node.x;
            const dy = anchor.y - node.y;
            node.x += dx * 0.25;
            node.y += dy * 0.25;
            node.vx *= 0.88;
            node.vy *= 0.88;
        }
    }

    function setWebMotionAnchor(node, position) {
        if (!node) return;
        const nodeId = String(node.id || '');
        if (!nodeId) return;
        const point = position && typeof position === 'object' ? position : node;
        if (node.kind === 'folder') return;

        state.motionAnchors.set(nodeId, {
            type: 'absolute',
            x: Number(point?.x) || 0,
            y: Number(point?.y) || 0
        });
    }

    function syncMotionAnchors(forceCapture) {
        const normalizedMode = MOTION_MODE_ORDER.includes(state.motionMode)
            ? state.motionMode
            : 'web';

        if (normalizedMode !== 'web') {
            state.motionAnchors = new Map();
            state.lastMotionMode = normalizedMode;
            return;
        }

        if (!forceCapture && state.lastMotionMode === 'web' && state.motionAnchors.size) {
            return;
        }

        state.motionAnchors = new Map();
        state.nodes.forEach((node) => {
            if (!node) return;
            if (!isNodeMain(node)) return;
            setWebMotionAnchor(node);
        });
        state.lastMotionMode = 'web';
    }

    function getMotionTargetAnchor(node, baseAnchor, motionProfile) {
        if (!node || !baseAnchor || motionProfile?.mode !== 'web') return baseAnchor;

        const lockedAnchor = state.motionAnchors.get(String(node.id || ''));
        if (isNodeMain(node)) {
            if (!Number.isFinite(lockedAnchor?.x) || !Number.isFinite(lockedAnchor?.y)) return baseAnchor;
            return {
                x: lockedAnchor.x,
                y: lockedAnchor.y
            };
        }

        return baseAnchor;
    }

    ns._physicsMotionAnchorsWeb = Object.assign(ns._physicsMotionAnchorsWeb || {}, {
        applyMotionModePositioning,
        setWebMotionAnchor,
        syncMotionAnchors,
        getMotionTargetAnchor
    });
})(window.EveConstellationMap);
