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

            node.vx += (anchor.x - node.x) * anchorPull;
            node.vy += (anchor.y - node.y) * anchorPull;

            if (node.kind === 'folder') {
                applyFolderRecovery(node, anchor, motionProfile);
            } else if (node.kind === 'link') {
                const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
                const pNode = pId ? state.nodeIndex.get(pId) : null;
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
