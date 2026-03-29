window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const events = ns._events || {};



    const {

        state,

        MAP_PADDING,

        MOTION_TUNING_FIELDS,

        getViewportSize,

        getNodePolarityState,

        getPolarityStrengthValue,

        getNodeCoverCandidates,

        getNodeCoverRotationInterval,

        getNodeCoverUrl,

        isNodeStatic,

        getStaticStateForNode,

        getPolaritySummary,

        getMotionTuningValue

    } = shared;

    const { requestDraw, renderInspector } = render;

    const { getMotionProfile } = physics;

    const { setSelectedNode } = events;



    function __debugGetGraphStats() {



        const viewport = state.canvas



            ? { width: state.canvas.width, height: state.canvas.height }



            : getViewportSize();



        const scale = Math.max(state.transform.scale || 1, 0.0001);



        const visibleWorldBounds = {



            minX: Number((((MAP_PADDING - state.transform.tx) / scale)).toFixed(2)),



            maxX: Number(((((viewport.width - MAP_PADDING) - state.transform.tx) / scale)).toFixed(2)),



            minY: Number((((MAP_PADDING - state.transform.ty) / scale)).toFixed(2)),



            maxY: Number(((((viewport.height - MAP_PADDING) - state.transform.ty) / scale)).toFixed(2))



        };



        const outOfBounds = state.nodes.reduce((count, node) => {



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



        const motionProfile = getMotionProfile(state.nodes.length);



        return {



            motionProfile: {

                mode: motionProfile.mode,

                repulsionScale: Number((motionProfile.repulsionScale || 0).toFixed(3)),

                centerPullScale: Number((motionProfile.centerPullScale || 0).toFixed(3)),

                springScale: Number((motionProfile.springScale || 0).toFixed(3)),

                hierarchyReactionScale: Number((motionProfile.hierarchyReactionScale || 0).toFixed(3)),

                folderRecoveryScale: Number((motionProfile.folderRecoveryScale || 0).toFixed(3)),

                dampingScale: Number((motionProfile.dampingScale || 0).toFixed(3)),

                speedScale: Number((motionProfile.speedScale || 0).toFixed(3)),

                worldTetherScale: Number((motionProfile.worldTetherScale || 0).toFixed(3))

            },



            scope: state.scope,



            motionMode: state.motionMode,



            visible: !!state.container && state.container.style.display !== 'none',



            nodeCount: state.nodes.length,



            edgeCount: state.edges.length,



            labelCount: state.labelHitBoxes.length,



            outOfBounds,



            worldRadius: Number((state.worldRadius || 0).toFixed(2)),



            visibleWorldBounds,



            worldBounds: state.worldBounds ? {



                minX: Number(state.worldBounds.minX.toFixed(2)),



                maxX: Number(state.worldBounds.maxX.toFixed(2)),



                minY: Number(state.worldBounds.minY.toFixed(2)),



                maxY: Number(state.worldBounds.maxY.toFixed(2))



            } : null,



            transform: {



                scale: Number(state.transform.scale.toFixed(4)),



                tx: Number(state.transform.tx.toFixed(2)),



                ty: Number(state.transform.ty.toFixed(2))



            },



            sampleNodes: state.nodes.slice(0, 60).map((node) => ({



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



            })),



            staticSummary: {



                nodeIds: Array.from(state.staticNodeIds.values()),



                kinds: Array.from(state.staticKinds.values()),



                branchRoots: Array.from(state.staticBranchRoots.keys()),



                branchNodeIds: Array.from(state.staticBranchNodeIds.values())



            },



            polaritySummary: {



                nodeOverrideCount: getPolaritySummary().nodeOverrideCount,



                attractKinds: getPolaritySummary().attractKinds.slice(),



                strength: {



                    repel: Number(getPolarityStrengthValue('repel').toFixed(2)),



                    attract: Number(getPolarityStrengthValue('attract').toFixed(2))



                }



            },



            motionTuning: Object.fromEntries(MOTION_TUNING_FIELDS.map((field) => [

                field.key,

                Number(getMotionTuningValue(field.key).toFixed(2))

            ])),



            kinds: state.nodes.reduce((acc, node) => {



                acc[node.kind] = (acc[node.kind] || 0) + 1;



                return acc;



            }, {})



        };



    }

    const coreDebugGraph = ns._coreDebugGraph = ns._coreDebugGraph || {};

    Object.assign(coreDebugGraph, {
        __debugGetGraphStats
    });

})(window.EveConstellationMap);
