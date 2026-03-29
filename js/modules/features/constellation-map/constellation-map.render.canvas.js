window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const renderAnchors = ns._renderAnchors || {};
    const renderLabels = ns._renderLabels || {};
    const renderAuras = ns._renderAuras || {};
    const renderBlobs = ns._renderBlobs || {};

    const renderCanvas = ns._renderCanvas = ns._renderCanvas || {};
    Object.assign(renderCanvas, renderAnchors, renderLabels, renderAuras, renderBlobs);
})(window.EveConstellationMap);
