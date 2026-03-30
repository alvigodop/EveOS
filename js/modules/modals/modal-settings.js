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

function refreshModalThemedControls(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const docStyles = getComputedStyle(document.documentElement);
    const inputBg = (docStyles.getPropertyValue('--input-bg') || '#2c2c2c').trim();
    const textMain = (docStyles.getPropertyValue('--text-main') || '#e0e0e0').trim();
    const scheme = String(document.documentElement.dataset.nativeScheme || document.documentElement.style.colorScheme || 'dark').toLowerCase() === 'light'
        ? 'light'
        : 'dark';
    const borderColor = scheme === 'light' ? '#ccc' : 'rgba(128, 128, 128, 0.35)';

    scope.querySelectorAll('.modal input, .modal select, .modal textarea').forEach((field) => {
        field.style.setProperty('background-color', inputBg, 'important');
        field.style.setProperty('color', textMain, 'important');
        field.style.setProperty('border', `1px solid ${borderColor}`, 'important');
        field.style.setProperty('box-shadow', 'none', 'important');

        if (field.tagName === 'SELECT') {
            field.style.setProperty('appearance', 'none', 'important');
            field.style.setProperty('-webkit-appearance', 'none', 'important');
            field.style.setProperty('-moz-appearance', 'none', 'important');
            field.style.setProperty('color-scheme', scheme, 'important');
            field.style.setProperty('padding-right', '34px', 'important');
            field.style.setProperty('background-image', 'linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)', 'important');
            field.style.setProperty('background-position', 'calc(100% - 16px) calc(50% - 1px), calc(100% - 11px) calc(50% - 1px)', 'important');
            field.style.setProperty('background-size', '6px 6px, 6px 6px', 'important');
            field.style.setProperty('background-repeat', 'no-repeat', 'important');
        }
    });

    scope.querySelectorAll('.modal option').forEach((option) => {
        option.style.setProperty('background-color', inputBg, 'important');
        option.style.setProperty('color', textMain, 'important');
        option.style.setProperty('color-scheme', scheme, 'important');
    });
}

function getSiteKeyboardShortcuts() {
    const registered = window.EveKeyboardShortcuts?.list;
    if (Array.isArray(registered) && registered.length) {
        return registered;
    }
    return [
        { keys: '/', description: 'Focus the main search field', scope: 'Global' },
        { keys: 'Shift+Enter', description: 'Open Expanded search mode for the current query', scope: 'Search field' },
        { keys: 'N', description: 'Open the Add Link modal', scope: 'Global' },
        { keys: 'Alt+B', description: 'Toggle Select mode', scope: 'Global' },
        { keys: 'Escape', description: 'Close open modals and menus, clear search focus, and exit Select mode', scope: 'Global' }
    ];
}

function renderSettingsShortcutList() {
    const container = document.getElementById('settingsShortcutList');
    if (!container) return;

    container.innerHTML = getSiteKeyboardShortcuts().map((shortcut) => `
        <div style="display:grid; grid-template-columns:minmax(110px, auto) 1fr auto; gap:10px; align-items:start; padding:8px 10px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; background:rgba(255,255,255,0.03);">
            <code style="font-size:0.85rem; color:var(--accent); white-space:nowrap;">${shortcut.keys}</code>
            <span style="font-size:0.9rem;">${shortcut.description}</span>
            <span style="font-size:0.75rem; opacity:0.7; white-space:nowrap;">${shortcut.scope || 'Global'}</span>
        </div>
    `).join('');
}

function openSettings() {
    ensureSettingsOutsideClickCloseBinding();
    document.getElementById('settingsModal').style.display = 'flex';
    const mapOverlay = document.getElementById('constellation-map-overlay');
    if (mapOverlay && mapOverlay.style.display !== 'none') {
        document.getElementById('settingsModal').style.zIndex = '10020';
    }
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
    document.getElementById('popupColor').value = config.popupColor || '#1e1e1e';
    loadRatingSettingsInputs();
    updateColorInputAvailability();

    if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
    if (typeof refreshCardBackupList === 'function') refreshCardBackupList();
    if (typeof refreshFolderBackupList === 'function') refreshFolderBackupList();
    if (typeof refreshBookmarkBackupList === 'function') refreshBookmarkBackupList();
    if (typeof refreshIntegratedDuplicateSensorControls === 'function') refreshIntegratedDuplicateSensorControls();

    refreshModularLayerSelectors();
    refreshModularStorePathFromServer();
    renderSettingsShortcutList();
    if (window.EveBookmarkIdentifiers?.renderSettingsManager) {
        window.EveBookmarkIdentifiers.renderSettingsManager();
    }
    refreshModalThemedControls(document.getElementById('settingsModal'));
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
    refreshModalThemedControls(document.getElementById('settingsModal'));
}

function saveSettingsAccent() { config.accent = document.getElementById('accentColor').value; saveConfig(); applySettings(); }
function saveSettingsBgColor() { config.bgColor = document.getElementById('bgColor').value; saveConfig(); applySettings(); }
function saveSettingsCardColor() { config.cardColor = document.getElementById('cardColor').value; saveConfig(); applySettings(); }
function saveSettingsPopupColor() { config.popupColor = document.getElementById('popupColor').value; saveConfig(); applySettings(); }
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

window.refreshModalThemedControls = refreshModalThemedControls;
window.renderSettingsShortcutList = renderSettingsShortcutList;
