window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const {

        state,

        MOTION_MODE_ORDER,

        text,

        getMotionTuningValue,

        getPolarityStrengthValue,

        getNodePolarityState,

        getCardAuraShape,

        getFolderAuraShape,

        getWorkspaceAuraShape,

        isAuraEffectsEnabled,

        isAuraEmitterEnabled,

        isNodeStatic,

        setStaticAnchor

    } = shared;



function applyFolderRecovery(node, parentNode, anchor, motionProfile) {
        if (!node || node.kind !== 'folder' || !anchor) return;

        let targetX = anchor.x;
        let targetY = anchor.y;

        // AURA PENETRATION KILL-SWITCH: If we are anywhere inside the Card's teardrop aura, 
        // the only force that should act on us is the physical boundary repulsion!
        // We completely deactivate the pulling spring to prevent dragging the node through the Card's center.
        if (parentNode) {
            const isRootParent = parentNode.kind === 'category' || parentNode.kind === 'workspace';
            if (isRootParent) {
                const rootData = state.chainRoots?.get(parentNode.chainId);
                if (rootData && rootData.frontX !== undefined && rootData.frontY !== undefined) {
                    const cx = node.x - parentNode.x;
                    const cy = node.y - parentNode.y;
                    const projLong = cx * rootData.frontX + cy * rootData.frontY;
                    const distLat = Math.abs(cx * -rootData.frontY + cy * rootData.frontX);
                    const shape = getCardAuraShape(parentNode);
                    const radiusLong = projLong > 0 ? shape.radiusFront : shape.radiusBack;
                    const normDistSq = Math.pow(distLat / shape.radiusLat, 2) + Math.pow(projLong / radiusLong, 2);
                    const clearanceRatio = 1.0 + (((Number(node.radius) || 16) + 4) / radiusLong);
                    
                    if (normDistSq < clearanceRatio * clearanceRatio) {
                        return; // AURA BREACHED! KILL ALL PULL FORCES IMMEDIATELY!
                    }

                    // SPINAL DOCKING: Target is directly behind the card, just outside the aura
                    const dockDist = shape.radiusBack + (Number(node.radius) || 16) + 20;
                    targetX = parentNode.x - rootData.frontX * dockDist;
                    targetY = parentNode.y - rootData.frontY * dockDist;
                }
            }
        }

        const dx = targetX - node.x;
        const dy = targetY - node.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy));

        if (!Number.isFinite(dist) || dist <= 1) return;

        // SPINAL DOCK DEADZONE: Prevents the root folder from relentlessly fighting the socket Target.
        if (parentNode) {
            const isRootParent = parentNode.kind === 'category' || parentNode.kind === 'workspace';
            // Because targetX/Y is already perfectly shifted to the exterior padding, 
            // the Folder safely deactivates its spring once it sits directly on that coordinate.
            if (isRootParent && dist < 12) {
                node.vx *= 0.85;
                node.vy *= 0.85;
                return;
            }
        }



        const recoveryScale = (Number(motionProfile?.folderRecoveryScale) || 1) * getMotionTuningValue('folderRecovery');

        const isRootFolder = parentNode && (parentNode.kind === 'category' || parentNode.kind === 'workspace');

        // Root folders get a MUCH stiffer spring to lock behind the card's aura direction
        const stiffness = isRootFolder ? 0.004 : 0.00015;
        const maxRecovery = isRootFolder ? 0.25 : 0.08;
        const recovery = Math.min(maxRecovery, dist * stiffness * recoveryScale);

        node.vx += dx * recovery;

        node.vy += dy * recovery;

    }



