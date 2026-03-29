window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const renderInspectorRuntime = ns._renderInspectorRuntime = ns._renderInspectorRuntime || {};
    Object.assign(renderInspectorRuntime, ns._renderInspectorRuntimeMarkup || {}, ns._renderInspectorRuntimeView || {});
})(window.EveConstellationMap);
