(function () {
    const core = window.EveCategorySettingsModalCore || {};
    window.EveCategorySettingsModalHelpers = Object.assign(window.EveCategorySettingsModalHelpers || {}, {
        renderCategoryHeaderButtonSettings: core.renderCategoryHeaderButtonSettings || function () {},
        renderCategoryClickBehaviorSettings: core.renderCategoryClickBehaviorSettings || function () {},
        renderCategoryPinSettings: core.renderCategoryPinSettings || function () {}
    });
})();
