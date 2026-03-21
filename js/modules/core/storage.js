// --- STORAGE & INIT ---
const EVE_LINKS_KEY = 'eveV22Data';
const EVE_CONFIG_KEY = 'eveV22Config';
const EVE_BOOKMARK_FOLDERS_KEY = 'eveV22BookmarkFolders';
const EVE_QUICK_PINS_KEY = 'eveV22QuickPins';

function saveData(options = {}) {
    const skipRender = !!options.skipRender;
    const skipSuggestions = !!options.skipSuggestions;
    const sanitizedLinks = Array.isArray(links)
        ? links.map((link) => {
            if (!link || typeof link !== 'object') return link;
            const nextLink = { ...link };
            delete nextLink.pinned;
            return nextLink;
        })
        : [];
    
    const doSave = () => {
        localStorage.setItem(EVE_LINKS_KEY, JSON.stringify(sanitizedLinks));
        localStorage.setItem(EVE_BOOKMARK_FOLDERS_KEY, JSON.stringify(
            (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
                ? bookmarkFolders
                : {}
        ));
        localStorage.setItem(EVE_QUICK_PINS_KEY, JSON.stringify(
            (typeof quickPins !== 'undefined' && Array.isArray(quickPins))
                ? quickPins
                : []
        ));
    };

    try {
        doSave();
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            console.warn("Core Storage: Quota exceeded during saveData. Attempting emergency prune...");
            if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                CCMaintenance.emergencyPrune(0.5);
                try {
                    doSave();
                    console.log("Core Storage: Save successful after prune.");
                } catch (retryError) {
                    console.error("Core Storage: Final save failure after prune:", retryError);
                }
            }
        } else {
            console.error("Core Storage: Unexpected error during saveData:", e);
        }
    }

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveData' } }));
    if (!skipRender && typeof renderDashboard === 'function') renderDashboard();
    if (!skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
}

function saveConfig() {
    try {
        localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                CCMaintenance.emergencyPrune(0.3);
                try {
                    localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(config));
                } catch (retryError) { }
            }
        }
    }
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveConfig' } }));
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

function loadData() {
    const storedLinks = localStorage.getItem(EVE_LINKS_KEY);
    if (storedLinks) { try { links = JSON.parse(storedLinks); } catch (e) { links = []; } }
    const storedBookmarkFolders = localStorage.getItem(EVE_BOOKMARK_FOLDERS_KEY);
    if (storedBookmarkFolders) {
        try {
            const parsed = JSON.parse(storedBookmarkFolders);
            bookmarkFolders = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            bookmarkFolders = {};
        }
    } else {
        bookmarkFolders = {};
    }
    const storedQuickPins = localStorage.getItem(EVE_QUICK_PINS_KEY);
    if (storedQuickPins) {
        try {
            const parsedQuickPins = JSON.parse(storedQuickPins);
            quickPins = Array.isArray(parsedQuickPins) ? parsedQuickPins : [];
        } catch (e) {
            quickPins = [];
        }
    } else {
        quickPins = [];
    }
    const storedConfig = localStorage.getItem(EVE_CONFIG_KEY);
    if (storedConfig) { try { config = { ...config, ...JSON.parse(storedConfig) }; } catch (e) { } }
    if (!['grid', 'list', 'unidex'].includes(config.viewMode)) config.viewMode = 'grid';
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    if (!config.workspaces || config.workspaces.length === 0) config.workspaces = [{ id: 'main', name: 'Main', icon: '🏠' }];
    if (!config.activeWorkspace) config.activeWorkspace = 'main';

    // Apply settings
    if (typeof applySettings === 'function') applySettings();

    // Load notes
    const notes = localStorage.getItem('eveV22Notes');
    const notesArea = document.getElementById('notes-area');
    if (notesArea) notesArea.value = notes || "";

    // Default links if empty
    if (links.length === 0) links = [{ id: 1, title: "Welcome", url: "#", category: "Start", done: false, workspace: 'main', icon: '👋' }];

    if (window.EveQuickPins?.migrateLegacyPins) {
        window.EveQuickPins.migrateLegacyPins();
    }

    // Render
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateSuggestions === 'function') updateSuggestions();
    if (typeof updateTimeAndGreeting === 'function') {
        updateTimeAndGreeting();
        setInterval(updateTimeAndGreeting, 1000);
    }
}



async function clearAllData() {
    if (await showConfirm("WIPE ALL?")) {
        localStorage.clear();
        location.reload();
    }
}
