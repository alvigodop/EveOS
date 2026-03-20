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

        const offsetDist = 140;

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



        const radiusLat = 1100;

        const distFromCenterToParent = distToParent - offsetDist;



        // Stretch Front rad to encompass parent if it's a Card/Workspace

        const extraBuffer = isRootFolder ? 110 : 250;

        const radiusFront = Math.max(300, distFromCenterToParent + extraBuffer);

        const radiusBack = 250;

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



        const dx = node.x - card.x;

        const dy = node.y - card.y;

        const distSq = dx * dx + dy * dy;

        // PERFORMANCE: Coarse distance check for Colossal Card Reach (2160px+)

        if (distSq > 2500 * 2500) return;

        // SINGULARITY FUSION: Direct children of the Card are exempt from its massive aura.

        if (node.parentId === card.id || (node.data && node.data.anchorNodeId === card.id)) return;

        const dist = Math.sqrt(distSq) || 1;



        // Project onto card's local axes

        const projLong = dx * cardData.frontX + dy * cardData.frontY;

        const latX = -cardData.frontY;

        const latY = cardData.frontX;

        const distLat = Math.abs(dx * latX + dy * latY);



        // Teardrop radii relative to card radius

        const baseRadius = card.radius || 120; // Match renderer baseline

        const radiusBack = baseRadius * 5.0;

        const radiusFront = baseRadius * 18.0;

        const radiusLat = baseRadius * 10.0;



        const radiusLong = projLong > 0 ? radiusFront : radiusBack;

        const normDistSq = Math.pow(distLat / radiusLat, 2) + Math.pow(projLong / radiusLong, 2);



        if (normDistSq < 1.0) {

            const normDist = Math.sqrt(normDistSq);

            // HARDENED: Linear force and significantly higher coefficient

            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;

            let force = 1.3 * (1 - normDist);

            if (nodeDepth >= 2) force *= 1.3; // Sub-sub folders are pushed harder by cards



            node.vx += (dx / dist) * force;

            node.vy += (dy / dist) * force;



            // Lateral shunt

            const sideDot = (dx * latX + dy * latY) > 0 ? 1 : -1;

            node.vx += latX * sideDot * (force * 0.9);

            node.vy += latY * sideDot * (force * 0.9);



            // Fallback (push toward back of card)

            if (projLong > 0) {

                const fallback = 1.0 * (1 - normDist);

                node.vx -= cardData.frontX * fallback;

                node.vy -= cardData.frontY * fallback;

            }

        }

    }



function applyFolderRecovery(node, anchor, motionProfile) {

        if (!node || node.kind !== 'folder' || !anchor) return;

        const dx = anchor.x - node.x;

        const dy = anchor.y - node.y;

        const dist = Math.sqrt((dx * dx) + (dy * dy));



        // SINGULARITY RECOVERY: No 110px deadzone. Pull folders to their heart instantly.

        if (!Number.isFinite(dist) || dist <= 1) return;



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

            const isRootParent = (parentNode.kind === 'category' || parentNode.kind === 'workspace');

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

        const adx = anchor.x - node.x;

        const ady = anchor.y - node.y;

        const adistSq = adx * adx + ady * ady;

        if (adistSq > 1) {

            const adist = Math.sqrt(adistSq);

            const isRootParent = (parentNode.kind === 'category' || parentNode.kind === 'workspace');



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

        if (!node || node.kind !== 'link' || !anchor) return;



        const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';

        const parentNode = parentId ? state.nodeIndex.get(parentId) : null;

        if (!parentNode || (parentNode.kind !== 'category' && parentNode.kind !== 'workspace')) return;



        const dx = node.x - parentNode.x;

        const dy = node.y - parentNode.y;

        const dist = Math.sqrt((dx * dx) + (dy * dy)) || 1;



        const anchorDx = anchor.x - parentNode.x;

        const anchorDy = anchor.y - parentNode.y;

        const anchorDist = Math.sqrt((anchorDx * anchorDx) + (anchorDy * anchorDy));



        let axisX = 0;

        let axisY = 0;

        if (Number.isFinite(anchorDist) && anchorDist > 8) {

            axisX = anchorDx / anchorDist;

            axisY = anchorDy / anchorDist;

        } else if (dist > 1) {

            axisX = dx / dist;

            axisY = dy / dist;

        } else {

            return;

        }



        const minRadius = Math.max(
            (Number(parentNode.radius) || 12) + 24,
            (Number.isFinite(anchorDist) ? (anchorDist > 60 ? anchorDist * 0.82 : anchorDist * 0.55) : 0),
            32
        );
        if (dist >= minRadius) return;


        node.x = parentNode.x + (axisX * minRadius);

        node.y = parentNode.y + (axisY * minRadius);

        node.vx *= 0.72;

        node.vy *= 0.72;

    }



    const moduleApi = ns._physicsAura = ns._physicsAura || {};



    Object.assign(moduleApi, {

        isNodeMain,

        applyFolderAura,

        applyCardAuraRepulsion,

        applyFolderRecovery,

        applyBookmarkAwayBias,

        stabilizeDirectCardBookmarkClearance

    });



})(window.EveConstellationMap);

