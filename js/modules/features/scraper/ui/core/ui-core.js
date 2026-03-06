/**
 * UI Core Module - Core UI functionality and utilities
 * Split from original ui.js for better modularity
 *
 * @version 1.0.3
 * @updated 2026-03-05 - Extracted display and feedback helpers
 */

const UI = {};
const displayHelpers = window.UICoreModules?.createDisplayHelpers
    ? window.UICoreModules.createDisplayHelpers()
    : {};
const feedbackHelpers = window.UICoreModules?.createFeedbackHelpers
    ? window.UICoreModules.createFeedbackHelpers()
    : {};

UI.version = '1.0.3';
UI.installed = true;
UI._isStub = false;

UI.init = function () {
    console.log('Initializing UI Core module (Facade)');
    UI.installed = true;

    if (window.LoadingIndicator && typeof LoadingIndicator.init === 'function') {
        LoadingIndicator.init();
    }

    this._initialized = true;
    return this;
};

Object.assign(UI, displayHelpers, feedbackHelpers);

Object.defineProperty(UI, '_loadingIndicatorCompact', {
    get: function () {
        return window.LoadingIndicator ? LoadingIndicator._loadingIndicatorCompact : true;
    },
    set: function (val) {
        if (window.LoadingIndicator) LoadingIndicator._loadingIndicatorCompact = val;
    }
});

if (window.ModuleLoader) {
    ModuleLoader.registerModule('UI', UI);
    UI.init = ModuleLoader.createInitFunction('UI', UI.init);
} else {
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('UI', UI);
    }
    window.UI = UI;
    if (typeof window.dispatchModuleLoadedEvent === 'function') {
        window.dispatchModuleLoadedEvent('UI');
    }
}

window.toggleLoadingIndicator = function () {
    if (window.UI) UI.toggleLoadingIndicator();
};

window.updateLoadingIndicator = function (isSearching, message, stats) {
    if (window.UI) UI.updateLoadingIndicatorEnhanced(isSearching, message, stats);
};

console.log('UI Core module loaded (Modularized)');
