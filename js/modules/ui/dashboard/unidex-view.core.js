// --- UNIDEX VIEW (TABS -> CARDS -> ENTRIES) ---
window.UnidexView = (function () {
    const state = {
        stage: 'tabs',
        selectedWorkspaceId: '',
        selectedCategory: '',
        entriesRetryTimer: null,
        layoutMaintenanceTimers: [],
        layoutMaintenanceToken: 0,
        libraryReadyWaitStartedAt: 0,
        LIBRARY_READY_RETRY_MS: 180,
        LIBRARY_READY_HINT_DELAY_MS: 320,
        LIBRARY_READY_MAX_WAIT_MS: 2500,
        LAYOUT_MAINTENANCE_DELAYS_MS: [0, 600, 1800, 3600]
    };

    const modules = window.UnidexViewModules || {};
    const helpers = modules.createCoreHelpers ? modules.createCoreHelpers({ state }) : null;
    const builders = helpers && modules.createBuilders ? modules.createBuilders({
        state,
        getAllLinks: helpers.getAllLinks,
        encodeParam: helpers.encodeParam,
        escapeHtml: helpers.escapeHtml,
        getDomain: helpers.getDomain,
        truncateText: helpers.truncateText,
        getLinkedLibraryEntry: helpers.getLinkedLibraryEntry,
        getEntryConfidence: helpers.getEntryConfidence,
        getMediaTypeLabel: helpers.getMediaTypeLabel,
        getProgressLabel: helpers.getProgressLabel,
        buildBookmarkIconHtml: helpers.buildBookmarkIconHtml
    }) : null;
    const controls = helpers && modules.createControls ? modules.createControls({
        state,
        getLinkedLibraryEntry: helpers.getLinkedLibraryEntry,
        getEntryConfidence: helpers.getEntryConfidence,
        readConfig: function () {
            return typeof config !== 'undefined' && config ? config : {};
        },
        persistConfig: function () {
            if (typeof saveConfig === 'function') saveConfig();
        },
        requestRender: function () {
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    }) : null;
    const layout = modules.createLayout ? modules.createLayout({ state }) : null;
    const stages = helpers && builders && controls && layout && modules.createStages ? modules.createStages({
        state,
        getWorkspaceById: helpers.getWorkspaceById,
        getWorkspaceLinks: helpers.getWorkspaceLinks,
        getWorkspaceAndSubTabLinks: helpers.getWorkspaceAndSubTabLinks,
        getAllWorkspaceLinks: helpers.getAllWorkspaceLinks,
        getCategoryModels: helpers.getCategoryModels,
        isTaskModeCategory: helpers.isTaskModeCategory,
        getWorkspaceLabel: helpers.getWorkspaceLabel,
        escapeHtml: helpers.escapeHtml,
        ensureLibraryReadyForEntries: helpers.ensureLibraryReadyForEntries,
        shouldShowLibraryLoadingHint: helpers.shouldShowLibraryLoadingHint,
        scheduleEntriesRetry: helpers.scheduleEntriesRetry,
        resetLibraryReadyWait: helpers.resetLibraryReadyWait,
        stabilizeEntriesLayout: layout.stabilizeEntriesLayout,
        clearLayoutMaintenanceTimers: layout.clearLayoutMaintenanceTimers,
        scheduleLayoutMaintenance: function (gridContainer) { layout.scheduleLayoutMaintenance(gridContainer, controls.getEntriesLayoutMode); },
        buildTabsHtml: builders.buildTabsHtml,
        buildCardsHtml: builders.buildCardsHtml,
        buildEntriesHtml: builders.buildEntriesHtml,
        getEntriesLayoutMode: controls.getEntriesLayoutMode,
        getCardsUnifiedMode: controls.getCardsUnifiedMode,
        getTabsUnifiedMode: controls.getTabsUnifiedMode,
        getEntriesFilterMode: controls.getEntriesFilterMode,
        applyEntriesViewTransforms: controls.applyEntriesViewTransforms,
        buildEntriesControlsHtml: controls.buildEntriesControlsHtml
    }) : null;
    const navigation = helpers && stages && modules.createCoreNavigation ? modules.createCoreNavigation({
        state,
        helpers,
        stages,
        getActiveWorkspaceId: function () {
            return typeof config !== 'undefined' ? String(config?.activeWorkspace || '') : '';
        },
        switchWorkspaceById: function (workspaceId) {
            if (typeof switchWorkspace === 'function') {
                switchWorkspace(workspaceId);
            }
        },
        requestRender: function () {
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    }) : null;
    const entryActions = helpers && modules.createCoreEntryActions ? modules.createCoreEntryActions({
        helpers,
        openFromDashboard: typeof openBookmarkFromDashboard === 'function'
            ? openBookmarkFromDashboard
            : null,
        normalizeEntryUrl: function (url) {
            return typeof normalizeUrl === 'function' ? normalizeUrl(url) : url;
        },
        openUrl: function (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }) : null;

    if (!helpers || !builders || !controls || !layout || !stages || !navigation || !entryActions) {
        console.warn('[UnidexView] Modular components missing (helpers/builders/controls/layout/stages/navigation/actions).');
        return {
            render: function () { },
            switchWorkspaceTab: function () { },
            selectCategory: function () { },
            backToTabs: function () { },
            backToCards: function () { },
            setEntriesFilter: function () { },
            setEntriesSortBy: function () { },
            setEntriesSortOrder: function () { },
            setEntriesConfidenceMin: function () { },
            setEntriesConfidenceMax: function () { },
            setCardsUnified: function () { },
            setTabsUnified: function () { },
            toggleEntriesLayout: function () { },
            openEntryDirect: function () { return false; },
            openEntry: function () { return false; },
            resetSelection: function () { }
        };
    }

    function setCardsUnified(enabled) {
        const changed = controls.setCardsUnifiedMode(enabled);
        if (changed) helpers.resetLibraryReadyWait();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function setTabsUnified(enabled) {
        const changed = controls.setTabsUnifiedMode(enabled);
        if (changed) helpers.resetLibraryReadyWait();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function getConstellationScope() {
        const activeWorkspace = typeof config !== 'undefined' ? String(config?.activeWorkspace || 'main') : 'main';
        if (state.stage === 'entries' && state.selectedCategory) {
            return { scope: 'card', workspaceId: state.selectedWorkspaceId || activeWorkspace, categoryName: state.selectedCategory };
        }
        if (state.stage === 'cards') {
            return { scope: 'workspace', workspaceId: state.selectedWorkspaceId || activeWorkspace };
        }
        return { scope: 'all' };
    }

    function openConstellationMap() {
        if (window.EveConstellationMap?.openMap) {
            window.EveConstellationMap.openMap(getConstellationScope());
        }
    }

    return {
        render: stages.render,
        switchWorkspaceTab: navigation.switchWorkspaceTab,
        selectCategory: navigation.selectCategory,
        backToTabs: navigation.backToTabs,
        backToCards: navigation.backToCards,
        setEntriesFilter: controls.setEntriesFilter,
        setEntriesSortBy: controls.setEntriesSortBy,
        setEntriesSortOrder: controls.setEntriesSortOrder,
        setEntriesConfidenceMin: controls.setEntriesConfidenceMin,
        setEntriesConfidenceMax: controls.setEntriesConfidenceMax,
        setCardsUnified,
        setTabsUnified,
        toggleEntriesLayout: controls.toggleEntriesLayout,
        openEntryDirect: entryActions.openEntryDirect,
        openEntry: entryActions.openEntry,
        resetSelection: stages.resetSelection,
        getConstellationScope,
        openConstellationMap
    };
})();