function applyBookmarkAwayBias(node, parentNode, anchor, motionProfile) {

        if (!node || node.kind !== 'link' || !parentNode || !anchor) return;



        const dx = node.x - parentNode.x;

        const dy = node.y - parentNode.y;

        const distSq = dx * dx + dy * dy;



        // Dynamic Scaling: Core-Fusion for roots, Dynamic Reach for sub-folders

        const isRootParent = (parentNode.kind === 'category' || parentNode.kind === 'workspace');

        const frontierReach = getMotionTuningValue('frontierReach');

        const minReach = isRootParent ? 5 : (frontierReach * 0.7);



        // 1. STABILIZED Reach Guard: Quadratic "Soft-Contact" Repulsion

        if (distSq < minReach * minReach) {

            const dist = Math.sqrt(distSq) || 1;

            const normDist = dist / minReach;



            // Quadratic scaling: Starts at 0 at the boundary, ramps up smoothly
            const forceBase = isRootParent ? 1.5 : 1.0;

            const pushForce = Math.pow(1 - normDist, 2) * minReach * forceBase;



            node.vx += (dx / dist) * pushForce;

            node.vy += (dy / dist) * pushForce;



            // MICRO-DAMPING ZONE: Drain velocity near the boundary to prevent jitter

            if (normDist > 0.90) {

                node.vx *= 0.88;

                node.vy *= 0.88;

            }

        }



        // 2. Proactive Spinal Bias: Damped as it approaches the anchor
        let targetX = anchor.x;
        let targetY = anchor.y;

        // AURA PENETRATION KILL-SWITCH
        if (isRootParent) {
            const rootData = state.chainRoots?.get(parentNode.chainId);
            if (rootData && rootData.frontX !== undefined && rootData.frontY !== undefined) {
                const cx = node.x - parentNode.x;
                const cy = node.y - parentNode.y;
                const projLong = cx * rootData.frontX + cy * rootData.frontY;
                const distLat = Math.abs(cx * -rootData.frontY + cy * rootData.frontX);
                const shape = getCardAuraShape(parentNode);
                const radiusLong = projLong > 0 ? shape.radiusFront : shape.radiusBack;
                const normDistSq = Math.pow(distLat / shape.radiusLat, 2) + Math.pow(projLong / radiusLong, 2);
                const clearanceRatio = 1.0 + (((Number(node.radius) || 12) + 4) / radiusLong);
                
                if (normDistSq < clearanceRatio * clearanceRatio) {
                    return; // AURA BREACHED! SURRENDER TO REPULSION!
                }

                // SPINAL SOCKET NAVIGATION 
                // Exact exterior of the widest back aura (radiusBack + bookmark radius + padding)
                const dockDist = shape.radiusBack + (Number(node.radius) || 12) + 12;
                targetX -= rootData.frontX * dockDist;
                targetY -= rootData.frontY * dockDist;
            }
        }

        const adx = targetX - node.x;
        const ady = targetY - node.y;

        const adistSq = adx * adx + ady * ady;

        if (adistSq > 1) {
            const adist = Math.sqrt(adistSq);

            // PERFECT DOCK DEADZONE: Cease structural pulling once it aligns outside the Aura visually.
            if (isRootParent && adist < 15) {
                node.vx *= 0.85;
                node.vy *= 0.85;
                return;
            }

            // BLACK HOLE GLUE: High-Stiffness anchoring for zero-latency tracking

            const proximityDamping = Math.min(1, adist / 50);

            const biasForce = (isRootParent ? 0.08 : 0.22) * proximityDamping;



            // 1. Proportional Acceleration (Spring)

            node.vx += (adx / adist) * biasForce;

            node.vy += (ady / adist) * biasForce;



            // 2. High-Tension "Glue" (Stiffness coefficient)

            if (isRootParent) {

                node.vx += adx * 0.002;

                node.vy += ady * 0.002;

            }



            // TANGENTIAL FRICTION: High-Intensity spin suppression to "lock" the close-orbit

            const dist = Math.sqrt(distSq) || 1;

            const tx = -dy / dist; // Perpendicular vector (tangent)

            const ty = dx / dist;

            const tangentialVel = node.vx * tx + node.vy * ty;

            // Drain tangential energy aggressively (0.35) to stop all "spinning"

            node.vx -= tx * tangentialVel * 0.35;

            node.vy -= ty * tangentialVel * 0.35;

        }

    }



function stabilizeDirectCardBookmarkClearance(node, anchor) {
        // UNIVERSAL HARD POSITIONAL AURA CLAMP:
        // After ALL velocity integration, check this node against EVERY card aura in the system.
        // If the node ended up inside ANY card's teardrop aura, teleport it to the boundary.
        // This is mathematically impossible to overwhelm because it operates on final position.
        if (!node) return;
        // Cards don't clamp against themselves
        if (node.kind === 'category' || node.kind === 'workspace') return;

        const chainRoots = state.chainRoots;
        if (!chainRoots || !chainRoots.size) return;

        chainRoots.forEach((rootData) => {
            const card = rootData.node;
            if (!card || card.id === node.id) return;
            if (rootData.frontX === undefined || rootData.frontY === undefined) return;

            const cdx = node.x - card.x;
            const cdy = node.y - card.y;
            const coarseDistSq = cdx * cdx + cdy * cdy;
            if (coarseDistSq > 2500 * 2500) return;

            const projLong = cdx * rootData.frontX + cdy * rootData.frontY;
            const latAxis_x = -rootData.frontY;
            const latAxis_y = rootData.frontX;
            const absDistLat = Math.abs(cdx * latAxis_x + cdy * latAxis_y);

            const shape = getCardAuraShape(card);
            const radiusLong = projLong > 0 ? shape.radiusFront : shape.radiusBack;
            const normDistSq = Math.pow(absDistLat / shape.radiusLat, 2) + Math.pow(projLong / radiusLong, 2);

            const nodeR = (Number(node.radius) || 12) + 6;
            const marginRatio = nodeR / radiusLong;
            const clearanceRatio = 1.25 + marginRatio;

            if (normDistSq < clearanceRatio * clearanceRatio) {
                // SMOOTH EASING CLAMP: Instead of a jarring instant teleport,
                // ease the node 70% of the way toward the boundary each frame.
                // This produces silk-smooth docking over 3-5 frames.
                const normDist = Math.sqrt(normDistSq) || 0.001;
                const targetScale = (clearanceRatio / normDist);
                const targetX = card.x + cdx * targetScale;
                const targetY = card.y + cdy * targetScale;
                // Ease 70% toward the target position
                node.x += (targetX - node.x) * 0.7;
                node.y += (targetY - node.y) * 0.7;
                // Gently drain residual velocity
                node.vx *= 0.5;
                node.vy *= 0.5;
            }
        });
    }




    ns._physicsAuraRecovery = Object.assign(ns._physicsAuraRecovery || {}, {
        applyFolderRecovery,
        applyBookmarkAwayBias,
        stabilizeDirectCardBookmarkClearance
    });

})(window.EveConstellationMap);
