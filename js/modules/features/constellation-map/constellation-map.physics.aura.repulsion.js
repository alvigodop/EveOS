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

        if (node.kind === 'workspace') {
            // Only ROOT workspace nodes are main — sub-tab workspaces have hierarchy edges to a parent workspace
            const hasParentWorkspace = state.edges.some((edge) => edge.source.id === node.id && edge.type === 'hierarchy' && edge.target?.kind === 'workspace');
            return !hasParentWorkspace;
        }

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



        // SINGULARITY FUSION: Immediate children of NON-ROOT folders are EXEMPT from repulsion 
        // to allow them to dock deep into the parent's core.
        // ROOT folders (direct children of card/workspace) must repel their children
        // to maintain aura boundary integrity â€” same pattern as the card itself.
        const isImmediateChild = (node.parentId === folder.id || (node.data && node.data.anchorNodeId === folder.id));
        if (isImmediateChild && !isRootFolder) return;

        if (node.id === folder.id) return;



        // PERFORMANCE: Coarse distance check

        const coarseDX = node.x - folder.x;

        const coarseDY = node.y - folder.y;

        if (coarseDX * coarseDX + coarseDY * coarseDY > 1300 * 1300) return;



        // Repulsive center is offset from folder toward parent.
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
            const penetration = 1 - normDist;

            // ROOT FOLDERS need much stronger repulsion to enforce their boundary
            // against card-direct bookmarks that have strong anchor pulls.
            let force;
            if (isRootFolder) {
                force = 8.0 * penetration + 20.0 * Math.pow(penetration, 2);
            } else {
                // Non-root: soft quadratic contact
                force = 2.0 * Math.pow(penetration, 2);
            }

            if (nodeDepth >= 2) force *= 1.4;



            // MICRO-DAMPING ZONE: Freeze nodes that are settling into the boundary
            if (normDist > (isRootFolder ? 0.7 : 0.85)) {
                node.vx *= (isRootFolder ? 0.75 : 0.85);
                node.vy *= (isRootFolder ? 0.75 : 0.85);
            }



            const rdx = node.x - centerX;

            const rdy = node.y - centerY;

            const rdist = Math.max(1, Math.sqrt(rdx * rdx + rdy * rdy));



            node.vx += (rdx / rdist) * force;

            node.vy += (rdy / rdist) * force;

            // ROOT FOLDER HARD BOUNDARY: Position push to prevent tunneling.
            if (isRootFolder && penetration > 0.05) {
                const radiusLong2 = projLong > 0 ? radiusFront : radiusBack;
                const pushMagnitude = penetration * radiusLong2 * 0.3;
                node.x += (rdx / rdist) * pushMagnitude;
                node.y += (rdy / rdist) * pushMagnitude;
            }

            // Lateral Shunt

            const sideDot = (dx * lnx + dy * lny) > 0 ? 1 : -1;

            node.vx += lnx * sideDot * (force * 0.8);

            node.vy += lny * sideDot * (force * 0.8);



            // FALLBACK BIAS: If in front half, push behind much harder

            if (projLong > 0) {

                const fallbackForce = (isRootFolder ? 4.0 : 1.2) * penetration;

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





    // --- PEER AURA REPULSION: Same-layer root folders + sub-tab nodes ---

    function getPeerTerritoryRadius(node) {
        // Territory is based on folder aura lateral radius scaled down
        const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
        const pNode = pId ? state.nodeIndex.get(pId) : null;
        if (!pNode) return 120;
        const fdx = pNode.x - node.x;
        const fdy = pNode.y - node.y;
        const fdist = Math.max(1, Math.sqrt(fdx * fdx + fdy * fdy));
        const isRoot = (pNode.kind === 'category' || pNode.kind === 'workspace');
        const shape = getFolderAuraShape(node, fdist, isRoot);
        // Peer territory = 60% of lateral radius
        return Math.max(80, shape.radiusLat * 0.6);
    }

    function applyPeerAuraRepulsion(nodeA, nodeB) {
        if (!nodeA || !nodeB) return;
        if (!isAuraEffectsEnabled()) return;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy;
        const rA = getPeerTerritoryRadius(nodeA);
        const rB = getPeerTerritoryRadius(nodeB);
        const sumRadii = rA + rB;
        // Tolerance zone: allow 12% overlap before force kicks in
        const effectiveRadius = sumRadii * 0.88;

        if (distSq >= effectiveRadius * effectiveRadius) return;

        const dist = Math.max(1, Math.sqrt(distSq));
        const penetration = 1 - (dist / effectiveRadius);

        // Store overlap ratio for renderer
        nodeA._peerOverlap = Math.max(nodeA._peerOverlap || 0, penetration);
        nodeB._peerOverlap = Math.max(nodeB._peerOverlap || 0, penetration);
        nodeA._peerTerritoryRadius = rA;
        nodeB._peerTerritoryRadius = rB;

        // Soft quadratic repulsion — equal and opposite
        const force = 4.0 * penetration + 12.0 * Math.pow(penetration, 2);

        const nx = dx / dist;
        const ny = dy / dist;

        // Push apart equally
        nodeA.vx -= nx * force * 0.5;
        nodeA.vy -= ny * force * 0.5;
        nodeB.vx += nx * force * 0.5;
        nodeB.vy += ny * force * 0.5;

        // Damping when close — reduce oscillation
        if (penetration > 0.3) {
            const damp = 0.85;
            nodeA.vx *= damp;
            nodeA.vy *= damp;
            nodeB.vx *= damp;
            nodeB.vy *= damp;
        }
    }

    function runPeerAuraPass() {
        if (!isAuraEffectsEnabled()) return;

        // Clear previous overlap state
        for (let i = 0; i < state.nodes.length; i++) {
            state.nodes[i]._peerOverlap = 0;
        }

        // Group root folders and sub-tab nodes by parent
        const peerGroups = new Map();
        for (let i = 0; i < state.nodes.length; i++) {
            const node = state.nodes[i];
            if (node.kind !== 'folder') continue;
            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;
            if (!pNode) continue;

            // Only root folders (parent is category/workspace) and sub-tab nodes
            const isRootFolder = (pNode.kind === 'category' || pNode.kind === 'workspace');
            const isSubTab = (node.data && node.data.isSubTab);
            if (!isRootFolder && !isSubTab) continue;

            const groupKey = pId + '|' + (node.data?.depth || 0);
            if (!peerGroups.has(groupKey)) peerGroups.set(groupKey, []);
            peerGroups.get(groupKey).push(node);
        }

        // Check all pairs within each peer group
        peerGroups.forEach(function (group) {
            if (group.length < 2) return;
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    applyPeerAuraRepulsion(group[i], group[j]);
                }
            }
        });
    }

    ns._physicsAuraRepulsion = Object.assign(ns._physicsAuraRepulsion || {}, {
        isNodeMain,
        applyFolderAura,
        applyCardAuraRepulsion,
        applyWorkspaceAuraRepulsion
    });

})(window.EveConstellationMap);
