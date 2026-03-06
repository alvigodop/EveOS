/**
 * Library UI Module for Eve OS
 * Main UI controller for category library panels
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    const State = window.EveLibrary.State;
    const Storage = window.EveLibrary.Storage;
    const EntryManager = window.EveLibrary.EntryManager;
    const EntriesRenderer = window.EveLibrary.EntriesRenderer;
    const OptionsUpdaters = window.EveLibrary.OptionsUpdaters;
    const StatsRenderer = window.EveLibrary.StatsRenderer;
    const Search = window.EveLibrary.Search;
    const Shared = window.EveLibrary.UIShared || {};
    const modules = window.EveLibrary.UIModules || {};

    const state = {
        currentEditingCategory: null,
        currentEditingEntryId: null
    };

    const normalizeListForInput = Shared.normalizeListForInput || function (value) {
        if (!Array.isArray(value)) return String(value || '');
        return value.map(item => String(item || '').trim()).filter(Boolean).join(', ');
    };

    const formatTimestamp = Shared.formatTimestamp || function (value) {
        if (!value) return '-';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
    };

    const formatOptionalScore = Shared.formatOptionalScore || function (value) {
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : '';
    };

    const forms = modules.createForms
        ? modules.createForms({
            state,
            State,
            normalizeListForInput,
            formatTimestamp,
            formatOptionalScore
        })
        : null;

    const panels = forms && modules.createPanels
        ? modules.createPanels({
            state,
            State,
            Storage,
            EntryManager,
            EntriesRenderer,
            OptionsUpdaters,
            StatsRenderer,
            Search,
            Shared,
            forms
        })
        : null;

    if (!forms || !panels) {
        console.warn('[LibraryUI] Modular form or panel helpers missing.');
        return;
    }

    function saveEntry(categoryName) {
        if (state.currentEditingEntryId) {
            EntryManager.editEntry(categoryName, state.currentEditingEntryId, function () {
                panels.refreshLibrary(categoryName);
            });
        } else {
            EntryManager.addEntry(categoryName, function () {
                panels.refreshLibrary(categoryName);
            });
        }
        forms.hideForm(categoryName);
    }

    window.EveLibrary.UI = {
        createLibraryPanelHtml: panels.createLibraryPanelHtml,
        initLibraryPanel: panels.initLibraryPanel,
        toggleLibraryPanel: panels.toggleLibraryPanel,
        toggleStats: panels.toggleStats,
        refreshLibrary: panels.refreshLibrary,
        resetAndRefresh: panels.resetAndRefresh,
        changeDataType: panels.changeDataType,
        showAddForm: forms.showAddForm,
        hideForm: forms.hideForm,
        editEntry: forms.editEntry,
        saveEntry,
        confirmDeleteEntry: panels.confirmDeleteEntry,
        toggleFavorite: panels.toggleFavorite,
        goToPage: panels.goToPage,
        exportLibrary: panels.exportLibrary,
        importLibrary: panels.importLibrary,
        batchDelete: panels.batchDelete,
        openLightbox: panels.openLightbox,
        showBackups: panels.showBackups,
        restoreBackup: panels.restoreBackup,
        openEntryLink: panels.openEntryLink
    };

    panels.bindRealtimeUpdates();
})();
