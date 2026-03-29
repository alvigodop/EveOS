window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const stability = ns._physicsMotionAnchorsStability || {};
    const web = ns._physicsMotionAnchorsWeb || {};

    const moduleApi = ns._physicsMotionAnchors = ns._physicsMotionAnchors || {};

    Object.assign(moduleApi, {
        stabilizeNodeMotion: stability.stabilizeNodeMotion,
        applyMotionModePositioning: web.applyMotionModePositioning,
        setWebMotionAnchor: web.setWebMotionAnchor,
        syncMotionAnchors: web.syncMotionAnchors,
        getMotionTargetAnchor: web.getMotionTargetAnchor,
        applySoftWorldTether: stability.applySoftWorldTether
    });
})(window.EveConstellationMap);
