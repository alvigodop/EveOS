window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getHierarchyTargetReactionFactor } = physicsHelpers;

    function runEdgePass(ctx) {
        const { springStrength, motionProfile } = ctx;
        const statePointerMode = state.pointer.mode;
        const statePointerNodeId = state.pointer.node?.id;

        for (let i = 0; i < state.edges.length; i++) {
            const edge = state.edges[i];
            const source = edge.source;
            const target = edge.target;
            
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distSq = (dx * dx) + (dy * dy);
            
            if (distSq < 1e-4) continue;
            
            const dist = Math.sqrt(distSq);
            const edgeType = edge.type;
            const sourceKind = source.kind;
            const targetKind = target.kind;
            
            const isHierarchy = edgeType === 'hierarchy';

            let desired = edgeType === 'tag' ? 120 : 100;

            if (isHierarchy && sourceKind === 'folder') {
                desired = 140;
            }

            const isDirectCardBookmarkEdge = isHierarchy
                && sourceKind === 'link'
                && (targetKind === 'workspace' || targetKind === 'category');

            if (isDirectCardBookmarkEdge) {
                desired = 240;
            }

            const forceMultiplier = (1 - desired / dist) * springStrength;
            let forceX = dx * forceMultiplier;
            let forceY = dy * forceMultiplier;

            if (isDirectCardBookmarkEdge) {
                forceX = 0;
                forceY = 0;
            }

            if (isHierarchy) {
                if (sourceKind === 'folder' && targetKind === 'folder') {
                    desired = 60; // Pull subfolders tighter to their parent folder
                    forceX *= 1.5; // Stronger attraction
                    forceY *= 1.5;
                }
                if (targetKind === 'link') {
                    forceX *= 0.6;
                    forceY *= 0.6;
                }
                if (targetKind === 'workspace' || targetKind === 'category') {
                    forceX *= 0.5;
                    forceY *= 0.5;
                }
                // AURA SOVEREIGNTY: When a folder is connected to a Card/Workspace parent,
                // the edge spring must NOT pull the folder INTO the card.
                // Only the card may react. The folder must be governed exclusively by the Aura wall.
                if (sourceKind === 'folder' && (targetKind === 'workspace' || targetKind === 'category')) {
                    // Zero out the source (folder) side of the spring entirely.
                    // The target reaction (card) is left alone via targetReactionFactor below.
                    forceX = 0;
                    forceY = 0;
                }
            }

            const targetReactionFactor = getHierarchyTargetReactionFactor(edge, motionProfile);
            const sourceStatic = isNodeStatic(source);
            const targetStatic = isNodeStatic(target);

            const sourceIsDragged = statePointerMode === 'node' && statePointerNodeId === source.id;
            const targetIsDragged = statePointerMode === 'node' && statePointerNodeId === target.id;

            if (!sourceIsDragged && !sourceStatic) {
                source.vx += forceX;
                source.vy += forceY;
            }

            if (!targetIsDragged && !targetStatic) {
                target.vx -= forceX * targetReactionFactor;
                target.vy -= forceY * targetReactionFactor;
            }

            if (isHierarchy && state.chainHierarchyEnabled) {
                const sourceDepth = (source.data && typeof source.data.depth === 'number') ? source.data.depth : 0;
                const targetDepth = (target.data && typeof target.data.depth === 'number') ? target.data.depth : 0;
                if (sourceDepth > targetDepth) {
                    const gap = sourceDepth - targetDepth;
                    const hierPush = (sourceKind === 'link' ? 0.015 : 0.03) * (1 + gap * 0.5);
                    if (!sourceStatic && !sourceIsDragged) {
                        const pushMult = hierPush / dist;
                        source.vx -= dx * pushMult;
                        source.vy -= dy * pushMult;
                    }
                }
            }
        }
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runEdgePass });

})(window.EveConstellationMap);
