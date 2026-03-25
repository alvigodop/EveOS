window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsHierarchy = ns._physicsHierarchy = ns._physicsHierarchy || {};
    const { lerpAngle, compareNodeOrder } = physicsHierarchy;
    const shared = ns._shared || {};
    const { state, text, isNodeStatic, getCardAuraShape } = shared;
    const physicsHelpers = ns._physicsHelpers || {};
    const { applyFolderAura, applyCardAuraRepulsion, applyWorkspaceAuraRepulsion } = physicsHelpers;

function buildHierarchyAnchors(parentChildren, frontierReach, rootChildGuides, workspaceChildGuides) {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;

        state.hierarchyAnchors = new Map();

        state.nodes.forEach((node) => {
            if (!node || !node.data) return;
            const parentId = text(node.data.anchorNodeId, '');
            if (!parentId) return;
            const parent = state.nodeIndex.get(parentId);
            if (!parent) return;

            const isRootChild = parent.kind === 'category' || parent.kind === 'workspace';
            const rootGuide = isRootChild ? rootChildGuides.get(parentId) : null;
            const workspaceGuide = parent.kind === 'workspace' ? workspaceChildGuides.get(parentId) : null;

            if (node.kind === 'category' && parent.kind === 'workspace' && workspaceGuide?.categories?.length) {
                const workspaceCategories = workspaceGuide.categories;
                const workspaceIndex = workspaceCategories.findIndex((entry) => entry.id === node.id);
                if (workspaceIndex >= 0) {
                    const maxPerBand = workspaceCategories.length >= 18
                        ? 6
                        : workspaceCategories.length >= 10
                            ? 5
                            : 4;
                    const band = Math.floor(workspaceIndex / maxPerBand);
                    const bandStart = band * maxPerBand;
                    const bandSize = Math.min(maxPerBand, workspaceCategories.length - bandStart);
                    const slot = workspaceIndex - bandStart;
                    const halfSpan = Math.max(150, 110 + ((bandSize - 1) * 48 * 0.5));
                    const backOffset = 150 + (band * 84);
                    const localX = bandSize > 1
                        ? ((slot / (bandSize - 1)) - 0.5) * halfSpan * 2
                        : 0;
                    const localY = backOffset;
                    const jitterSeed = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                    const lateralJitter = (((jitterSeed >> 1) % 5) - 2) * 2.5;
                    const depthJitter = ((jitterSeed % 5) - 2) * 1.8;

                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + (workspaceGuide.latX * (localX + lateralJitter)) + (workspaceGuide.backX * (localY + depthJitter)),
                        y: parent.y + (workspaceGuide.latY * (localX + lateralJitter)) + (workspaceGuide.backY * (localY + depthJitter))
                    });
                    return;
                }
            }

            if (node.kind === 'link' && isRootChild && rootGuide?.rootLinks?.length) {
                const rootLinks = rootGuide.rootLinks;
                const rootIndex = rootLinks.findIndex((entry) => entry.id === node.id);
                if (rootIndex >= 0) {
                    const gapArc = Math.PI * 1.1;
                    const availableArc = (Math.PI * 2) - gapArc;
                    const startAngle = rootGuide.folderAngle + (gapArc * 0.5);
                    
                    // CARD AURA AWARENESS: Anchors must be placed OUTSIDE the physics repulsion aura.
                    const cardAura = getCardAuraShape(parent);
                    const maxAuraRadius = Math.max(cardAura.radiusFront, cardAura.radiusBack, cardAura.radiusLat);
                    const baseRadius = Math.max((parent.radius || 12) + 220, (frontierReach * 0.9) + 80, maxAuraRadius + 140);

                    const bandSpacing = 32;
                    const targetChord = 42;
                    let remaining = rootLinks.length;
                    let remainingIndex = rootIndex;
                    let bandIndex = 0;
                    let band = 0;
                    let slot = 0;
                    let bandSize = rootLinks.length;

                    while (remaining > 0) {
                        const radius = baseRadius + (bandIndex * bandSpacing);
                        const capacity = Math.max(6, Math.floor((availableArc * radius) / targetChord));
                        const currentBandSize = Math.min(remaining, capacity);
                        if (remainingIndex < currentBandSize) {
                            band = bandIndex;
                            slot = remainingIndex;
                            bandSize = currentBandSize;
                            break;
                        }
                        remaining -= currentBandSize;
                        bandIndex += 1;
                        remainingIndex -= currentBandSize;
                    }

                    const bandRadius = baseRadius + (band * bandSpacing);
                    const slotsInBand = Math.max(1, bandSize);
                    const bandPhase = (band % 2) * 0.5;
                    const laneAngle = slotsInBand > 1
                        ? startAngle + (availableArc * ((slot + 0.5 + bandPhase) / (slotsInBand + (bandPhase * 2))))
                        : rootGuide.backAngle;
                    const jitterSeed = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                    const radialJitter = ((jitterSeed % 7) - 3) * 0.45;
                    const tangentialJitter = (((jitterSeed >> 1) % 5) - 2) * 0.004;
                    node.spinalAngle = lerpAngle(node.spinalAngle || laneAngle, laneAngle, 0.08);
                    const finalRadius = bandRadius + radialJitter;
                    const angle = node.spinalAngle + tangentialJitter;

                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + Math.cos(angle) * finalRadius,
                        y: parent.y + Math.sin(angle) * finalRadius
                    });
                    return;
                }
            }

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
                    radius = (parent.radius || 60) + 40;
                    foundBase = true;
                }
            }

            if (!foundBase) return;

            const siblings = (parentChildren.get(parentId) || []).slice().sort(compareNodeOrder);
            const index = siblings.indexOf(node);
            const count = siblings.length;

            node.spinalAngle = lerpAngle(node.spinalAngle || baseAngle, baseAngle, 0.08);

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
            const jitterMag = isRootChild ? 10 : 60;
            const jitterVal = (node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % (jitterMag * 2 + 1)) - jitterMag;

            let finalRadius = radius;
            if (node.kind === 'link') {
                const popPull = isRootChild ? Math.min(60, count * 0.12) : 0;
                const rootBase = frontierReach * 0.95;
                
                // CARD AURA AWARENESS (Secondary Link Path)
                const cardAura = isRootChild ? getCardAuraShape(parent) : null;
                const auraR = cardAura ? Math.max(cardAura.radiusFront, cardAura.radiusBack, cardAura.radiusLat) : 0;

                const baseR = isRootChild 
                    ? Math.max(80 + rootBase - popPull, auraR + 150) 
                    : (parent.radius || 15) + frontierReach;

                const rowDepth = isRootChild ? 10 : 100;
                const popPush = isRootChild ? 0 : Math.min(60, count * 3);
                finalRadius = baseR + (row * rowDepth) + popPush + jitterVal;
            } else if (node.kind === 'folder') {
                const fRow = index % 2;
                const fPopPull = isRootChild ? Math.min(45, count * 0.10) : 0;
                const frootBase = frontierReach * 0.90;
                
                // CARD AURA AWARENESS (Folder Path)
                const cardAura = isRootChild ? getCardAuraShape(parent) : null;
                const auraR = cardAura ? Math.max(cardAura.radiusFront, cardAura.radiusBack, cardAura.radiusLat) : 0;

                const fBaseR = isRootChild 
                    ? Math.max(80 + frootBase - fPopPull, auraR + 160) 
                    : (parent.radius || 15) + (frontierReach - 60);

                const fRowDepth = isRootChild ? 10 : 50;
                const fPopPush = isRootChild ? 0 : Math.min(30, count * 4);
                finalRadius = fBaseR + (fRow * fRowDepth) + fPopPush;
            }

            state.hierarchyAnchors.set(node.id, {
                x: parent.x + Math.cos(node.spinalAngle + offset) * finalRadius,
                y: parent.y + Math.sin(node.spinalAngle + offset) * finalRadius
            });
        });
    }

    function applyHierarchyAuras() {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;
        const workspaceAuraRoots = state.workspaceAuraRoots instanceof Map ? state.workspaceAuraRoots : new Map();

        state.nodes.forEach((node) => {
            if (!node || !node.chainId || isNodeStatic(node)) return;
            const rootData = chainRoots.get(node.chainId);
            if (!rootData) return;

            const root = rootData.node;
            if (root === node) return;
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
            if (nodeDepth <= -1) return;

            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
            let workspaceAncestor = null;

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
                    if (currentParent.kind === 'workspace') {
                        workspaceAncestor = currentParent;
                        break;
                    }
                    const nextId = (currentParent.data && currentParent.data.anchorNodeId) ? currentParent.data.anchorNodeId : '';
                    currentParent = nextId ? state.nodeIndex.get(nextId) : null;
                    safety += 1;
                }
            }

            // UNIVERSAL AURA ENFORCEMENT: Check this node against EVERY card in the system,
            // not just its own chain root. This prevents cross-chain aura breaches.
            chainRoots.forEach((otherRootData) => {
                const otherRoot = otherRootData.node;
                if (otherRoot === node) return;
                applyCardAuraRepulsion(node, otherRoot, otherRootData);
            });

            if (workspaceAncestor) {
                const workspaceData = workspaceAuraRoots.get(workspaceAncestor.id);
                if (workspaceData) {
                    applyWorkspaceAuraRepulsion(node, workspaceAncestor, workspaceData);
                }
            }
        });

        state.nodes.forEach((node) => {
            if (!node || node.kind !== 'category' || isNodeStatic(node)) return;
            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
            if (!parentNode || parentNode.kind !== 'workspace') return;
            const workspaceData = workspaceAuraRoots.get(parentNode.id);
            if (!workspaceData) return;
            applyWorkspaceAuraRepulsion(node, parentNode, workspaceData);
        });
    }

    

    Object.assign(physicsHierarchy, {
        buildHierarchyAnchors,
        applyHierarchyAuras
    });
})(window.EveConstellationMap);
