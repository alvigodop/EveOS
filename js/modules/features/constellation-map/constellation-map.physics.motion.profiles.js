window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const moduleApi = ns._physicsMotionProfiles = ns._physicsMotionProfiles || {};
    Object.assign(moduleApi, ns._physicsMotionProfilesBase || {}, ns._physicsMotionProfilesInfluence || {}, ns._physicsMotionProfilesDynamics || {});
})(window.EveConstellationMap);
