window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedState = ns._sharedState = ns._sharedState || {};
    Object.assign(sharedState, ns._sharedStateCore || {}, ns._sharedStateConfig || {});
})(window.EveConstellationMap);
