// --- STATE ---
let links = [];
let bookmarkFolders = {};
let quickPins = [];
let config = {
    background: "",
    viewMode: "grid",
    timerEnabled: false,
    weatherEnabled: false,
    accent: "#00d4ff",
    popupColor: "#1e1e1e",
    collapsed: [],
    collapsedTabs: [],
    categoryOrder: [],
    categoryOrderByWorkspace: {},
    userName: "",
    searchEngine: "https://www.google.com/search?q=",
    searchMode: "basic",
    bookmarkIdentifiers: [],
    backupSettingsMode: "all",
    bookmarkClickOpensLink: false,
    bookmarkClickDefaultMode: "focus_only",
    headerMode: "greeting",
    headerControls: {
        showDate: true,
        use24HourClock: false,
        includeName: true,
        morningMessage: "Good Morning",
        afternoonMessage: "Good Afternoon",
        eveningMessage: "Good Evening",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 56,
        letterSpacing: 2,
        textColor: "",
        effect: "none",
        effectColor: "#00d4ff"
    },
    hideStats: [],
    hideStatsScoped: [],
    workspaces: [{ id: "main", name: "Main", icon: "\u{1F3E0}" }],
    sidebarGroups: [],
    sidebarOrderMode: "auto",
    sidebarManualOrder: {
        root: [],
        parents: {}
    },
    sidebarFocusedGroupId: "",
    showHiddenSidebarGroups: false,
    showInactiveTabs: false,
    sidebarExpanded: false,
    timerDurationSeconds: 1500,
    startupViewMode: "",
    paginationChunkSize: 220,
    reducedMotion: false,
    defaultAddLinkCategory: "",
    confirmBeforeSweep: true,
    backupReminderDays: 0,
    lastBackupAt: "",
    editHistoryFullStateMaxLinks: 2500,
    nexusIndexPersistMaxRecords: 15000,
    bridges: {
        serverPort: 3000,
        lightpandaPort: 3037,
        camofoxPort: 3038,
        wikimediaPort: 3039,
        popupPort: 3040,
        corsProxyUrl: "",
        codetabsProxyUrl: "",
        statusTimeoutMs: 350
    },
    activeWorkspace: "main",
    bookmarkFolderToolbarExpanded: [],
    cardHeaderButtonsVisible: {},
    cardBookmarkProgressiveReveal: {},
    scrollableCategories: false,
    unidexCardsUnified: false,
    unidexTabsUnified: false,
    unidexStage: "tabs",
    unidexStagePersisted: false,
    unidexSelectedWorkspaceId: "",
    unidexSelectedCategory: "",
    unidexEntriesLayout: "rows",
    unidexEntriesDensity: "comfortable",
    unidexEntriesFilter: "all",
    unidexEntriesSortBy: "none",
    unidexEntriesSortOrder: "desc",
    unidexEntriesConfidenceMin: null,
    unidexEntriesConfidenceMax: null,
    modularStateSyncEnabled: true,
    modularStateSyncIntervalMs: 5000,
    modularStateConflictStrategy: "remote_wins",
    modularStateRootPath: "",
    modularLayerPath: "",
    modularLayerScope: "store",
    modularGeminiMode: "summary",
    geminiLiveLinkEnabled: true,
    focusedEntriesFilter: "all",
    focusedEntriesSortBy: "none",
    focusedEntriesSortOrder: "desc",
    ratingSettings: {
        activeScale: "hybrid",
        personalWeight: 0.5,
        missingScoreMode: "ignore_missing",
        enabledProviders: {
            anilist: true,
            myanimelist: true,
            mangadex: true
        },
        providerWeights: {
            anilist: 1,
            myanimelist: 1,
            mangadex: 1
        }
    }
};
let focusCategory = null;
let timerInterval = null, timerSeconds = 1500, timerRunning = false;

// Expose state globally for debug/access patterns used in this app
window.eveState = {
    get config() { return config; },
    set config(value) { if (value && typeof value === 'object') config = value; },
    get links() { return links; },
    set links(value) { if (Array.isArray(value)) links = value; },
    get bookmarkFolders() { return bookmarkFolders; },
    set bookmarkFolders(value) { if (value && typeof value === 'object') bookmarkFolders = value; },
    get quickPins() { return quickPins; },
    set quickPins(value) { quickPins = Array.isArray(value) ? value : []; }
};
