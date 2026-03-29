window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const toolbarMarkup = ns._toolbarMarkup = ns._toolbarMarkup || {};
    Object.assign(toolbarMarkup, ns._toolbarMarkupBuilders || {}, ns._toolbarMarkupOverlay || {});
})(window.EveConstellationMap);
