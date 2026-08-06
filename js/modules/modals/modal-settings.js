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
    // Local Services reads live state off the control plane, so it is refreshed per open rather
    // than rendered once: a service started or stopped since last time must not show as stale.
    window.EveOSConsolePanel?.refresh?.();
    document.getElementById('bgUrl').value = '';
    document.getElementById('timerToggle').checked = config.timerEnabled;
    document.getElementById('weatherToggle').checked = config.weatherEnabled;
    
    // Check for elements existence just in case templates lag
    const scrollCatsCb = document.getElementById('scrollableCats');
    if (scrollCatsCb) scrollCatsCb.checked = !!config.scrollableCategories;
    
    const ultraColCb = document.getElementById('ultraCollapseSidebar');
    if (ultraColCb) ultraColCb.checked = !!config.ultraCollapseSidebar;
    
    const hiddenColCb = document.getElementById('sidebarHidden');
    if (hiddenColCb) hiddenColCb.checked = !!config.sidebarHidden;

    document.getElementById('userName').value = config.userName || '';
    document.getElementById('accentColor').value = config.accent || '#00d4ff';
    document.getElementById('searchEngineSelect').value = config.searchEngine || 'https://www.google.com/search?q=';
    document.getElementById('searchModeSelect').value = config.searchMode || 'basic';
    const bookmarkClickBehaviorSelect = document.getElementById('bookmarkClickBehaviorSelect');
    if (bookmarkClickBehaviorSelect) {
        const clickBehaviorApi = window.EveBookmarkClickBehavior;
        const nextMode = clickBehaviorApi?.getDefaultMode?.()
            || (config.bookmarkClickOpensLink ? 'open_and_focus' : 'focus_only');
        bookmarkClickBehaviorSelect.value = ['focus_only', 'open_and_focus', 'internal_only'].includes(nextMode)
            ? nextMode
            : (nextMode === 'open_only' ? 'open_and_focus' : 'focus_only');
    }

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
    if (typeof refreshGroupBackupList === 'function') refreshGroupBackupList();
    if (typeof refreshCardBackupList === 'function') refreshCardBackupList();
    if (typeof refreshFolderBackupList === 'function') refreshFolderBackupList();
    if (typeof refreshBookmarkBackupList === 'function') refreshBookmarkBackupList();
    if (typeof refreshIntegratedDuplicateSensorControls === 'function') refreshIntegratedDuplicateSensorControls();
    if (typeof renderEditHistoryPanel === 'function') renderEditHistoryPanel();

    refreshModularLayerSelectors();
    refreshModularStorePathFromServer();
    renderSettingsShortcutList();
    if (window.EveBookmarkIdentifiers?.renderSettingsManager) {
        window.EveBookmarkIdentifiers.renderSettingsManager();
    }
    if (typeof applySettingsSectionsCollapsedState === 'function') applySettingsSectionsCollapsedState();
    if (typeof populateNewSettingsInputs === 'function') populateNewSettingsInputs();
    refreshModalThemedControls(document.getElementById('settingsModal'));
}

function saveSettingsTimer() { config.timerEnabled = document.getElementById('timerToggle').checked; saveConfig(); applySettings(); }
function saveSettingsWeather() { config.weatherEnabled = document.getElementById('weatherToggle').checked; saveConfig(); applySettings(); if (typeof fetchWeather === 'function') fetchWeather(); }
function saveSettingsScrollable() { config.scrollableCategories = document.getElementById('scrollableCats').checked; saveConfig(); renderDashboard(); }
function saveSettingsUltraCollapseSidebar() { config.ultraCollapseSidebar = document.getElementById('ultraCollapseSidebar').checked; saveConfig(); if (typeof renderSidebar === 'function') renderSidebar(); }
function saveSettingsSidebarHidden() { config.sidebarHidden = document.getElementById('sidebarHidden').checked; saveConfig(); if (typeof renderSidebar === 'function') renderSidebar(); }
function saveSettingsName() { config.userName = document.getElementById('userName').value; saveConfig(); updateTimeAndGreeting(); }

