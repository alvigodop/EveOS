window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    function getDebugViewport(state, getViewportSize) {
        return state.canvas
            ? { width: state.canvas.width, height: state.canvas.height }
            : getViewportSize();
    }

    function getVisibleWorldBounds(state, viewport, mapPadding) {
        const scale = Math.max(state.transform.scale || 1, 0.0001);
        return {
            minX: Number((((mapPadding - state.transform.tx) / scale)).toFixed(2)),
            maxX: Number(((((viewport.width - mapPadding) - state.transform.tx) / scale)).toFixed(2)),
            minY: Number((((mapPadding - state.transform.ty) / scale)).toFixed(2)),
            maxY: Number(((((viewport.height - mapPadding) - state.transform.ty) / scale)).toFixed(2))
        };
    }

    function countOutOfBounds(nodes, visibleWorldBounds) {
        return nodes.reduce((count, node) => {
            if (!node) return count;
            if (
                node.x < visibleWorldBounds.minX
                || node.y < visibleWorldBounds.minY
                || node.x > visibleWorldBounds.maxX
                || node.y > visibleWorldBounds.maxY
            ) {
                return count + 1;
            }
            return count;
        }, 0);
    }

    function serializeMotionProfile(motionProfile) {
        return {
            mode: motionProfile.mode,
            repulsionScale: Number((motionProfile.repulsionScale || 0).toFixed(3)),
            centerPullScale: Number((motionProfile.centerPullScale || 0).toFixed(3)),
            springScale: Number((motionProfile.springScale || 0).toFixed(3)),
            hierarchyReactionScale: Number((motionProfile.hierarchyReactionScale || 0).toFixed(3)),
            folderRecoveryScale: Number((motionProfile.folderRecoveryScale || 0).toFixed(3)),
            dampingScale: Number((motionProfile.dampingScale || 0).toFixed(3)),
            speedScale: Number((motionProfile.speedScale || 0).toFixed(3)),
            worldTetherScale: Number((motionProfile.worldTetherScale || 0).toFixed(3))
        };
    }

    function serializeWorldBounds(worldBounds) {
        return worldBounds ? {
            minX: Number(worldBounds.minX.toFixed(2)),
            maxX: Number(worldBounds.maxX.toFixed(2)),
            minY: Number(worldBounds.minY.toFixed(2)),
            maxY: Number(worldBounds.maxY.toFixed(2))
        } : null;
    }

    function serializeTransform(transform) {
        return {
            scale: Number(transform.scale.toFixed(4)),
            tx: Number(transform.tx.toFixed(2)),
            ty: Number(transform.ty.toFixed(2))
        };
    }

    function serializeSampleNodes(nodes, isNodeStatic, getStaticStateForNode, getNodePolarityState) {
        return nodes.slice(0, 60).map((node) => ({
            id: node.id,
            kind: node.kind,
            label: node.label,
            x: Number(node.x.toFixed(2)),
            y: Number(node.y.toFixed(2)),
            vx: Number((Number(node.vx) || 0).toFixed(3)),
            vy: Number((Number(node.vy) || 0).toFixed(3)),
            isStatic: isNodeStatic(node),
            staticSource: getStaticStateForNode(node).source || '',
            hasManualAnchor: !!node.manualAnchor,
            polarity: getNodePolarityState(node).effective,
            polaritySource: getNodePolarityState(node).source || '',
            nodePolarity: getNodePolarityState(node).nodeOverride,
            kindPolarity: getNodePolarityState(node).kind
        }));
    }

    function serializeStaticSummary(state) {
        return {
            nodeIds: Array.from(state.staticNodeIds.values()),
            kinds: Array.from(state.staticKinds.values()),
            branchRoots: Array.from(state.staticBranchRoots.keys()),
            branchNodeIds: Array.from(state.staticBranchNodeIds.values())
        };
    }

    function serializePolaritySummary(getPolaritySummary, getPolarityStrengthValue) {
        const summary = getPolaritySummary();
        return {
            nodeOverrideCount: summary.nodeOverrideCount,
            attractKinds: summary.attractKinds.slice(),
            strength: {
                repel: Number(getPolarityStrengthValue('repel').toFixed(2)),
                attract: Number(getPolarityStrengthValue('attract').toFixed(2))
            }
        };
    }

    const moduleApi = ns._coreDebugGraphHelpers = ns._coreDebugGraphHelpers || {};
    Object.assign(moduleApi, {
        getDebugViewport,
        getVisibleWorldBounds,
        countOutOfBounds,
        serializeMotionProfile,
        serializeWorldBounds,
        serializeTransform,
        serializeSampleNodes,
        serializeStaticSummary,
        serializePolaritySummary
    });
})(window.EveConstellationMap);
