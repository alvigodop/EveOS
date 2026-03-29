window.EveConstellationMap = window.EveConstellationMap || {};
(function (ns) {
    const sharedState = ns._shared = ns._shared || {};
    Object.assign(sharedState, ns._coversLinks || {}, ns._coversPreview || {});
})(window.EveConstellationMap);
