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

    const render = ns._render || {};

    const { getNodeAnchor } = render;

    function isNodeMain(node) {
        if (!node) return false;
        if (node.kind === 'workspace') return true;
        if (node.kind === 'category' || node.kind === 'folder') {
            const hasParent = state.edges.some((edge) => edge.source.id === node.id && edge.type === 'hierarchy');
            return !hasParent;
        }
        return false;
    }

    /**
     * Applies a territorial "Teardrop" repulsion for folder nodes.
     * All folders exert a wide 1100px corridor.
     * @param {Object} node - The node being repelled (victim)
     * @param {Object} folder - The folder anchor (source)
     * @param {Object} orientX - Longitudinal X component (Folder -> Parent)
     * @param {Object} orientY - Longitudinal Y component (Folder -> Parent)
     * @param {Object} distToParent - Reference distance to parent for reach
     * @param {Boolean} isRootFolder - Whether this folder is a top-level root
     */
    function applyFolderAura(node, folder, orientX, orientY, distToParent, isRootFolder) {
        if (!node || !folder) return;

        const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;

        // Strict Boundary Enforcement: Immediate children (folders/links) are now always repelled 
        // to ensure they sit strictly at the periphery of the parent's massive aura.
        const isImmediateChild = (node.data && node.data.anchorNodeId === folder.id);
        if (isImmediateChild && node.id === folder.id) return;
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

    /**
     * Applies an asymmetric "Teardrop" aura to the main card/workspace node.
     * Wider in front (away from folders), compact in back (toward folders).
     */
    function applyCardAuraRepulsion(node, card, cardData) {
        if (!node || !card || !cardData) return;

        const dx = node.x - card.x;
        const dy = node.y - card.y;
        const distSq = dx * dx + dy * dy;
        // PERFORMANCE: Coarse distance check for Colossal Card Reach (2160px+)
        if (distSq > 2500 * 2500) return;
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

    function getMotionProfile(nodeCount) {

        const normalizedMode = MOTION_MODE_ORDER.includes(state.motionMode)
            ? state.motionMode
            : 'web';

        if (normalizedMode === 'slow') {

            return {

                mode: normalizedMode,

                repulsionScale: 0.44,

                centerPullScale: 1.18,

                springScale: 0.94,

                hierarchyReactionScale: 0.56,

                folderRecoveryScale: 1.08,

                dampingScale: 0.89,

                speedScale: 0.34,

                worldTetherScale: 1.28,

                anchorScaleByKind: { workspace: 1.42, category: 1.16, folder: 1.02, link: 0.92 },

                dampingScaleByKind: { workspace: 0.9, category: 0.91, folder: 0.93, link: 0.95 },

                speedScaleByKind: { workspace: 0.28, category: 0.36, folder: 0.46, link: 0.6 }

            };

        }

        if (normalizedMode === 'web') {

            return {

                mode: normalizedMode,

                repulsionScale: 0.04,

                centerPullScale: 2.95,

                springScale: 0.38,

                hierarchyReactionScale: 0.02,

                folderRecoveryScale: 3.2,

                dampingScale: 0.8,

                speedScale: 0.2,

                worldTetherScale: 1.42,

                anchorScaleByKind: { workspace: 8.8, category: 6.9, folder: 1.28, link: 1.02 },

                dampingScaleByKind: { workspace: 0.62, category: 0.68, folder: 0.58, link: 0.52 },

                speedScaleByKind: { workspace: 0.03, category: 0.06, folder: 0.22, link: 0.32 }

            };

        }

        if (normalizedMode === 'free') {

            return {

                mode: normalizedMode,

                repulsionScale: 1.42,

                centerPullScale: 0.68,

                springScale: 0.82,

                hierarchyReactionScale: 1.24,

                folderRecoveryScale: 0.62,

                dampingScale: 1.12,

                speedScale: 1.34,

                worldTetherScale: 0.82,

                anchorScaleByKind: { workspace: 0.72, category: 0.78, folder: 0.72, link: 0.7 },

                dampingScaleByKind: { workspace: 1.06, category: 1.05, folder: 1.03, link: 1.02 },

                speedScaleByKind: { workspace: 1.2, category: 1.18, folder: 1.12, link: 1.24 }

            };

        }

        return {

            mode: normalizedMode,

            repulsionScale: 0.88,

            centerPullScale: 1.08,

            springScale: 1.02,

            hierarchyReactionScale: 0.74,

            folderRecoveryScale: 1.12,

            dampingScale: 0.95,

            speedScale: 0.74,

            worldTetherScale: 1.12,

            anchorScaleByKind: { workspace: 1.52, category: 1.22, folder: 1.08, link: 0.96 },

            dampingScaleByKind: { workspace: 0.93, category: 0.95, folder: 0.94, link: 0.98 },

            speedScaleByKind: { workspace: 0.5, category: 0.6, folder: 0.42, link: 0.88 }

        };

    }



    function getHierarchyTargetReactionFactor(edge, motionProfile) {

        if (edge?.type !== 'hierarchy') return 1;

        const targetKind = text(edge?.target?.kind, '');

        const sourceKind = text(edge?.source?.kind, '');

        let baseFactor = 1;

        if (targetKind === 'folder') {
            baseFactor = sourceKind === 'link' ? 0.08 : (sourceKind === 'folder' ? 0.12 : 0.48);
        } else if (targetKind === 'link') {
            baseFactor = 0.28;
        } else if (targetKind === 'category') {
            baseFactor = sourceKind === 'folder' ? 0.06 : 0.04;
        } else if (targetKind === 'workspace') {
            baseFactor = 0.02;
        }

        return Math.max(0, baseFactor * (motionProfile?.hierarchyReactionScale || 1) * getMotionTuningValue('hierarchy'));

    }

    function getPairwiseInfluenceScale(targetNode, sourceNode, motionProfile) {

        const targetKind = text(targetNode?.kind, '');
        const sourceKind = text(sourceNode?.kind, '');

        const targetDepth = (targetNode?.data && typeof targetNode.data.depth === 'number') ? targetNode.data.depth : (targetKind === 'link' ? 3 : 0);
        const sourceDepth = (sourceNode?.data && typeof sourceNode.data.depth === 'number') ? sourceNode.data.depth : (sourceKind === 'link' ? 3 : 0);

        const isMainTarget = targetKind === 'workspace' || targetKind === 'category';
        const isMainSource = sourceKind === 'workspace' || sourceKind === 'category';

        // ASYMMETRIC AUTHORITY: Higher levels are harder to push
        if (isMainTarget && !isMainSource) return 0.04; // Main nodes (Cards) are nearly immovable by folders/links
        if (targetDepth < sourceDepth) {
            const gap = sourceDepth - targetDepth;
            return Math.max(0.02, 0.12 / gap); // Hierarchy authority
        }

        // Default pairwise scales
        if (targetKind === 'folder' && sourceKind === 'folder') return 0.4;
        if (targetKind === 'link' || sourceKind === 'link') return 0.5;

        if ((isMainTarget && sourceKind === 'folder') || (targetKind === 'folder' && isMainSource)) {
            return 0.5;
        }

        if (motionProfile?.mode !== 'web') return 1;

        if (targetKind === 'workspace') {
            if (sourceKind === 'link') return 0.02;
            if (sourceKind === 'folder') return 0.05;
            if (sourceKind === 'category') return 0.16;
        }

        if (targetKind === 'category') {
            if (sourceKind === 'link') return 0.04;
            if (sourceKind === 'folder') return 0.12;
            if (sourceKind === 'workspace') return 0.24;
        }

        if (targetKind === 'folder') {
            if (sourceKind === 'link') return 0.22;
            if (sourceKind === 'category') return 0.48;
        }

        return 1;
    }



    function getDynamicAnchorPull(node, baseCenterPull, motionProfile) {

        if (node?.manualAnchor) {

            return Math.max(0.004, Number(node.manualAnchor.pullStrength) || 0.014);

        }

        const profile = motionProfile || getMotionProfile(state.nodes.length);

        const modeScaledBase = baseCenterPull * (profile.centerPullScale || 1);

        if (node?.kind === 'folder') {

            const kindScale = Number(profile.anchorScaleByKind?.folder) || 1;

            if (profile.mode === 'web') {

                return modeScaledBase * kindScale;

            }

            return Math.max(0.0036, modeScaledBase * 5.5 * kindScale);

        }

        const kindScale = Number(profile.anchorScaleByKind?.[String(node?.kind || '')]) || 1;

        return modeScaledBase * kindScale;

    }



    function getDynamicVelocityDamping(node, motionProfile) {

        if (node?.manualAnchor) {

            return Math.min(0.97, Math.max(0.82, Number(node.manualAnchor.damping) || 0.9));

        }

        const profile = motionProfile || getMotionProfile(state.nodes.length);

        const base = node?.kind === 'folder' ? 0.76 : (node?.kind === 'link' ? 0.88 : 0.86);

        const profileScale = Number(profile.dampingScale) || 1;

        const kindScale = Number(profile.dampingScaleByKind?.[String(node.kind || '')]) || 1;

        return Math.min(0.99, Math.max(0.1, base * profileScale * kindScale * getMotionTuningValue('damping')));

    }



    function applyFolderRecovery(node, anchor, motionProfile) {
        if (!node || node.kind !== 'folder' || !anchor) return;
        const dx = anchor.x - node.x;
        const dy = anchor.y - node.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        if (!Number.isFinite(dist) || dist <= 110) return;
        const recoveryScale = (Number(motionProfile?.folderRecoveryScale) || 1) * getMotionTuningValue('folderRecovery');
        const recovery = Math.min(0.03, (dist - 110) * 0.00012 * recoveryScale);
        node.vx += dx * recovery;
        node.vy += dy * recovery;
    }

    /**
     * Proactive bias for bookmarks to stay away from their parent's protected zones.
     * Applies a longitudinal push and a "Reach Guard" to maintain peripheral positioning.
     */
    function applyBookmarkAwayBias(node, parentNode, anchor, motionProfile) {
        if (!node || node.kind !== 'link' || !parentNode || !anchor) return;

        const dx = node.x - parentNode.x;
        const dy = node.y - parentNode.y;
        const distSq = dx * dx + dy * dy;

        // Universal Authority Scaling: 400px+ massive guard
        const minReach = Math.max(400, (parentNode.radius || 60) * 4.5);

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
        if (adistSq > 4) {
            const adist = Math.sqrt(adistSq);
            const isRootParent = (parentNode.kind === 'category' || parentNode.kind === 'workspace');
            
            // Smoothly dampen the bias force as we reach the anchor to avoid orbit/jitter
            const proximityDamping = Math.min(1, adist / 60);
            const biasForce = (isRootParent ? 0.25 : 0.15) * proximityDamping;
            
            node.vx += (adx / adist) * biasForce;
            node.vy += (ady / adist) * biasForce;
        }
    }



    function getReleaseVelocityScale(node) {

        if (!node) return 0.9;

        if (node.kind === 'folder') return 0.42;

        return 0.9;

    }



    function getMaxNodeSpeed(node, motionProfile) {

        if (!node) return 18;

        let base = 10;

        if (node.kind === 'link') base = 6;

        else if (node.kind === 'folder') base = 3.5;

        else if (node.kind === 'category') base = 8;

        else if (node.kind === 'workspace') base = 7;

        const profile = motionProfile || getMotionProfile(state.nodes.length);

        const modeScale = Number(profile.speedScale) || 1;

        const kindScale = Number(profile.speedScaleByKind?.[String(node.kind || '')]) || 1;

        return Math.max(0.05, base * modeScale * kindScale * getMotionTuningValue('speed'));

    }



    function getPolarityDirection(node) {

        return getNodePolarityState(node).effective === 'attract' ? 1 : -1;

    }



    function getPolarityStrength(node, motionProfile) {

        const polarity = getNodePolarityState(node).effective;

        if (polarity !== 'attract') {

            return getPolarityStrengthValue('repel');

        }

        if (motionProfile?.mode === 'web') {

            return getPolarityStrengthValue('attract') * (node?.kind === 'link' ? 0.82 : 0.74);

        }

        return getPolarityStrengthValue('attract') * (node?.kind === 'link' ? 0.88 : 0.8);

    }



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

        const speed = Math.sqrt((node.vx * node.vx) + (node.vy * node.vy));

        if (speed > maxSpeed && speed > 0.001) {

            const scale = maxSpeed / speed;

            node.vx *= scale;

            node.vy *= scale;

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
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 140) {
                node.x += dx * 0.022;
                node.y += dy * 0.022;
            }

            node.vx *= 0.88;

            node.vy *= 0.88;

            return;

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



    function tickPhysics() {

        if (!state.nodes.length || !state.canvas) return;

        const nodeCount = state.nodes.length;

        const motionProfile = getMotionProfile(nodeCount);

        syncMotionAnchors(false);

        const repulsion = (nodeCount > 400 ? 900 : nodeCount > 220 ? 1200 : nodeCount > 120 ? 1600 : nodeCount > 70 ? 2200 : 3200)
            * (motionProfile.repulsionScale || 1)
            * getMotionTuningValue('repulsion');

        const centerPull = (nodeCount > 400 ? 0.00038 : nodeCount > 220 ? 0.0005 : nodeCount > 120 ? 0.0007 : 0.0011)
            * getMotionTuningValue('centerPull');

        const springStrength = (nodeCount > 120 ? 0.0024 : 0.0032)
            * (motionProfile.springScale || 1)
            * getMotionTuningValue('spring');

        const polarityCache = state.nodes.map((node) => ({
            direction: getPolarityDirection(node),
            strength: getPolarityStrength(node, motionProfile)
        }));



        for (let index = 0; index < state.nodes.length; index += 1) {

            const node = state.nodes[index];

            const nodePolarity = polarityCache[index];

            const nodeIsStatic = isNodeStatic(node);

            if (state.pointer.mode === 'node' && state.pointer.node && state.pointer.node.id === node.id) {

                node.vx = 0;

                node.vy = 0;

                continue;

            }



            for (let inner = index + 1; inner < state.nodes.length; inner += 1) {

                const other = state.nodes[inner];

                const otherPolarity = polarityCache[inner];

                const otherIsStatic = isNodeStatic(other);

                const dx = other.x - node.x;

                const dy = other.y - node.y;

                const distSq = Math.max(36, (dx * dx) + (dy * dy));

                const force = repulsion / distSq;

                const dist = Math.sqrt(distSq);

                const nx = dx / dist;

                const ny = dy / dist;

                const isSameChain = node.chainId && node.chainId === other.chainId;

                let chainFactor = 1;
                if (isSameChain) {
                    chainFactor = state.chainInternalForcesEnabled ? 0.15 : 0;
                } else {
                    chainFactor = state.chainExternalForcesEnabled ? 1 : 0;
                }

                let nodeDepthFactor = 1;
                let otherDepthFactor = 1;
                let nodeChainFactor = chainFactor;
                let otherChainFactor = chainFactor;

                if (state.chainHierarchyEnabled && isSameChain) {
                    const bothFolders = node.kind === 'folder' && other.kind === 'folder';
                    const includeBookmarks = state.bookmarkHierarchyEnabled;
                    if (bothFolders || includeBookmarks) {
                        const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
                        const otherDepth = (other.data && typeof other.data.depth === 'number') ? other.data.depth : 0;

                        if (nodeDepth < otherDepth) {
                            const gap = otherDepth - nodeDepth;
                            nodeDepthFactor = Math.max(0.04, 0.15 / gap);
                            const isOtherLink = other.kind === 'link';
                            otherDepthFactor = isOtherLink ? (1.0 + gap * 0.2) : (1.0 + gap * 0.5);
                            otherChainFactor = isOtherLink ? 0.15 : 0.35;
                        } else if (otherDepth < nodeDepth) {
                            const gap = nodeDepth - otherDepth;
                            otherDepthFactor = Math.max(0.04, 0.15 / gap);
                            const isNodeLink = node.kind === 'link';
                            nodeDepthFactor = isNodeLink ? (1.0 + gap * 0.2) : (1.0 + gap * 0.5);
                            nodeChainFactor = isNodeLink ? 0.15 : 0.35;
                        }
                    }
                }

                const nodeInfluenceScale = getPairwiseInfluenceScale(node, other, motionProfile) * nodeChainFactor * nodeDepthFactor;

                const otherInfluenceScale = getPairwiseInfluenceScale(other, node, motionProfile) * otherChainFactor * otherDepthFactor;

                if (!nodeIsStatic) {

                    node.vx += nx * force * otherPolarity.direction * otherPolarity.strength * nodeInfluenceScale;

                    node.vy += ny * force * otherPolarity.direction * otherPolarity.strength * nodeInfluenceScale;

                }

                if (!otherIsStatic) {

                    other.vx -= nx * force * nodePolarity.direction * nodePolarity.strength * otherInfluenceScale;

                    other.vy -= ny * force * nodePolarity.direction * nodePolarity.strength * otherInfluenceScale;

                }

            }

        }



        state.edges.forEach((edge) => {

            const dx = edge.target.x - edge.source.x;

            const dy = edge.target.y - edge.source.y;

            const dist = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));

            let desired = edge.type === 'tag' ? 120 : 100;

            if (edge.type === 'hierarchy' && edge.source?.kind === 'folder') {
                desired = 140;
            }

            const stretch = dist - desired;

            const nx = dx / dist;

            const ny = dy / dist;

            let force = stretch * springStrength;

            if (edge.type === 'hierarchy' && edge.source?.kind === 'folder' && edge.target?.kind === 'folder') {
                force *= 0.68;
            }

            if (edge.type === 'hierarchy' && edge.target?.kind === 'link') {
                force *= 0.6;
            }

            if (edge.type === 'hierarchy' && (edge.target?.kind === 'workspace' || edge.target?.kind === 'category')) {
                force *= 0.5;
            }

            const targetReactionFactor = getHierarchyTargetReactionFactor(edge, motionProfile);

            const sourceStatic = isNodeStatic(edge.source);

            const targetStatic = isNodeStatic(edge.target);

            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.source.id) && !sourceStatic) {

                edge.source.vx += nx * force;

                edge.source.vy += ny * force;

            }

            if (!(state.pointer.mode === 'node' && state.pointer.node?.id === edge.target.id) && !targetStatic) {

                edge.target.vx -= nx * force * targetReactionFactor;

                edge.target.vy -= ny * force * targetReactionFactor;

            }

            if (edge.type === 'hierarchy' && state.chainHierarchyEnabled) {
                const sourceDepth = (edge.source.data && typeof edge.source.data.depth === 'number') ? edge.source.data.depth : 0;
                const targetDepth = (edge.target.data && typeof edge.target.data.depth === 'number') ? edge.target.data.depth : 0;
                if (sourceDepth > targetDepth) {
                    const gap = sourceDepth - targetDepth;
                    const isLink = edge.source.kind === 'link';
                    const hierPush = (isLink ? 0.015 : 0.03) * (1 + gap * 0.5);
                    if (!sourceStatic && !(state.pointer.mode === 'node' && state.pointer.node?.id === edge.source.id)) {
                        edge.source.vx -= nx * hierPush;
                        edge.source.vy -= ny * hierPush;
                    }
                }
            }

        });



        if (state.chainHierarchyEnabled) {
            const parentChildren = new Map();
            state.nodes.forEach((n) => {
                if (!n || !n.data) return;
                const parentId = text(n.data.anchorNodeId, '');
                if (!parentId) return;
                if (!parentChildren.has(parentId)) parentChildren.set(parentId, []);
                parentChildren.get(parentId).push(n);
            });

            parentChildren.forEach((children, parentId) => {
                const parent = state.nodeIndex.get(parentId);
                if (!parent) return;
                if (children.length < 2) return;
                if (isNodeStatic(parent) || parent.manualAnchor) return;
                if (state.pointer.mode === 'node' && state.pointer.node?.id === parent.id) return;

                let sumX = 0, sumY = 0;
                children.forEach((c) => { sumX += c.x; sumY += c.y; });
                const cx = sumX / children.length;
                const cy = sumY / children.length;

                const dx = parent.x - cx;
                const dy = parent.y - cy;
                const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                const nx = dx / dist;
                const ny = dy / dist;

                const drift = 0.12;
                parent.vx += nx * drift;
                parent.vy += ny * drift;
            });

            const chainRoots = new Map();
            const folderOrientations = new Map(); // Every folder: { nx, ny, distToParent, isRoot }

            state.nodes.forEach(n => {
                if (n && (n.kind === 'category' || n.kind === 'workspace') && n.chainId) {
                    chainRoots.set(n.chainId, { 
                        node: n, 
                        sumX: 0, 
                        sumY: 0, 
                        count: 0,
                        frontX: 0, 
                        frontY: -1
                    });
                }
                
                const pId = (n.data && n.data.anchorNodeId) ? n.data.anchorNodeId : '';
                const pNode = pId ? state.nodeIndex.get(pId) : null;
                
                if (n.kind === 'folder' && pNode) {
                    const fdx = pNode.x - n.x;
                    const fdy = pNode.y - n.y;
                    const fdist = Math.max(1, Math.sqrt(fdx * fdx + fdy * fdy));
                    const isRoot = (pNode.kind === 'category' || pNode.kind === 'workspace');
                    
                    folderOrientations.set(n.id, { 
                        node: n, 
                        parent: pNode, 
                        nx: fdx / fdist, 
                        ny: fdy / fdist, 
                        dist: fdist,
                        isRoot: isRoot
                    });

                    if (isRoot) {
                        const rootData = chainRoots.get(pNode.chainId);
                        if (rootData) {
                            rootData.sumX += n.x;
                            rootData.sumY += n.y;
                            rootData.count++;
                        }
                    }
                }
            });

            // Finalize card front vectors (facing away from folders)
            chainRoots.forEach(data => {
                if (data.count > 0) {
                    const avgX = data.sumX / data.count;
                    const avgY = data.sumY / data.count;
                    const dx = data.node.x - avgX;
                    const dy = data.node.y - avgY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 1) {
                        data.frontX = dx / dist;
                        data.frontY = dy / dist;
                    }
                }
            });

            // 4. Optimal Hierarchy Anchors (Link placement)
            // Position child nodes on the "back" of parent folders relative to their parent
            state.hierarchyAnchors = new Map();
            state.nodes.forEach((node) => {
                if (!node || !node.data) return;
                const parentId = text(node.data.anchorNodeId, '');
                if (!parentId) return;
                const parent = state.nodeIndex.get(parentId);
                if (!parent) return;

                let baseAngle = 0;
                let radius = 0;
                let foundBase = false;

                const parentOrient = folderOrientations.get(parent.id);
                if (parentOrient) {
                    baseAngle = Math.atan2(-parentOrient.ny, -parentOrient.nx);
                    radius = (parent.radius || 15) + 12;
                    foundBase = true;
                } else if (parent.kind === 'category' || parent.kind === 'workspace') {
                    const rootData = chainRoots.get(parent.chainId);
                    if (rootData && (rootData.frontX !== 0 || rootData.frontY !== 0)) {
                        baseAngle = Math.atan2(-rootData.frontY, -rootData.frontX);
                        radius = (parent.radius || 60) + 40; // Larger gap for cards
                        foundBase = true;
                    }
                }

                if (foundBase) {
                    const siblings = (parentChildren.get(parentId) || []).slice().sort((a, b) => {
                        const labelA = a.label || '';
                        const labelB = b.label || '';
                        return labelA.localeCompare(labelB) || a.id.localeCompare(b.id);
                    });
                    const index = siblings.indexOf(node);
                    const count = siblings.length;
                    
                    const isRootChild = parent.kind === 'category' || parent.kind === 'workspace';
                    
                    // 1. Epic Needle-Focus Spread: Extremely narrow for root Cards (35-45 deg)
                    // Folds clusters into an epic "Plume" directly opposite the core
                    let baseSpread = isRootChild ? Math.PI * 0.22 : Math.PI * 0.35;
                    if (!isRootChild && node.kind === 'link') baseSpread = Math.PI * 0.45;

                    const rowCount = 5; 
                    const row = index % rowCount;

                    let spread = baseSpread;
                    if (node.kind === 'link') {
                        // Narrow widening for outer rows to preserve the spinal needle
                        const growthFactor = isRootChild ? 0.10 : 0.15;
                        const spreadExpansion = (row / (rowCount - 1)) * growthFactor;
                        spread = baseSpread + spreadExpansion * Math.PI;
                    }

                    const offset = count > 1 ? (spread * (index / (count - 1) - 0.5)) : 0;
                    
                    // 2. Epic Spinal Jitter (Massive depth/longitudinal variance)
                    const jitterMag = isRootChild ? 80 : 50; 
                    const jitterVal = (node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % (jitterMag * 2 + 1)) - jitterMag;
                    
                    // 3. Colossal Tail Distance (1000px+ Epic Root Buffer)
                    let finalRadius = radius;
                    if (node.kind === 'link') {
                        // Massive root buffer vs middle-scale folder buffer
                        const baseR = isRootChild ? (parent.radius || 60) + 1050 : (parent.radius || 60) + 600;
                        const rowDepth = isRootChild ? 160 : 120;
                        
                        finalRadius = baseR + (row * rowDepth) + Math.min(100, count * 3) + jitterVal;
                    } else if (node.kind === 'folder') {
                        // Folders also align to the colossal spinal frontier
                        const fRow = index % 2;
                        const fBaseR = isRootChild ? (parent.radius || 15) + 1000 : (parent.radius || 15) + 550;
                        finalRadius = fBaseR + (fRow * 80) + Math.min(40, count * 4);
                    }
                    
                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + Math.cos(baseAngle + offset) * finalRadius,
                        y: parent.y + Math.sin(baseAngle + offset) * finalRadius
                    });
                }
            });

            state.nodes.forEach((node) => {
                if (!node || !node.chainId || isNodeStatic(node)) return;
                const rootData = chainRoots.get(node.chainId);
                if (!rootData) return;
                
                const root = rootData.node;
                if (root === node) return;
                
                if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

                const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
                if (nodeDepth <= -1) return;

                const dx = node.x - root.x;
                const dy = node.y - root.y;
                const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                const nx = dx / dist;
                const ny = dy / dist;

                const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
                const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
                let directionalBoost = 1.0;

                // 1. Universal Folder Aura Repulsion
                // Every folder exerts its teardrop aura on its descendants
                if (parentNode) {
                    let currentParent = parentNode;
                    let safety = 0;
                    while (currentParent && safety < 10) {
                        if (currentParent.kind === 'folder') {
                            const orient = folderOrientations.get(currentParent.id);
                            if (orient) {
                                applyFolderAura(node, currentParent, orient.nx, orient.ny, orient.dist, orient.isRoot);
                            }
                        }
                        const nextId = (currentParent.data && currentParent.data.anchorNodeId) ? currentParent.data.anchorNodeId : '';
                        currentParent = nextId ? state.nodeIndex.get(nextId) : null;
                        safety++;
                    }
                }

                // 2. Asymmetric Card Aura Repulsion (Main root level)
                applyCardAuraRepulsion(node, root, rootData);
            });
        }

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

        });

    }




    const physics = ns._physics = ns._physics || {};

    Object.assign(physics, {

        getMotionProfile,

        syncMotionAnchors,

        setWebMotionAnchor,

        getReleaseVelocityScale,

        tickPhysics

    });

})(window.EveConstellationMap);
