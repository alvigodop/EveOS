window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const inspectorCore = ns._renderInspectorCore || {};
    const inspectorRuntime = ns._renderInspectorRuntime || {};

    const renderInspectorHelpers = ns._renderInspectorHelpers = ns._renderInspectorHelpers || {};

    Object.assign(renderInspectorHelpers, {
        getPrimaryAction: inspectorCore.getPrimaryAction,
        applyInspectorShellStyle: inspectorCore.applyInspectorShellStyle,
        getSecondaryActions: inspectorCore.getSecondaryActions,
        getCompactInspectorMarkup: inspectorRuntime.getCompactInspectorMarkup,
        renderInspector: inspectorRuntime.renderInspector,
        updateInspectorCoverState: inspectorRuntime.updateInspectorCoverState,
        updateCursor: inspectorRuntime.updateCursor
    });
})(window.EveConstellationMap);
