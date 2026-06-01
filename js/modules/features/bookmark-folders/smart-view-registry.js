window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    if (api.ready) return;
    api.ready = true;
    api.version = api._shared?.SMART_VIEW_VERSION || 1;

    window.promptCreateSmartView = function (categoryName, workspaceId) {
        return api.promptCreateSmartView(workspaceId || window.eveState?.config?.activeWorkspace || 'main', categoryName || (typeof focusCategory !== 'undefined' ? focusCategory : 'Unsorted'));
    };
    window.deleteSmartViewFromTile = api.deleteSmartViewFromTile;
})(window.EveSmartViewRegistry);
