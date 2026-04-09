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
    workspaces: [{ id: "main", name: "Main", icon: "\u{1F3E0}" }],
    activeWorkspace: "main",
    bookmarkFolderToolbarExpanded: [],
    cardHeaderButtonsVisible: {},
    scrollableCategories: false,
    unidexCardsUnified: false,
    unidexTabsUnified: false,
    unidexEntriesLayout: "rows",
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
    get links() { return links; },
    get bookmarkFolders() { return bookmarkFolders; },
    get quickPins() { return quickPins; },
    set quickPins(value) { quickPins = Array.isArray(value) ? value : []; }
};
