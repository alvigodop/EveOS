window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const profiles = ns._physicsMotionProfiles || {};
    const anchors = ns._physicsMotionAnchors || {};

    const moduleApi = ns._physicsMotion = ns._physicsMotion || {};
    Object.assign(moduleApi, profiles, anchors);
})(window.EveConstellationMap);
