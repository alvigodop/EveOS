// --- SETTINGS ACTIONS ---
function ensureSettingsOutsideClickCloseBinding() {
    const settingsOverlay = document.getElementById('settingsModal');
    if (!settingsOverlay || settingsOverlay.dataset.outsideCloseBound === '1') return;
    settingsOverlay.dataset.outsideCloseBound = '1';
    settingsOverlay.addEventListener('mousedown', (event) => {
        if (event.target === settingsOverlay) {
            closeModals();
        }
    });
}

function openSettings() {
    ensureSettingsOutsideClickCloseBinding();
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('bgUrl').value = '';
    document.getElementById('timerToggle').checked = config.timerEnabled;
    document.getElementById('weatherToggle').checked = config.weatherEnabled;
    document.getElementById('userName').value = config.userName || '';
    document.getElementById('accentColor').value = config.accent || '#00d4ff';
    document.getElementById('searchEngineSelect').value = config.searchEngine || 'https://www.google.com/search?q=';
    document.getElementById('searchModeSelect').value = config.searchMode || 'basic';
    document.getElementById('bookmarkClickOpenToggle').checked = !!config.bookmarkClickOpensLink;

    const backupModeSelect = document.getElementById('backupSettingsMode');
    if (backupModeSelect) {
        const mode = normalizeBackupSettingsMode(config.backupSettingsMode || 'all');
        backupModeSelect.value = mode;
        applyBackupSettingsLayout(mode);
    }

    const modularSyncToggle = document.getElementById('modularSyncToggle');
    if (modularSyncToggle) modularSyncToggle.checked = config.modularStateSyncEnabled !== false;

    const modularSyncInterval = document.getElementById('modularSyncIntervalMs');
    if (modularSyncInterval) {
        modularSyncInterval.value = Math.max(2000, Math.min(60000, Number(config.modularStateSyncIntervalMs || 5000)));
    }

    const modularConflict = document.getElementById('modularSyncConflictStrategy');
    if (modularConflict) {
        const strategy = String(config.modularStateConflictStrategy || 'remote_wins').toLowerCase();
        modularConflict.value = strategy === 'local_wins' ? 'local_wins' : 'remote_wins';
    }

    const modularStorePathInput = document.getElementById('modularStorePathInput');
    if (modularStorePathInput) modularStorePathInput.value = String(config.modularStateRootPath || '');

    const modularLayerScope = document.getElementById('modularLayerScope');
    if (modularLayerScope) modularLayerScope.value = String(config.modularLayerScope || 'store').toLowerCase();

    const modularLayerPathInput = document.getElementById('modularLayerPathInput');
    if (modularLayerPathInput) modularLayerPathInput.value = String(config.modularLayerPath || '');

    const theme = config.themeMode || 'dark';
    const radios = document.getElementsByName('themeMode');
    for (const radio of radios) {
        radio.checked = radio.value === theme;
    }

    document.getElementById('bgColor').value = config.bgColor || '#222222';
    document.getElementById('cardColor').value = config.cardColor || '#1e1e1e';
    loadRatingSettingsInputs();
    updateColorInputAvailability();

    if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
    if (typeof refreshCardBackupList === 'function') refreshCardBackupList();
    if (typeof refreshFolderBackupList === 'function') refreshFolderBackupList();
    if (typeof refreshBookmarkBackupList === 'function') refreshBookmarkBackupList();
    if (typeof refreshDuplicateSensorControls === 'function') refreshDuplicateSensorControls();

    refreshModularLayerSelectors();
    refreshModularStorePathFromServer();
}

function saveSettingsTimer() { config.timerEnabled = document.getElementById('timerToggle').checked; saveConfig(); applySettings(); }
function saveSettingsWeather() { config.weatherEnabled = document.getElementById('weatherToggle').checked; saveConfig(); applySettings(); if (typeof fetchWeather === 'function') fetchWeather(); }
function saveSettingsScrollable() { config.scrollableCategories = document.getElementById('scrollableCats').checked; saveConfig(); renderDashboard(); }
function saveSettingsName() { config.userName = document.getElementById('userName').value; saveConfig(); updateTimeAndGreeting(); }

function updateColorInputAvailability() {
    const isCustom = config.themeMode === 'custom';
    const area = document.getElementById('customColorsArea');
    if (!area) return;
    area.style.opacity = isCustom ? '1' : '0.5';
    area.style.pointerEvents = isCustom ? 'auto' : 'none';
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
function saveSettingsBookmarkClickOpen() { config.bookmarkClickOpensLink = !!document.getElementById('bookmarkClickOpenToggle').checked; saveConfig(); }
function saveSettingsUrl() { config.background = document.getElementById('bgUrl').value; saveConfig(); applySettings(); }

function saveSettingsFile(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 4e6) return showToast('Too large', 'error');

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            config.background = event.target.result;
            saveConfig();
            applySettings();
            showToast('Done', 'success');
        } catch (error) {
            showToast('Too complex', 'error');
        }
    };
    reader.readAsDataURL(file);
}
