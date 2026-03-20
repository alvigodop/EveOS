window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getHierarchyTargetReactionFactor } = physicsHelpers;

    function runEdgePass(ctx) {
        const { springStrength, motionProfile } = ctx;

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
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runEdgePass });

})(window.EveConstellationMap);