// --- New preference setters (Phase: settings expansion) -------------------

function saveSettingsShowHiddenSidebarGroups() {
    config.showHiddenSidebarGroups = !!document.getElementById('showHiddenSidebarGroupsToggle')?.checked;
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
}

function saveSettingsShowInactiveTabs() {
    config.showInactiveTabs = !!document.getElementById('showInactiveTabsToggle')?.checked;
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
}

function saveSettingsReducedMotion() {
    config.reducedMotion = !!document.getElementById('reducedMotionToggle')?.checked;
    document.body.classList.toggle('reduced-motion', config.reducedMotion);
    saveConfig();
}

function saveSettingsHydrationMarkerVisibility() {
    if (!config.dashboardHydrationMemory || typeof config.dashboardHydrationMemory !== 'object') {
        config.dashboardHydrationMemory = {};
    }
    config.dashboardHydrationMemory.showCardMarkers = !!document.getElementById('hydrationCardMarkersToggle')?.checked;
    config.dashboardHydrationMemory.showBookmarkMarkers = !!document.getElementById('hydrationBookmarkMarkersToggle')?.checked;
    if (window.EveDashboardHydrationMemory?.setMarkerVisibility) {
        window.EveDashboardHydrationMemory.setMarkerVisibility('card', config.dashboardHydrationMemory.showCardMarkers, { skipSave: true });
        window.EveDashboardHydrationMemory.setMarkerVisibility('bookmark', config.dashboardHydrationMemory.showBookmarkMarkers, { skipSave: true });
    } else {
        document.body.classList.toggle('show-hydration-card-markers', config.dashboardHydrationMemory.showCardMarkers);
        document.body.classList.toggle('show-hydration-bookmark-markers', config.dashboardHydrationMemory.showBookmarkMarkers);
    }
    saveConfig();
}

function saveSettingsTimerDuration() {
    const minutes = Number(document.getElementById('timerDurationMinutes')?.value) || 25;
    const clamped = Math.max(1, Math.min(180, Math.round(minutes)));
    config.timerDurationSeconds = clamped * 60;
    saveConfig();
    window.timerDuration = config.timerDurationSeconds;
    if (typeof timerRunning !== 'undefined' && !timerRunning && typeof timerSeconds !== 'undefined') {
        timerSeconds = window.timerDuration;
        if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
    }
}

function saveSettingsStartupViewMode() {
    const value = String(document.getElementById('startupViewModeSelect')?.value || '').toLowerCase();
    config.startupViewMode = ['grid', 'list', 'unidex'].includes(value) ? value : '';
    saveConfig();
}

