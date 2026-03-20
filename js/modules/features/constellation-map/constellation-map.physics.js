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
    const physicsHelpers = ns._physicsHelpers || {};

    const {

        isNodeMain,
        applyFolderAura,
        applyCardAuraRepulsion,
        getMotionProfile,
        getHierarchyTargetReactionFactor,
        getPairwiseInfluenceScale,
        getDynamicAnchorPull,
        getDynamicVelocityDamping,
        applyFolderRecovery,
        applyBookmarkAwayBias,
        stabilizeDirectCardBookmarkClearance,
        getReleaseVelocityScale,
        getMaxNodeSpeed,
        getPolarityDirection,
        getPolarityStrength,
        stabilizeNodeMotion,
        applyMotionModePositioning,
        setWebMotionAnchor,
        syncMotionAnchors,
        getMotionTargetAnchor,
        applySoftWorldTether

    } = physicsHelpers;

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

        const frontierReach = getMotionTuningValue('frontierReach');

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

            if (edge.type === 'hierarchy' && edge.source?.kind === 'link' && (edge.target?.kind === 'workspace' || edge.target?.kind === 'category')) {
                desired = 126;
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

            state.chainRoots = state.chainRoots || new Map();
            state.folderOrientations = state.folderOrientations || new Map();
            const chainRoots = state.chainRoots;
            const folderOrientations = state.folderOrientations; // PERSISTED: For global angular smoothing

            // PRE-PASS: Maintain/Prune state.chainRoots and folderOrientations for active nodes
            const activeNodeIds = new Set(state.nodes.map(n => n.id));
            const activeChains = new Set(state.nodes.map(n => n.chainId).filter(Boolean));
            [...chainRoots.keys()].forEach(cid => { if (!activeChains.has(cid)) chainRoots.delete(cid); });
            [...folderOrientations.keys()].forEach(id => { if (!activeNodeIds.has(id)) folderOrientations.delete(id); });

            // 1. Finalize card front vectors (ABSOLUTE SPINAL INERTIA: Extreme Damping)
            chainRoots.forEach(data => {
                const node = data.node;
                const isBeingDragged = (state.pointer.mode === 'node' && state.pointer.node?.id === node.id);
                const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);

                // DIRECTIONAL WAKE: If dragged and moving fast enough, face movement direction
                if (isBeingDragged && speed > 0.5) {
                    const moveAngle = Math.atan2(node.vy, node.vx);
                    const lerpAngle = (current, target) => {
                        let diff = target - current;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        return current + diff * 0.15; // Snappy Drag Inertia (0.15)
                    };
                    data.frontAngle = lerpAngle(data.frontAngle === undefined ? moveAngle : data.frontAngle, moveAngle);
                } else if (data.count > 0) {
                    const avgX = data.sumX / data.count;
                    const avgY = data.sumY / data.count;
                    const dx = node.x - avgX;
                    const dy = node.y - avgY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // ABSOLUTE CENTROID GUARD: Stable orientation when stationary
                    if (dist > 30) {
                        const targetAngle = Math.atan2(dy, dx);
                        const lerpAngle = (current, target) => {
                            let diff = target - current;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            return current + diff * 0.005; // Absolute Static Inertia (0.005)
                        };
                        data.frontAngle = lerpAngle(data.frontAngle === undefined ? targetAngle : data.frontAngle, targetAngle);
                    }
                }
                
                if (data.frontAngle !== undefined) {
                    data.frontX = Math.cos(data.frontAngle);
                    data.frontY = Math.sin(data.frontAngle);
                }
            });

            // 2. Folder pass: Implement Spinal Inheritance for Root Folders
            state.nodes.forEach(n => {
                const pId = (n.data && n.data.anchorNodeId) ? n.data.anchorNodeId : '';
                const pNode = pId ? state.nodeIndex.get(pId) : null;

                if (n.kind === 'folder' && pNode) {
                    const isRoot = (pNode.kind === 'category' || pNode.kind === 'workspace');
                    const fdx = pNode.x - n.x;
                    const fdy = pNode.y - n.y;
                    const fdist = Math.max(1, Math.sqrt(fdx * fdx + fdy * fdy));

                    let targetAngle = Math.atan2(fdy, fdx);
                    
                    // SPINAL INHERITANCE: Root folders explicitly adopt the parent Card's orientation (The Laser Beam)
                    if (isRoot) {
                        const rootData = chainRoots.get(pNode.chainId);
                        if (rootData && rootData.frontAngle !== undefined) {
                            // Points exactly AWAY from the front vector to align with the core axis
                            targetAngle = rootData.frontAngle + Math.PI; 
                        }
                    }

                    const existing = folderOrientations.get(n.id);
                    const currentAngle = (existing && existing.orientAngle !== undefined) ? existing.orientAngle : targetAngle;

                    const lerpAngle = (current, target) => {
                        let diff = target - current;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        return current + diff * 0.08; // Neural Lock
                    };

                    const smoothedAngle = lerpAngle(currentAngle, targetAngle);
                    folderOrientations.set(n.id, {
                        node: n,
                        parent: pNode,
                        nx: Math.cos(smoothedAngle),
                        ny: Math.sin(smoothedAngle),
                        dist: fdist,
                        isRoot: isRoot,
                        orientAngle: smoothedAngle
                    });
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

                    // UNIVERSAL RADIAL LOCK (Neural Orbiting)
                    // Every hierarchy node tracks its parent with a synchronized 0.08 elegant lag.
                    // This creates a smooth, rigid spine that doesn't oscillate or spin.
                    const lerpAngle = (current, target) => {
                        let diff = target - current;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        const factor = 0.08;
                        return current + diff * factor;
                    };
                    node.spinalAngle = lerpAngle(node.spinalAngle || baseAngle, baseAngle);

                    // 2. Hyper-Tight Needle-Focus Spread: 40-50 deg for roots
                    let baseSpread = isRootChild ? Math.PI * 0.22 : Math.PI * 0.35;
                    if (!isRootChild && node.kind === 'link') baseSpread = Math.PI * 0.45;

                    const rowCount = 5;
                    const row = index % rowCount;

                    let spread = baseSpread;
                    if (node.kind === 'link') {
                        const growthFactor = isRootChild ? 0.10 : 0.15;
                        const spreadExpansion = (row / (rowCount - 1)) * growthFactor;
                        spread = baseSpread + spreadExpansion * Math.PI;
                    }

                    const offset = count > 1 ? (spread * (index / (count - 1) - 0.5)) : 0;

                    // 3. Spinal Jitter (Optimized for Black Hole density)
                    const jitterMag = isRootChild ? 10 : 60;
                    const jitterVal = (node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % (jitterMag * 2 + 1)) - jitterMag;

                    // 4. Black Hole Tail Distance (Inverse-Mass Core Fusion)
                    let finalRadius = radius;
                    if (node.kind === 'link') {
                        // Inverse scaling: Larger clusters are sucked deeper into the core
                        const popPull = isRootChild ? Math.min(60, count * 0.12) : 0;
                        // ULTIMATE AURA SPACING: Small clusters sit in the far outer aura (0.85 reach)
                        const rootBase = frontierReach * 0.85;
                        const baseR = isRootChild ? 60 + rootBase - popPull : (parent.radius || 15) + frontierReach;
                        const rowDepth = isRootChild ? 10 : 100;
                        const popPush = isRootChild ? 0 : Math.min(60, count * 3);

                        finalRadius = baseR + (row * rowDepth) + popPush + jitterVal;
                    } else if (node.kind === 'folder') {
                        // Folders also follow the mass-inversion rule
                        const fRow = index % 2;
                        const fPopPull = isRootChild ? Math.min(45, count * 0.10) : 0;
                        // Folders sit in the far outer aura (0.80 reach) to avoid overcrowding the Card
                        const frootBase = frontierReach * 0.80;
                        const fBaseR = isRootChild ? 60 + frootBase - fPopPull : (parent.radius || 15) + (frontierReach - 60);
                        const fRowDepth = isRootChild ? 10 : 50;
                        const fPopPush = isRootChild ? 0 : Math.min(30, count * 4);
                        finalRadius = fBaseR + (fRow * fRowDepth) + fPopPush;
                    }

                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + Math.cos(node.spinalAngle + offset) * finalRadius,
                        y: parent.y + Math.sin(node.spinalAngle + offset) * finalRadius
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

            stabilizeDirectCardBookmarkClearance(node, anchor);

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
