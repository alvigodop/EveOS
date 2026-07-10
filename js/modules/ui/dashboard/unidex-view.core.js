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
        getWorkspaceBookmarkCount: helpers.getWorkspaceBookmarkCount,
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
        getWorkspaceBookmarkCount: helpers.getWorkspaceBookmarkCount,
        getWorkspaceAndSubTabLinks: helpers.getWorkspaceAndSubTabLinks,
        getAllWorkspaceLinks: helpers.getAllWorkspaceLinks,
        getCategoryModels: helpers.getCategoryModels,
        getCategoryModelsForWorkspace: helpers.getCategoryModelsForWorkspace,
        isTaskModeCategory: helpers.isTaskModeCategory,
        getWorkspaceLabel: helpers.getWorkspaceLabel,
        encodeParam: helpers.encodeParam,
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
        buildWrappedCardsHtml: builders.buildWrappedCardsHtml,
        buildEntriesHtml: builders.buildEntriesHtml,
        getEntriesLayoutMode: controls.getEntriesLayoutMode,
        getCardsUnifiedMode: controls.getCardsUnifiedMode,
        getTabsUnifiedMode: controls.getTabsUnifiedMode,
        getTabsTreeMode: controls.getTabsTreeMode,
        getEntriesFilterMode: controls.getEntriesFilterMode,
        getEntriesGroupMode: controls.getEntriesGroupMode,
        applyEntriesViewTransforms: controls.applyEntriesViewTransforms,
        buildEntriesControlsHtml: controls.buildEntriesControlsHtml,
        getEntriesDensityMode: controls.getEntriesDensityMode
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
            setEntriesGroupMode: function () { },
            setEntriesDensityMode: function () { },
            setEntriesSortBy: function () { },
            setEntriesSortOrder: function () { },
            setEntriesConfidenceMin: function () { },
            setEntriesConfidenceMax: function () { },
            setCardsUnified: function () { },
            setTabsUnified: function () { },
            toggleTabsTreeMode: function () { },
            setTabsTreeMode: function () { },
            toggleEntriesLayout: function () { },
            openEntryDirect: function () { return false; },
            openEntry: function () { return false; },
            openEntryJsonState: function () { return false; },
            validateEntryJsonLink: function () { return false; },
            resetSelection: function () { },
            getMatrixScope: function () { return { scope: 'all' }; },
            openMatrixWorkshop: function () { }
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

    function getMatrixScope() {
        return getConstellationScope();
    }

    function openMatrixWorkshop() {
        if (window.EveMatrixWorkshop?.open) {
            window.EveMatrixWorkshop.open(getMatrixScope());
        }
    }

    function openNexusSearch(workspaceId) {
        const scope = workspaceId ? { workspaceId: String(workspaceId) } : {};
        if (typeof window.openExpandedSearchModal === 'function') {
            window.openExpandedSearchModal({ scope: scope });
        }
    }

    // Whether Unidex shows inactive tabs (grayed) or hides them entirely. Persisted so the
    // choice survives reloads; default OFF keeps the overview matched to the active datapack.
    function setShowInactiveTabs(enabled) {
        if (typeof config !== 'undefined' && config) {
            config.unidexShowInactiveTabs = !!enabled;
            if (typeof saveConfig === 'function') saveConfig({ source: 'unidex-show-inactive-tabs' });
        }
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    // Collapse/expand the SUB TABS section of a tab wrapper card (tabs stage). Pure DOM toggle —
    // no re-render — with the state remembered per session in window.__unidexExpandedSubTabs so
    // navigating stages keeps a section open; a fresh page load returns to collapsed.
    function toggleSubTabs(el) {
        const frame = el && typeof el.closest === 'function' 
            ? (el.closest('.unidex-tab-btn') || el.closest('.unidex-tab-wrapper-frame')) 
            : null;
        if (!frame) return;
        const id = frame.getAttribute('data-subtabs-id') || '';
        const expandedMap = window.__unidexExpandedSubTabs = window.__unidexExpandedSubTabs || {};
        
        let collapsed;
        if (frame.classList.contains('unidex-tab-btn')) {
            collapsed = !expandedMap[id];
            if (collapsed) expandedMap[id] = true;
            else delete expandedMap[id];
            
            const arrow = frame.querySelector('.unidex-subtabs-arrow');
            if (arrow) {
                arrow.innerHTML = collapsed ? '&#9662;' : '&#9656;';
            }
        } else {
            collapsed = frame.classList.toggle('is-subtabs-collapsed');
            if (collapsed) delete expandedMap[id];
            else expandedMap[id] = true;
            
            const toggle = frame.querySelector('.unidex-subtabs-toggle');
            if (toggle) {
                toggle.setAttribute('aria-expanded', String(!collapsed));
                toggle.title = (collapsed ? 'Expand' : 'Collapse') + ' sub tabs';
            }
            frame.querySelectorAll('.unidex-subtabs-arrow').forEach(function (arrowEl) {
                arrowEl.innerHTML = collapsed ? '&#9656;' : '&#9662;';
            });
        }

        const rootFrame = frame.closest('.unidex-tab-wrapper-frame');
        if (rootFrame) {
            const grid = rootFrame.querySelector('.unidex-tab-wrap-grid');
            if (grid) {
                const buttons = grid.querySelectorAll('.unidex-tab-btn');
                buttons.forEach(function (btn) {
                    const ancestorIdsAttr = btn.getAttribute('data-ancestor-ids') || '';
                    if (!ancestorIdsAttr) return;
                    const ancestorsList = ancestorIdsAttr.split(',');
                    let hidden = false;
                    for (let i = 0; i < ancestorsList.length; i++) {
                        const ancId = ancestorsList[i];
                        if (!expandedMap[ancId]) {
                            hidden = true;
                            break;
                        }
                    }
                    if (hidden) {
                        btn.classList.add('is-subtab-button-hidden');
                    } else {
                        btn.classList.remove('is-subtab-button-hidden');
                    }
                });
            }
        }
    }

    function toggleCardList(el, subTabId) {
        const section = el && typeof el.closest === 'function' ? el.closest('.unidex-subtab-section') : null;
        if (!section) return;
        const collapsed = section.classList.toggle('is-card-list-collapsed');
        const cardListsMap = window.__unidexExpandedCardLists = window.__unidexExpandedCardLists || {};
        
        if (collapsed) {
            cardListsMap[subTabId] = false;
        } else {
            cardListsMap[subTabId] = true;
        }
        
        const arrow = el.querySelector('.unidex-subtabs-arrow');
        if (arrow) {
            arrow.innerHTML = collapsed ? '&#9656;' : '&#9662;';
        }
    }

    function toggleCardSubTabs(el, subTabId) {
        const section = el && typeof el.closest === 'function' ? el.closest('.unidex-subtab-section') : null;
        if (!section) return;
        const collapsed = section.classList.toggle('is-subtabs-collapsed');
        const cardSubTabsMap = window.__unidexExpandedCardSubTabs = window.__unidexExpandedCardSubTabs || {};
        
        if (collapsed) {
            cardSubTabsMap[subTabId] = false;
        } else {
            cardSubTabsMap[subTabId] = true;
        }
        
        const arrow = el.querySelector('.unidex-subtabs-arrow');
        if (arrow) {
            arrow.innerHTML = collapsed ? '&#9656;' : '&#9662;';
        }
    }

    return {
        render: stages.render,
        switchWorkspaceTab: navigation.switchWorkspaceTab,
        selectCategory: navigation.selectCategory,
        backToTabs: navigation.backToTabs,
        backToCards: navigation.backToCards,
        setEntriesFilter: controls.setEntriesFilter,
        setEntriesGroupMode: controls.setEntriesGroupMode,
        setEntriesDensityMode: controls.setEntriesDensityMode,
        setEntriesSortBy: controls.setEntriesSortBy,
        setEntriesSortOrder: controls.setEntriesSortOrder,
        setEntriesConfidenceMin: controls.setEntriesConfidenceMin,
        setEntriesConfidenceMax: controls.setEntriesConfidenceMax,
        setCardsUnified,
        setTabsUnified,
        toggleTabsTreeMode: controls.toggleTabsTreeMode,
        setTabsTreeMode: controls.setTabsTreeMode,
        toggleEntriesLayout: controls.toggleEntriesLayout,
        openEntryDirect: entryActions.openEntryDirect,
        openEntry: entryActions.openEntry,
        openEntryJsonState: entryActions.openEntryJsonState,
        validateEntryJsonLink: entryActions.validateEntryJsonLink,
        resetSelection: stages.resetSelection,
        getConstellationScope,
        openConstellationMap,
        getMatrixScope,
        openMatrixWorkshop,
        openNexusSearch,
        toggleSubTabs,
        toggleCardList,
        toggleCardSubTabs,
        setShowInactiveTabs
    };
})();