function saveSettingsPaginationChunkSize() {
    const raw = Number(document.getElementById('paginationChunkSize')?.value) || 220;
    config.paginationChunkSize = Math.max(20, Math.min(2000, Math.round(raw)));
    saveConfig();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function saveSettingsDefaultAddLinkCategory() {
    config.defaultAddLinkCategory = String(document.getElementById('defaultAddLinkCategorySelect')?.value || '').trim();
    saveConfig();
}

function saveSettingsConfirmBeforeSweep() {
    config.confirmBeforeSweep = !!document.getElementById('confirmBeforeSweepToggle')?.checked;
    saveConfig();
}

function saveSettingsBackupReminderDays() {
    const raw = Number(document.getElementById('backupReminderDays')?.value) || 0;
    config.backupReminderDays = Math.max(0, Math.min(365, Math.round(raw)));
    saveConfig();
}

// Integrations — Google Custom Search keys are stored on the existing
// config.expandedSearch bucket so the Expanded Search modal stays in sync.
function saveSettingsIntegrationsGoogle() {
    if (!config.expandedSearch || typeof config.expandedSearch !== 'object') {
        config.expandedSearch = {};
    }
    config.expandedSearch.apiKey = String(document.getElementById('integrationsGoogleApiKey')?.value || '').trim();
    config.expandedSearch.cx = String(document.getElementById('integrationsGoogleCx')?.value || '').trim();
    saveConfig();
}

// Integrations — bridge ports + CORS proxy + probe timeout. Empty inputs
// reset back to defaults via api-core.refreshBridgeConfig().
function saveSettingsIntegrationsBridges() {
    if (!config.bridges || typeof config.bridges !== 'object') config.bridges = {};
    const readPort = (id) => {
        const raw = String(document.getElementById(id)?.value || '').trim();
        if (!raw) return 0; // 0 = use default in refreshBridgeConfig
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 1 || num > 65535) return 0;
        return Math.round(num);
    };
    const readString = (id) => String(document.getElementById(id)?.value || '').trim();
    config.bridges.serverPort = readPort('integrationsServerPort');
    config.bridges.lightpandaPort = readPort('integrationsLightpandaPort');
    config.bridges.camofoxPort = readPort('integrationsCamofoxPort');
    config.bridges.wikimediaPort = readPort('integrationsWikimediaPort');
    config.bridges.popupPort = readPort('integrationsPopupPort');
    const rawTimeout = String(document.getElementById('integrationsStatusTimeoutMs')?.value || '').trim();
    const timeoutNum = Number(rawTimeout);
    config.bridges.statusTimeoutMs = (rawTimeout && Number.isFinite(timeoutNum) && timeoutNum >= 50 && timeoutNum <= 10000)
        ? Math.round(timeoutNum)
        : 0;
    config.bridges.corsProxyUrl = readString('integrationsCorsProxyUrl');
    config.bridges.codetabsProxyUrl = readString('integrationsCodetabsProxyUrl');
    saveConfig();
    // Hot-apply: rebuild rt.* base URLs without requiring a reload.
    const refresh = window.EveOS?.API?.CoreRuntime?.refreshBridgeConfig;
    if (typeof refresh === 'function') refresh();
}

