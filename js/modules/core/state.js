// --- STATE ---
let links = [];
let config = {
    background: "", viewMode: "grid", timerEnabled: false, weatherEnabled: false,
    accent: "#00d4ff", collapsed: [], categoryOrder: [], userName: "",
    searchEngine: "https://www.google.com/search?q=", headerMode: "greeting",
    hideStats: [], workspaces: [{ id: 'main', name: 'Main', icon: '🏠' }], activeWorkspace: 'main',
    scrollableCategories: false
};
let focusCategory = null;
let timerInterval = null, timerSeconds = 1500, timerRunning = false;

// Expose state globally for debug/access patterns used in this app
window.eveState = {
    get config() { return config; },
    get links() { return links; }
};
