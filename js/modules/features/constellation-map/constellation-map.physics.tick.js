window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, getMotionTuningValue } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { getMotionProfile, getPolarityDirection, getPolarityStrength, syncMotionAnchors } = physicsHelpers;

    const passes = ns._physicsTickPasses || {};
    const { runPairwisePass, runEdgePass, runHierarchyPass, runIntegrationPass } = passes;

    let polarityDirections = new Float32Array(0);
    let polarityStrengths = new Float32Array(0);

    function buildTickContext() {
        const nodeCount = state.nodes.length;
        const motionProfile = getMotionProfile(nodeCount);

        if (polarityDirections.length !== nodeCount) {
            polarityDirections = new Float32Array(nodeCount);
            polarityStrengths = new Float32Array(nodeCount);
        }

        syncMotionAnchors(false);

        for (let i = 0; i < nodeCount; i++) {
            const node = state.nodes[i];
            polarityDirections[i] = getPolarityDirection(node);
            polarityStrengths[i] = getPolarityStrength(node, motionProfile);
        }

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
            polarityDirections,
            polarityStrengths
        };
    }

    let wakeTicks = 120;
    let tickCounter = 0;

    function tickPhysics() {
        if (!state.nodes.length || !state.canvas) return;
        tickCounter++;

        let kineticEnergy = 0;
        for (let i = 0; i < state.nodes.length; i++) {
            const n = state.nodes[i];
            kineticEnergy += (n.vx * n.vx) + (n.vy * n.vy);
        }
        
        const isDragging = state.pointer.mode === 'node' && !!state.pointer.node;
        const avgEnergy = kineticEnergy / state.nodes.length;

        if (isDragging || avgEnergy > 0.0002) {
            wakeTicks = 90;
        } else if (wakeTicks > 0) {
            wakeTicks -= 1;
        }

        const shouldSleep = wakeTicks === 0;

        const ctx = buildTickContext();
        ctx.tickCounter = tickCounter;

        if (!shouldSleep) {
            runPairwisePass(ctx);
            runEdgePass(ctx);

            if (state.chainHierarchyEnabled) {
                runHierarchyPass(ctx);
            }
        }

        runIntegrationPass(ctx);
    }

    const physicsTick = ns._physicsTick = ns._physicsTick || {};
    Object.assign(physicsTick, { tickPhysics });

})(window.EveConstellationMap);