function populateNewSettingsInputs() {
    const timerMins = Math.max(1, Math.round((Number(config.timerDurationSeconds) || 1500) / 60));
    const timerInput = document.getElementById('timerDurationMinutes');
    if (timerInput) timerInput.value = String(timerMins);

    const viewSelect = document.getElementById('startupViewModeSelect');
    if (viewSelect) viewSelect.value = ['grid', 'list', 'unidex'].includes(String(config.startupViewMode || '').toLowerCase())
        ? config.startupViewMode
        : '';

    const chunkInput = document.getElementById('paginationChunkSize');
    if (chunkInput) chunkInput.value = String(Math.max(20, Math.min(2000, Number(config.paginationChunkSize) || 220)));

    const showHiddenGroupsCb = document.getElementById('showHiddenSidebarGroupsToggle');
    if (showHiddenGroupsCb) showHiddenGroupsCb.checked = !!config.showHiddenSidebarGroups;

    const showInactiveCb = document.getElementById('showInactiveTabsToggle');
    if (showInactiveCb) showInactiveCb.checked = !!config.showInactiveTabs;

    const reducedMotionCb = document.getElementById('reducedMotionToggle');
    if (reducedMotionCb) reducedMotionCb.checked = !!config.reducedMotion;
    document.body.classList.toggle('reduced-motion', !!config.reducedMotion);

    const hydrationMemory = config.dashboardHydrationMemory && typeof config.dashboardHydrationMemory === 'object'
        ? config.dashboardHydrationMemory
        : {};
    const cardMarkerCb = document.getElementById('hydrationCardMarkersToggle');
    if (cardMarkerCb) cardMarkerCb.checked = hydrationMemory.showCardMarkers === true;
    const bookmarkMarkerCb = document.getElementById('hydrationBookmarkMarkersToggle');
    if (bookmarkMarkerCb) bookmarkMarkerCb.checked = hydrationMemory.showBookmarkMarkers === true;

    const confirmSweepCb = document.getElementById('confirmBeforeSweepToggle');
    if (confirmSweepCb) confirmSweepCb.checked = config.confirmBeforeSweep !== false; // default on

    const backupReminder = document.getElementById('backupReminderDays');
    if (backupReminder) backupReminder.value = String(Math.max(0, Math.min(365, Number(config.backupReminderDays) || 0)));

    // Integrations — Google Custom Search
    const exp = (config.expandedSearch && typeof config.expandedSearch === 'object') ? config.expandedSearch : {};
    const googleKey = document.getElementById('integrationsGoogleApiKey');
    if (googleKey) googleKey.value = String(exp.apiKey || '');
    const googleCx = document.getElementById('integrationsGoogleCx');
    if (googleCx) googleCx.value = String(exp.cx || '');

    // Integrations — Local Bridges + Proxies (empty input means "use default")
    const bridges = (config.bridges && typeof config.bridges === 'object') ? config.bridges : {};
    const setBridgeNum = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        const num = Number(value);
        el.value = Number.isFinite(num) && num > 0 ? String(num) : '';
    };
    setBridgeNum('integrationsServerPort', bridges.serverPort);
    setBridgeNum('integrationsLightpandaPort', bridges.lightpandaPort);
    setBridgeNum('integrationsCamofoxPort', bridges.camofoxPort);
    setBridgeNum('integrationsWikimediaPort', bridges.wikimediaPort);
    setBridgeNum('integrationsPopupPort', bridges.popupPort);
    setBridgeNum('integrationsStatusTimeoutMs', bridges.statusTimeoutMs);
    const corsInput = document.getElementById('integrationsCorsProxyUrl');
    if (corsInput) corsInput.value = String(bridges.corsProxyUrl || '');
    const codetabsInput = document.getElementById('integrationsCodetabsProxyUrl');
    if (codetabsInput) codetabsInput.value = String(bridges.codetabsProxyUrl || '');

    // Populate the Add Link default-card select with the active workspace's categories
    const addLinkSelect = document.getElementById('defaultAddLinkCategorySelect');
    if (addLinkSelect) {
        const activeWs = String(config.activeWorkspace || 'main').trim() || 'main';
        const categorySet = new Set();
        (typeof getLiveLinks === 'function' ? getLiveLinks() : []).forEach((link) => {
            if (!link) return;
            if (String(link.workspace || 'main').trim() === activeWs) {
                const name = String(link.category || 'Unsorted').trim() || 'Unsorted';
                if (name) categorySet.add(name);
            }
        });
        const sorted = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
        const current = String(config.defaultAddLinkCategory || '').trim();
        addLinkSelect.innerHTML = '<option value="">First visible card / Unsorted</option>'
            + sorted.map((name) => {
                const safe = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                return `<option value="${safe}"${name === current ? ' selected' : ''}>${safe}</option>`;
            }).join('');
        if (current && !sorted.includes(current)) {
            // Honor a stored value even if the card isn't currently in the active workspace
            const safe = String(current).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            addLinkSelect.insertAdjacentHTML('beforeend', `<option value="${safe}" selected>${safe} (other workspace)</option>`);
        }
    }
}

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
function saveSettingsBookmarkClickBehavior() {
    const select = document.getElementById('bookmarkClickBehaviorSelect');
    const nextMode = String(select?.value || 'focus_only').trim().toLowerCase();
    if (window.EveBookmarkClickBehavior?.setDefaultMode) {
        window.EveBookmarkClickBehavior.setDefaultMode(nextMode);
    } else {
        config.bookmarkClickDefaultMode = nextMode;
        config.bookmarkClickOpensLink = nextMode === 'open_and_focus' || nextMode === 'open_only';
        saveConfig();
    }
}
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
