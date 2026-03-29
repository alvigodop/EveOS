window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const graphDebug = ns._coreDebugGraph || {};
    const inspectorDebug = ns._coreDebugInspector || {};

    const coreDebug = ns._coreDebug = ns._coreDebug || {};

    Object.assign(coreDebug, {
        __debugGetGraphStats: graphDebug.__debugGetGraphStats,
        __debugGetInspectorCoverState: inspectorDebug.__debugGetInspectorCoverState,
        __debugSelectNode: inspectorDebug.__debugSelectNode,
        __debugShiftInspectorHover: inspectorDebug.__debugShiftInspectorHover
    });
})(window.EveConstellationMap);
