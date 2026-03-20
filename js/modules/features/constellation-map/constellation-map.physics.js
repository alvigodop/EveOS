window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const physicsHelpers = ns._physicsHelpers || {};
    const physicsTick = ns._physicsTick || {};

    const {
        getMotionProfile,
        syncMotionAnchors,
        setWebMotionAnchor,
        getReleaseVelocityScale
    } = physicsHelpers;
    const { tickPhysics } = physicsTick;

    const physics = ns._physics = ns._physics || {};

    Object.assign(physics, {
        getMotionProfile,
        syncMotionAnchors,
        setWebMotionAnchor,
        getReleaseVelocityScale,
        tickPhysics
    });

})(window.EveConstellationMap);
