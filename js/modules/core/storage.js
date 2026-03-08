// --- STORAGE & INIT ---
const EVE_LINKS_KEY = 'eveV22Data';
const EVE_CONFIG_KEY = 'eveV22Config';
const EVE_BOOKMARK_FOLDERS_KEY = 'eveV22BookmarkFolders';

function saveData() {
    localStorage.setItem(EVE_LINKS_KEY, JSON.stringify(links));
    localStorage.setItem(EVE_BOOKMARK_FOLDERS_KEY, JSON.stringify(
        (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
            ? bookmarkFolders
            : {}
    ));
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveData' } }));
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateSuggestions === 'function') updateSuggestions();
}

function saveConfig() {
    localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(config));
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
    if (links.length === 0) links = [{ id: 1, title: "Welcome", url: "#", category: "Start", done: false, pinned: false, workspace: 'main', icon: '👋' }];

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
