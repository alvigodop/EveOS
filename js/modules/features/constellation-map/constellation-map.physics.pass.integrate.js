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
        const distSq = (dx * dx) + (dy * dy);
        const dist = Math.max(1, Math.sqrt(distSq));
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

    const HUB_GRID_SIZE = 250;
    const hubGrid = new Map();

    function updateHubGrid(hubs) {
        hubGrid.clear();
        for (let i = 0; i < hubs.length; i++) {
            const hub = hubs[i];
            const gx = Math.floor(hub.x / HUB_GRID_SIZE);
            const gy = Math.floor(hub.y / HUB_GRID_SIZE);
            const key = `${gx},${gy}`;
            if (!hubGrid.has(key)) hubGrid.set(key, []);
            hubGrid.get(key).push(hub);
        }
    }

    function runIntegrationPass(ctx) {
        const { centerPull, motionProfile, hubs } = ctx;
        const nodeCount = state.nodes.length;
        const maxSpeed = 25; 
        let totalKineticEnergy = 0;

        // Viewport center for interaction radius
        const vpcX = -state.transform.tx / state.transform.scale + (state.canvas.width / 2) / state.transform.scale;
        const vpcY = -state.transform.ty / state.transform.scale + (state.canvas.height / 2) / state.transform.scale;
        const interactionRadiusSq = Math.pow(2000 / state.transform.scale, 2);

        if (hubs) updateHubGrid(hubs);

        for (let i = 0; i < nodeCount; i++) {
            const node = state.nodes[i];
            
            // Interaction Radius Gate (Active/Cold Tiers)
            const distToCenterSq = Math.pow(node.x - vpcX, 2) + Math.pow(node.y - vpcY, 2);
            const isNearViewport = distToCenterSq < interactionRadiusSq;
            const isMoving = (node.vx * node.vx + node.vy * node.vy) > 0.001;
            
            // If massive, skip physics for distant static-ish nodes
            if (nodeCount > 10000 && !isNearViewport && !isMoving && node.kind !== 'category' && node.kind !== 'workspace') {
                continue; 
            }

            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) {
                totalKineticEnergy += (node.vx * node.vx) + (node.vy * node.vy);
                continue;
            }

            if (isNodeStatic(node)) {
                if (!node.staticAnchor) setStaticAnchor(node);
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

            // Velocity Clamping
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

            // Hub Exclusion using Spatial Grid
            if (node.kind !== 'category' && node.kind !== 'workspace' && hubs) {
                const gx = Math.floor(node.x / HUB_GRID_SIZE);
                const gy = Math.floor(node.y / HUB_GRID_SIZE);

                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        const key = `${gx + ox},${gy + oy}`;
                        const cellHubs = hubGrid.get(key);
                        if (!cellHubs) continue;

                        for (let j = 0; j < cellHubs.length; j++) {
                            const hub = cellHubs[j];
                            if (hub.id === node.id) continue;

                            const edx = node.x - hub.x;
                            const edy = node.y - hub.y;
                            const edistSq = edx * edx + edy * edy;
                            const hubRadius = (Number(hub.radius) || 60);
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

            totalKineticEnergy += (node.vx * node.vx) + (node.vy * node.vy);
        }
        return totalKineticEnergy;
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runIntegrationPass });

})(window.EveConstellationMap);