// Unidex View Controls State Module
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createControlsState = function createControlsState(deps) {
        const configHelpers = window.UnidexViewModules.createControlsStateConfig
            ? window.UnidexViewModules.createControlsStateConfig(deps)
            : null;
        const transformHelpers = window.UnidexViewModules.createControlsStateTransforms
            ? window.UnidexViewModules.createControlsStateTransforms({
                getLinkedLibraryEntry: deps?.getLinkedLibraryEntry,
                getEntryConfidence: deps?.getEntryConfidence,
                getEntriesConfidenceMin: configHelpers?.getEntriesConfidenceMin,
                getEntriesConfidenceMax: configHelpers?.getEntriesConfidenceMax,
                getEntriesSortBy: configHelpers?.getEntriesSortBy,
                getEntriesSortOrder: configHelpers?.getEntriesSortOrder
            })
            : null;

        if (!configHelpers || !transformHelpers) {
            console.warn('[UnidexView] Controls state helpers missing.');
            return {};
        }

        return {
            getEntriesLayoutMode: configHelpers.getEntriesLayoutMode,
            getEntriesDensityMode: configHelpers.getEntriesDensityMode,
            setEntriesDensityMode: configHelpers.setEntriesDensityMode,
            setEntriesLayoutMode: configHelpers.setEntriesLayoutMode,
            toggleEntriesLayout: configHelpers.toggleEntriesLayout,
            getCardsUnifiedMode: configHelpers.getCardsUnifiedMode,
            setCardsUnifiedMode: configHelpers.setCardsUnifiedMode,
            setCardsUnified: configHelpers.setCardsUnified,
            getTabsUnifiedMode: configHelpers.getTabsUnifiedMode,
            getTabsTreeMode: configHelpers.getTabsTreeMode,
            setTabsTreeMode: configHelpers.setTabsTreeMode,
            toggleTabsTreeMode: configHelpers.toggleTabsTreeMode,
            setTabsUnifiedMode: configHelpers.setTabsUnifiedMode,
            setTabsUnified: configHelpers.setTabsUnified,
            getEntriesFilterMode: configHelpers.getEntriesFilterMode,
            getEntriesGroupMode: configHelpers.getEntriesGroupMode,
            setEntriesGroupMode: configHelpers.setEntriesGroupMode,
            setEntriesFilter: configHelpers.setEntriesFilter,
            getEntriesSortBy: configHelpers.getEntriesSortBy,
            getEntriesSortOrder: configHelpers.getEntriesSortOrder,
            setEntriesSortBy: configHelpers.setEntriesSortBy,
            setEntriesSortOrder: configHelpers.setEntriesSortOrder,
            getEntriesConfidenceMin: configHelpers.getEntriesConfidenceMin,
            getEntriesConfidenceMax: configHelpers.getEntriesConfidenceMax,
            setEntriesConfidenceMin: configHelpers.setEntriesConfidenceMin,
            setEntriesConfidenceMax: configHelpers.setEntriesConfidenceMax,
            formatConfidenceInput: configHelpers.formatConfidenceInput,
            applyEntriesViewTransforms: transformHelpers.applyEntriesViewTransforms
        };
    };
})();
