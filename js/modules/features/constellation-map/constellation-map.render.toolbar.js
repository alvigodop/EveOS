window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const renderToolbarHelpers = ns._renderToolbarHelpers = ns._renderToolbarHelpers || {};
    Object.assign(renderToolbarHelpers, ns._renderToolbarBase || {}, ns._renderToolbarWheel || {}, ns._renderToolbarRuntime || {});
})(window.EveConstellationMap);
