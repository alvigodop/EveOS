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
        const nodeCount = state.nodes.length;
        const maxSpeed = 30; // Absolute safety cap for massive maps

        // Pre-gather hubs (categories and workspaces) for the exclusion zone check
        const hubs = [];
        for (let i = 0; i < nodeCount; i++) {
            const n = state.nodes[i];
            if (n.kind === 'category' || n.kind === 'workspace') {
                hubs.push(n);
            }
        }

        for (let i = 0; i < nodeCount; i++) {
            const node = state.nodes[i];
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) continue;

            if (isNodeStatic(node)) {
                if (!node.staticAnchor) {
                    setStaticAnchor(node);
                }

                node.x = Number(node.staticAnchor?.x) || node.x;
                node.y = Number(node.staticAnchor?.y) || node.y;
                node.vx = 0;
                node.vy = 0;
                continue;
            }

            const anchor = getMotionTargetAnchor(node, getNodeAnchor(node), motionProfile);
            const anchorPull = getDynamicAnchorPull(node, centerPull, motionProfile);
            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;

            const isDirectCardChild = pNode && (pNode.kind === 'category' || pNode.kind === 'workspace');

            if (!isDirectCardChild) {
                node.vx += (anchor.x - node.x) * anchorPull;
                node.vy += (anchor.y - node.y) * anchorPull;
            } else if (node.kind === 'folder') {
                const hierAnchor = state.hierarchyAnchors?.get(node.id);
                if (hierAnchor) {
                    node.vx += (hierAnchor.x - node.x) * anchorPull * 0.6;
                    node.vy += (hierAnchor.y - node.y) * anchorPull * 0.6;
                }
            }

            if (node.kind === 'category') {
                stabilizeWorkspaceCategory(node, pNode, anchor, motionProfile);
            } else if (node.kind === 'folder') {
                applyFolderRecovery(node, pNode, anchor, motionProfile);
            } else if (node.kind === 'link') {
                applyBookmarkAwayBias(node, pNode, anchor, motionProfile);
            }

            const velocityDamping = getDynamicVelocityDamping(node, motionProfile);
            node.vx *= velocityDamping;
            node.vy *= velocityDamping;

            // VELOCITY CLAMPING
            const speedSq = (node.vx * node.vx) + (node.vy * node.vy);
            if (speedSq > (maxSpeed * maxSpeed)) {
                const speed = Math.sqrt(speedSq);
                node.vx = (node.vx / speed) * maxSpeed;
                node.vy = (node.vy / speed) * maxSpeed;
            }

            stabilizeNodeMotion(node, anchor, motionProfile);

            node.x += node.vx;
            node.y += node.vy;

            applyMotionModePositioning(node, anchor, motionProfile);
            applySoftWorldTether(node, motionProfile);
            stabilizeNodeMotion(node, anchor, motionProfile);
            stabilizeDirectCardBookmarkClearance(node, anchor);

            if (node.kind !== 'category' && node.kind !== 'workspace') {
                for (let j = 0; j < hubs.length; j++) {
                    const hub = hubs[j];
                    if (hub.id === node.id) continue;

                    const hubRadius = (Number(hub.radius) || 60);
                    const range = hubRadius * 3.5; // Only check if reasonably close

                    const edx = node.x - hub.x;
                    const edy = node.y - hub.y;
                    
                    // Spatial Gate (Square)
                    if (Math.abs(edx) > range || Math.abs(edy) > range) continue;

                    const edistSq = edx * edx + edy * edy;
                    const minDist = hubRadius * 2.2;
                    const minDistSq = minDist * minDist;

                    if (edistSq < minDistSq) {
                        const edist = Math.sqrt(edistSq) || 1;
                        const deficit = minDist - edist;
                        const nx = edx / edist;
                        const ny = edy / edist;
                        node.x += nx * deficit * 0.8;
                        node.y += ny * deficit * 0.8;
                        const radialV = node.vx * nx + node.vy * ny;
                        if (radialV < 0) {
                            node.vx -= nx * radialV;
                            node.vy -= ny * radialV;
                        }
                        node.vx *= 0.5;
                        node.vy *= 0.5;
                    }
                }
            }
        }
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runIntegrationPass });

})(window.EveConstellationMap);