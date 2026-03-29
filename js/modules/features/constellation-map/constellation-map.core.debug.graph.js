window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const physics = ns._physics || {};
    const helpers = ns._coreDebugGraphHelpers || {};

    const {
        state,
        MAP_PADDING,
        MOTION_TUNING_FIELDS,
        getViewportSize,
        getNodePolarityState,
        getPolarityStrengthValue,
        isNodeStatic,
        getStaticStateForNode,
        getPolaritySummary,
        getMotionTuningValue
    } = shared;
    const { getMotionProfile } = physics;
    const {
        getDebugViewport,
        getVisibleWorldBounds,
        countOutOfBounds,
        serializeMotionProfile,
        serializeWorldBounds,
        serializeTransform,
        serializeSampleNodes,
        serializeStaticSummary,
        serializePolaritySummary
    } = helpers;

    function __debugGetGraphStats() {
        const viewport = getDebugViewport(state, getViewportSize);
        const visibleWorldBounds = getVisibleWorldBounds(state, viewport, MAP_PADDING);
        const outOfBounds = countOutOfBounds(state.nodes, visibleWorldBounds);
        const motionProfile = getMotionProfile(state.nodes.length);

        return {
            motionProfile: serializeMotionProfile(motionProfile),
            scope: state.scope,
            motionMode: state.motionMode,
            visible: !!state.container && state.container.style.display !== 'none',
            nodeCount: state.nodes.length,
            edgeCount: state.edges.length,
            labelCount: state.labelHitBoxes.length,
            outOfBounds,
            worldRadius: Number((state.worldRadius || 0).toFixed(2)),
            visibleWorldBounds,
            worldBounds: serializeWorldBounds(state.worldBounds),
            transform: serializeTransform(state.transform),
            sampleNodes: serializeSampleNodes(state.nodes, isNodeStatic, getStaticStateForNode, getNodePolarityState),
            staticSummary: serializeStaticSummary(state),
            polaritySummary: serializePolaritySummary(getPolaritySummary, getPolarityStrengthValue),
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
