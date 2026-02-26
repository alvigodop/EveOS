// --- SETTINGS ACTIONS ---
function openSettings() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('bgUrl').value = "";
    document.getElementById('timerToggle').checked = config.timerEnabled;
    document.getElementById('weatherToggle').checked = config.weatherEnabled;
    document.getElementById('userName').value = config.userName || "";
    document.getElementById('accentColor').value = config.accent || "#00d4ff";
    document.getElementById('searchEngineSelect').value = config.searchEngine || "https://www.google.com/search?q=";
    document.getElementById('searchModeSelect').value = config.searchMode || "basic";
    // Theme Settings
    const theme = config.themeMode || 'dark';
    const radios = document.getElementsByName('themeMode');
    for (const r of radios) { r.checked = (r.value === theme); }

    document.getElementById('bgColor').value = config.bgColor || "#222222";
    document.getElementById('cardColor').value = config.cardColor || "#1e1e1e";

    // Set initial state of color inputs
    updateColorInputAvailability();
    if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
    if (typeof refreshCardBackupList === 'function') refreshCardBackupList();
}

function saveSettingsTimer() { config.timerEnabled = document.getElementById('timerToggle').checked; saveConfig(); applySettings(); }
function saveSettingsWeather() { config.weatherEnabled = document.getElementById('weatherToggle').checked; saveConfig(); applySettings(); if (typeof fetchWeather === 'function') fetchWeather(); }
function saveSettingsScrollable() { config.scrollableCategories = document.getElementById('scrollableCats').checked; saveConfig(); renderDashboard(); }
function saveSettingsName() { config.userName = document.getElementById('userName').value; saveConfig(); updateTimeAndGreeting(); }
// Helper to toggle color inputs
function updateColorInputAvailability() {
    const isCustom = config.themeMode === 'custom';
    const area = document.getElementById('customColorsArea');
    if (area) {
        area.style.opacity = isCustom ? '1' : '0.5';
        area.style.pointerEvents = isCustom ? 'auto' : 'none';
        // area.style.filter = isCustom ? 'none' : 'grayscale(100%)'; // Optional visual cue
    }
}

function saveSettingsTheme(mode) {
    config.themeMode = mode;
    saveConfig();
    applySettings();
    updateColorInputAvailability();
}

function saveSettingsAccent() { config.accent = document.getElementById('accentColor').value; saveConfig(); applySettings(); }
function saveSettingsBgColor() { config.bgColor = document.getElementById('bgColor').value; saveConfig(); applySettings(); }
function saveSettingsCardColor() { config.cardColor = document.getElementById('cardColor').value; saveConfig(); applySettings(); }
function saveSettingsEngine() { config.searchEngine = document.getElementById('searchEngineSelect').value; saveConfig(); }
function saveSettingsSearchMode() { config.searchMode = document.getElementById('searchModeSelect').value; saveConfig(); }
function saveSettingsUrl() { config.background = document.getElementById('bgUrl').value; saveConfig(); applySettings(); }

function saveSettingsFile(input) {
    const f = input.files[0];
    if (!f) return;
    if (f.size > 4e6) return showToast("Too large", "error");

    const reader = new FileReader();
    reader.onload = (e) => {
        try { config.background = e.target.result; saveConfig(); applySettings(); showToast("Done", "success"); } catch (e) { showToast("Too complex", "error"); }
    };
    reader.readAsDataURL(f);
}
