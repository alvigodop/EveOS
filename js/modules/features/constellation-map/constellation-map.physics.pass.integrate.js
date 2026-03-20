window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic, setStaticAnchor } = shared;

    const render = ns._render || {};
    const { getNodeAnchor } = render;

    const physicsHelpers = ns._physicsHelpers || {};
    const {
        getDynamicAnchorPull,
        getDynamicVelocityDamping,
        applyFolderRecovery,
        applyBookmarkAwayBias,
        stabilizeDirectCardBookmarkClearance,
        stabilizeNodeMotion,
        applyMotionModePositioning,
        getMotionTargetAnchor,
        applySoftWorldTether
    } = physicsHelpers;

    function stabilizeWorkspaceCategory(node, parentNode, anchor, motionProfile) {
        if (!node || node.kind !== 'category' || !parentNode || parentNode.kind !== 'workspace' || !anchor) return;

        const mode = motionProfile?.mode || 'web';
        const extraPull = mode === 'web' ? 0.012 : 0.006;
        const orbitDamping = mode === 'web' ? 0.68 : 0.44;
        const radialClamp = mode === 'web' ? 0.018 : 0.009;

        node.vx += (anchor.x - node.x) * extraPull;
        node.vy += (anchor.y - node.y) * extraPull;

        const dx = node.x - parentNode.x;
        const dy = node.y - parentNode.y;
        const dist = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
        const tx = -dy / dist;
        const ty = dx / dist;
        const tangentialVelocity = (node.vx * tx) + (node.vy * ty);

        node.vx -= tx * tangentialVelocity * orbitDamping;
        node.vy -= ty * tangentialVelocity * orbitDamping;

        const targetDx = anchor.x - parentNode.x;
        const targetDy = anchor.y - parentNode.y;
        const targetDist = Math.sqrt((targetDx * targetDx) + (targetDy * targetDy));
        if (Number.isFinite(targetDist) && targetDist > 1) {
            const radialDelta = dist - targetDist;
            const nx = dx / dist;
            const ny = dy / dist;
            node.vx -= nx * radialDelta * radialClamp;
            node.vy -= ny * radialDelta * radialClamp;
        }
    }

    function runIntegrationPass(ctx) {
        const { centerPull, motionProfile } = ctx;

        state.nodes.forEach((node) => {
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

            if (isNodeStatic(node)) {
                if (!node.staticAnchor) {
                    setStaticAnchor(node);
                }

                node.x = Number(node.staticAnchor?.x) || node.x;
                node.y = Number(node.staticAnchor?.y) || node.y;
                node.vx = 0;
                node.vy = 0;
                return;
            }

            const anchor = getMotionTargetAnchor(node, getNodeAnchor(node), motionProfile);
            const anchorPull = getDynamicAnchorPull(node, centerPull, motionProfile);
            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;

            node.vx += (anchor.x - node.x) * anchorPull;
            node.vy += (anchor.y - node.y) * anchorPull;

            if (node.kind === 'category') {
                stabilizeWorkspaceCategory(node, pNode, anchor, motionProfile);
            } else if (node.kind === 'folder') {
                applyFolderRecovery(node, anchor, motionProfile);
            } else if (node.kind === 'link') {
                applyBookmarkAwayBias(node, pNode, anchor, motionProfile);
            }

            const velocityDamping = getDynamicVelocityDamping(node, motionProfile);
            node.vx *= velocityDamping;
            node.vy *= velocityDamping;

            stabilizeNodeMotion(node, anchor, motionProfile);

            node.x += node.vx;
            node.y += node.vy;

            applyMotionModePositioning(node, anchor, motionProfile);
            applySoftWorldTether(node, motionProfile);
            stabilizeNodeMotion(node, anchor, motionProfile);
            stabilizeDirectCardBookmarkClearance(node, anchor);
        });
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runIntegrationPass });

})(window.EveConstellationMap);

