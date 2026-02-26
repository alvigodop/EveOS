// --- STORAGE & INIT ---

function saveData() {
    localStorage.setItem('eveV22Data', JSON.stringify(links));
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateSuggestions === 'function') updateSuggestions();
}

function saveConfig() {
    localStorage.setItem('eveV22Config', JSON.stringify(config));
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

function loadData() {
    const storedLinks = localStorage.getItem('eveV22Data');
    if (storedLinks) { try { links = JSON.parse(storedLinks); } catch (e) { links = []; } }
    const storedConfig = localStorage.getItem('eveV22Config');
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
