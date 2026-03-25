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



function isNodeMain(node) {

        if (!node) return false;

        if (node.kind === 'workspace') return true;

        if (node.kind === 'category' || node.kind === 'folder') {

            const hasParent = state.edges.some((edge) => edge.source.id === node.id && edge.type === 'hierarchy');

            return !hasParent;

        }

        return false;

    }



function applyFolderAura(node, folder, orientX, orientY, distToParent, isRootFolder) {

        if (!node || !folder) return;
        if (!isAuraEffectsEnabled()) return;
        const folderDepth = (folder.data && typeof folder.data.depth === 'number') ? folder.data.depth : 0;
        if (!isAuraEmitterEnabled('folder', folderDepth)) return;



        const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;



        // SINGULARITY FUSION: Immediate children are now EXEMPT from repulsion 

        // to allow them to dock deep into the parent's core.

        const isImmediateChild = (node.parentId === folder.id || (node.data && node.data.anchorNodeId === folder.id));

        if (isImmediateChild) return;

        if (node.id === folder.id) return;



        // PERFORMANCE: Coarse distance check

        const coarseDX = node.x - folder.x;

        const coarseDY = node.y - folder.y;

        if (coarseDX * coarseDX + coarseDY * coarseDY > 1300 * 1300) return;



        // Repulsive center is offset from folder toward parent

        const shape = getFolderAuraShape(folder, distToParent, isRootFolder);
        const offsetDist = shape.offsetDist;

        const fnx = orientX;

        const fny = orientY;



        const centerX = folder.x + fnx * offsetDist;

        const centerY = folder.y + fny * offsetDist;



        // Lateral axis

        const lnx = -fny;

        const lny = fnx;



        const dx = node.x - centerX;

        const dy = node.y - centerY;



        const projLong = dx * fnx + dy * fny; // Positive if toward parent from center

        const distLat = Math.abs(dx * lnx + dy * lny);



        const radiusLat = shape.radiusLat;
        const radiusFront = shape.radiusFront;
        const radiusBack = shape.radiusBack;

        const radiusLong = projLong > 0 ? radiusFront : radiusBack;



        const normDistSq = Math.pow(distLat / radiusLat, 2) + Math.pow(projLong / radiusLong, 2);



        if (normDistSq < 1.0) {

            const normDist = Math.sqrt(normDistSq);

            // STABILIZED: Quadratic force (1-d)^2 ensures a "Soft-Contact" at the boundary

            // This prevents the "spring kick" that causes high-frequency jitter.

            let force = 2.0 * Math.pow(1 - normDist, 2);

            if (nodeDepth >= 2) force *= 1.4;



            // MICRO-DAMPING ZONE: Freeze nodes that are settling into the boundary

            if (normDist > 0.85) {

                node.vx *= 0.85;

                node.vy *= 0.85;

            }



            const rdx = node.x - centerX;

            const rdy = node.y - centerY;

            const rdist = Math.max(1, Math.sqrt(rdx * rdx + rdy * rdy));



            node.vx += (rdx / rdist) * force;

            node.vy += (rdy / rdist) * force;



            // Lateral Shunt

            const sideDot = (dx * lnx + dy * lny) > 0 ? 1 : -1;

            node.vx += lnx * sideDot * (force * 0.8);

            node.vy += lny * sideDot * (force * 0.8);



            // FALLBACK BIAS: If in front half, push behind much harder

            if (projLong > 0) {

                const fallbackForce = 1.2 * (1 - normDist);

                node.vx -= fnx * fallbackForce;

                node.vy -= fny * fallbackForce;

            }

        }

    }



