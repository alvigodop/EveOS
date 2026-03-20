window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getPairwiseInfluenceScale } = physicsHelpers;

    function runPairwisePass(ctx) {
        const { repulsion, polarityCache, motionProfile } = ctx;

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
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runPairwisePass });

})(window.EveConstellationMap);
