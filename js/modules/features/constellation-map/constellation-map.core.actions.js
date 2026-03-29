window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const helpers = ns._coreActionHelpers || {};
    const wheel = ns._coreActionWheel || {};
    const navigate = ns._coreActionNavigate || {};
    const dispatch = ns._coreActionDispatch || {};

    const coreActions = ns._coreActions = ns._coreActions || {};

    Object.assign(coreActions, {
        applyPassiveReleaseImpulse: helpers.applyPassiveReleaseImpulse,
        getPrimaryAction: helpers.getPrimaryAction,
        getActionWheelItems: wheel.getActionWheelItems,
        activateNode: navigate.activateNode,
        openFolderFromMap: navigate.openFolderFromMap,
        openCategorySettingsFromMap: navigate.openCategorySettingsFromMap,
        openActionWheel: wheel.openActionWheel,
        closeActionWheel: wheel.closeActionWheel,
        runNodeAction: dispatch.runNodeAction
    });

    ns._applyPassiveReleaseImpulse = helpers.applyPassiveReleaseImpulse;
    ns._activateNode = navigate.activateNode;
    ns._openConstellationActionWheel = wheel.openActionWheel;
    ns._closeConstellationActionWheel = wheel.closeActionWheel;
    ns._getConstellationActionWheelItems = wheel.getActionWheelItems;
    ns._runNodeAction = dispatch.runNodeAction;
})(window.EveConstellationMap);