function applyCardAuraRepulsion(node, card, cardData) {

        if (!node || !card || !cardData) return;
        if (!isAuraEffectsEnabled()) return;
        if (!isAuraEmitterEnabled(card.kind, -1)) return;



        const dx = node.x - card.x;

        const dy = node.y - card.y;

        const distSq = dx * dx + dy * dy;

        // PERFORMANCE: Coarse distance check for Colossal Card Reach (2160px+)
        if (distSq > 2500 * 2500) return;

        // ALL EXEMPTIONS DELETED. Every single child node, regardless of depth, must respect the Main Card Aura.

        const dist = Math.sqrt(distSq) || 1;



        // Project onto card's local axes

        const projLong = dx * cardData.frontX + dy * cardData.frontY;

        const latX = -cardData.frontY;

        const latY = cardData.frontX;

        const distLat = Math.abs(dx * latX + dy * latY);



        // Teardrop radii relative to card radius

        const shape = getCardAuraShape(card);
        const radiusBack = shape.radiusBack;
        const radiusFront = shape.radiusFront;
        const radiusLat = shape.radiusLat;



        const radiusLong = projLong > 0 ? radiusFront : radiusBack;

        const normDistSq = Math.pow(distLat / radiusLat, 2) + Math.pow(projLong / radiusLong, 2);

        // CLEARANCE TARGET: Expand the boundary to physically block the node BEFORE its graphic radius crosses the dashed line.
        const marginRatio = ((Number(node.radius) || 16) + 4) / radiusLong;
        const clearanceRatio = 1.25 + marginRatio;

        if (normDistSq < clearanceRatio * clearanceRatio) {
            const normDist = Math.sqrt(normDistSq);
            const penetration = clearanceRatio - normDist;
            // How deep inside: 0 = at boundary, 1 = at center
            const depthRatio = penetration / clearanceRatio;

            // STRENGTHENED BOUNDARY: Increased base force and quadratic ramp
            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
            let force = 12.0 * penetration + 45.0 * Math.pow(penetration, 2);
            if (nodeDepth >= 2) force *= 1.4;

            // GRADUATED DAMPING: More aggressive damping to prevent oscillation at the wall
            const dampFactor = Math.max(0.1, 0.6 - depthRatio * 0.5);
            node.vx *= dampFactor;
            node.vy *= dampFactor;

            const nx = dx / dist;
            const ny = dy / dist;

            node.vx += nx * force;
            node.vy += ny * force;

            // HARD BOUNDARY ENFORCEMENT: Physical position push to guarantee exclusion.
            // This prevents "tunneling" at high speeds or tight edge springs.
            const pushMagnitude = penetration * radiusLong * 0.5;
            node.x += nx * pushMagnitude;
            node.y += ny * pushMagnitude;

            // Lateral shunt toward the sides
            const sideDot = (dx * latX + dy * latY) > 0 ? 1 : -1;
            node.vx += latX * sideDot * (force * 0.4);
            node.vy += latY * sideDot * (force * 0.4);

            // Fallback (push toward back of card)
            if (projLong > 0) {
                const fallback = 6.0 * penetration + 18.0 * Math.pow(penetration, 2);
                node.vx -= cardData.frontX * fallback;
                node.vy -= cardData.frontY * fallback;
            }
        }

    }



function applyWorkspaceAuraRepulsion(node, workspace, workspaceData) {

        if (!node || !workspace || !workspaceData) return;
        if (!isAuraEffectsEnabled()) return;
        if (!isAuraEmitterEnabled('workspace', -1)) return;

        const frontX = Number(workspaceData.frontX);

        const frontY = Number(workspaceData.frontY);

        if (!Number.isFinite(frontX) || !Number.isFinite(frontY)) return;

        const backX = Number(workspaceData.backX);

        const backY = Number(workspaceData.backY);

        const latX = Number(workspaceData.latX);

        const latY = Number(workspaceData.latY);

        const categoryCount = Math.max(1, Number(workspaceData.categories?.length) || 1);
        const shape = getWorkspaceAuraShape(workspace, categoryCount);
        const capsuleHalfWidth = shape.capsuleHalfWidth;
        const capsuleRadius = shape.capsuleRadius;
        const centerOffset = Number.isFinite(shape.centerOffset) ? shape.centerOffset : shape.backOffset;

        const dx = node.x - workspace.x;

        const dy = node.y - workspace.y;

        const localLat = (dx * latX) + (dy * latY);

        const localBack = (dx * backX) + (dy * backY);

        const shiftedBack = localBack - centerOffset;

        const clampedLat = Math.max(-capsuleHalfWidth, Math.min(capsuleHalfWidth, localLat));

        const capsuleDx = localLat - clampedLat;

        const capsuleDy = shiftedBack;

        const capsuleDistSq = (capsuleDx * capsuleDx) + (capsuleDy * capsuleDy);

        if (capsuleDistSq >= (capsuleRadius * capsuleRadius)) return;

        const capsuleDist = Math.max(1, Math.sqrt(capsuleDistSq));

        const penetration = 1 - (capsuleDist / capsuleRadius);

        const push = 0.95 * penetration;

        const outLat = capsuleDx / capsuleDist;

        const outBack = capsuleDy / capsuleDist;

        const worldX = (latX * outLat) + (backX * outBack);

        const worldY = (latY * outLat) + (backY * outBack);

        node.vx += worldX * push;

        node.vy += worldY * push;

        if (localBack < centerOffset) {

            const fallBack = (centerOffset - localBack) / Math.max(1, capsuleRadius);

            node.vx += backX * fallBack * 0.7;

            node.vy += backY * fallBack * 0.7;

        }

    }



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

                    // Extract the exact teardrop dimensions to calculate the Spinal Socket
                    const dockDist = shape.radiusBack + (Number(node.radius) || 16) + 12; // Extra padding
                    targetX -= rootData.frontX * dockDist;
                    targetY -= rootData.frontY * dockDist;
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

        // High-stiffness recovery: Using full distance instead of (dist - 110)

        const recovery = Math.min(0.08, dist * 0.00015 * recoveryScale);

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



    const moduleApi = ns._physicsAura = ns._physicsAura || {};



    Object.assign(moduleApi, {

        isNodeMain,

        applyFolderAura,

        applyCardAuraRepulsion,

        applyWorkspaceAuraRepulsion,

        applyFolderRecovery,

        applyBookmarkAwayBias,

        stabilizeDirectCardBookmarkClearance

    });



})(window.EveConstellationMap);

