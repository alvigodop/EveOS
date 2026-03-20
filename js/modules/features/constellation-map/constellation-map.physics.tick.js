window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, getMotionTuningValue } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getMotionProfile, getPolarityDirection, getPolarityStrength, syncMotionAnchors } = physicsHelpers;

    const passes = ns._physicsTickPasses || {};
    const { runPairwisePass, runEdgePass, runHierarchyPass, runIntegrationPass } = passes;

    function buildTickContext() {
        const nodeCount = state.nodes.length;
        const motionProfile = getMotionProfile(nodeCount);

        syncMotionAnchors(false);

        return {
            nodeCount,
            motionProfile,
            repulsion: (nodeCount > 400 ? 900 : nodeCount > 220 ? 1200 : nodeCount > 120 ? 1600 : nodeCount > 70 ? 2200 : 3200)
                * (motionProfile.repulsionScale || 1)
                * getMotionTuningValue('repulsion'),
            centerPull: (nodeCount > 400 ? 0.00038 : nodeCount > 220 ? 0.0005 : nodeCount > 120 ? 0.0007 : 0.0011)
                * getMotionTuningValue('centerPull'),
            springStrength: (nodeCount > 120 ? 0.0024 : 0.0032)
                * (motionProfile.springScale || 1)
                * getMotionTuningValue('spring'),
            frontierReach: getMotionTuningValue('frontierReach'),
            polarityCache: state.nodes.map((node) => ({
                direction: getPolarityDirection(node),
                strength: getPolarityStrength(node, motionProfile)
            }))
        };
    }

    function tickPhysics() {
        if (!state.nodes.length || !state.canvas) return;

        const ctx = buildTickContext();

        runPairwisePass(ctx);
        runEdgePass(ctx);

        if (state.chainHierarchyEnabled) {
            runHierarchyPass(ctx);
        }

        runIntegrationPass(ctx);
    }

    const physicsTick = ns._physicsTick = ns._physicsTick || {};
    Object.assign(physicsTick, { tickPhysics });

})(window.EveConstellationMap);
