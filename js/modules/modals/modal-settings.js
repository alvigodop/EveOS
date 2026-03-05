// --- SETTINGS ACTIONS ---
function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

function getRatingSettings() {
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    return window.EveLibrary?.Ratings?.getSettings
        ? window.EveLibrary.Ratings.getSettings(config)
        : {
            activeScale: "hybrid",
            personalWeight: 0.5,
            enabledProviders: { anilist: true, myanimelist: true, mangadex: true },
            providerWeights: { anilist: 1, myanimelist: 1, mangadex: 1 }
        };
}

function loadRatingSettingsInputs() {
    const settings = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect');
    const personalWeight = document.getElementById('ratingPersonalWeight');
    const anilistEnabled = document.getElementById('ratingProviderAniListEnabled');
    const malEnabled = document.getElementById('ratingProviderMALEnabled');
    const mangadexEnabled = document.getElementById('ratingProviderMangaDexEnabled');
    const anilistWeight = document.getElementById('ratingProviderAniListWeight');
    const malWeight = document.getElementById('ratingProviderMALWeight');
    const mangadexWeight = document.getElementById('ratingProviderMangaDexWeight');

    if (scale) scale.value = settings.activeScale || 'hybrid';
    if (personalWeight) personalWeight.value = Math.round((settings.personalWeight ?? 0.5) * 100);
    if (anilistEnabled) anilistEnabled.checked = settings.enabledProviders?.anilist !== false;
    if (malEnabled) malEnabled.checked = settings.enabledProviders?.myanimelist !== false;
    if (mangadexEnabled) mangadexEnabled.checked = settings.enabledProviders?.mangadex !== false;
    if (anilistWeight) anilistWeight.value = settings.providerWeights?.anilist ?? 1;
    if (malWeight) malWeight.value = settings.providerWeights?.myanimelist ?? 1;
    if (mangadexWeight) mangadexWeight.value = settings.providerWeights?.mangadex ?? 1;
}

function saveDerivedRatingSettingsFromInputs() {
    const current = getRatingSettings();
    const scale = document.getElementById('ratingScaleModeSelect')?.value || current.activeScale || 'hybrid';
    const personalWeightPercent = clampNumber(document.getElementById('ratingPersonalWeight')?.value ?? (current.personalWeight * 100), 0, 100);
    const enabledProviders = {
        anilist: !!document.getElementById('ratingProviderAniListEnabled')?.checked,
        myanimelist: !!document.getElementById('ratingProviderMALEnabled')?.checked,
        mangadex: !!document.getElementById('ratingProviderMangaDexEnabled')?.checked
    };
    const providerWeights = {
        anilist: clampNumber(document.getElementById('ratingProviderAniListWeight')?.value ?? current.providerWeights.anilist, 0, 100),
        myanimelist: clampNumber(document.getElementById('ratingProviderMALWeight')?.value ?? current.providerWeights.myanimelist, 0, 100),
        mangadex: clampNumber(document.getElementById('ratingProviderMangaDexWeight')?.value ?? current.providerWeights.mangadex, 0, 100)
    };

    config.ratingSettings = {
        ...current,
        activeScale: scale,
        personalWeight: personalWeightPercent / 100,
        enabledProviders,
        providerWeights
    };
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    saveConfig();
}

function getAllLinksForSettings() {
    if (window.eveState?.links) return window.eveState.links;
    if (typeof links !== 'undefined') return links;
    return [];
}

function getAllWorkspacesForSettings() {
    const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
    if (workspaces.length > 0) return workspaces;
    return [{ id: 'main', name: 'Main', icon: '🏠' }];
}


function normalizeBackupSettingsMode(mode) {
    const normalized = String(mode || 'all').toLowerCase();
    const allowed = ['all', 'full', 'workspace', 'card', 'bookmark', 'modular', 'layer'];
    return allowed.includes(normalized) ? normalized : 'all';
}

function applyBackupSettingsLayout(mode) {
    const normalized = normalizeBackupSettingsMode(mode);
    const select = document.getElementById('backupSettingsMode');
    if (select && select.value !== normalized) {
        select.value = normalized;
    }

    const panels = document.querySelectorAll('#settingsModal [data-backup-panel]');
    if (!panels.length) return;

    const visibleByMode = {
        all: ['full', 'workspace', 'card', 'bookmark', 'modular', 'layer'],
        full: ['full'],
        workspace: ['workspace'],
        card: ['card'],
        bookmark: ['bookmark'],
        modular: ['modular'],
        layer: ['layer']
    };
    const visibleSet = new Set(visibleByMode[normalized] || visibleByMode.all);

    panels.forEach((panel) => {
        const panelKey = panel.getAttribute('data-backup-panel');
        const shouldShow = normalized === 'all' ? true : visibleSet.has(panelKey);
        panel.style.display = shouldShow ? 'block' : 'none';
        panel.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    });
}

function updateModularLayerSelectionVisibility() {
    const scope = document.getElementById('modularLayerScope')?.value || 'store';
    const wsSelect = document.getElementById('modularLayerWorkspaceSelect');
    const catSelect = document.getElementById('modularLayerCategorySelect');
    const bookmarkSelect = document.getElementById('modularLayerBookmarkSelect');
    if (!wsSelect || !catSelect || !bookmarkSelect) return;

    const showWorkspace = scope === 'tab' || scope === 'card' || scope === 'bookmark';
    const showCategory = scope === 'card' || scope === 'bookmark';
    const showBookmark = scope === 'bookmark';

    wsSelect.style.display = showWorkspace ? 'block' : 'none';
    catSelect.style.display = showCategory ? 'block' : 'none';
    bookmarkSelect.style.display = showBookmark ? 'block' : 'none';
}

function refreshModularLayerSelectors() {
    const wsSelect = document.getElementById('modularLayerWorkspaceSelect');
    const catSelect = document.getElementById('modularLayerCategorySelect');
    const bookmarkSelect = document.getElementById('modularLayerBookmarkSelect');
    if (!wsSelect || !catSelect || !bookmarkSelect) return;

    const allLinks = getAllLinksForSettings();
    const workspaces = getAllWorkspacesForSettings();
    const selectedWorkspace = wsSelect.value || config.modularLayerWorkspaceId || config.activeWorkspace || workspaces[0]?.id || 'main';

    wsSelect.innerHTML = '';
    workspaces.forEach(ws => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name || ws.id;
        wsSelect.appendChild(option);
    });
    wsSelect.value = workspaces.some(ws => ws.id === selectedWorkspace) ? selectedWorkspace : (workspaces[0]?.id || 'main');

    const categories = [...new Set(
        allLinks
            .filter(link => String(link.workspace || 'main') === wsSelect.value)
            .map(link => String(link.category || 'Unsorted'))
    )].sort((a, b) => a.localeCompare(b));
    const selectedCategory = catSelect.value || config.modularLayerCategoryName || categories[0] || 'Unsorted';
    catSelect.innerHTML = '';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        catSelect.appendChild(option);
    });
    if (categories.length > 0) {
        catSelect.value = categories.includes(selectedCategory) ? selectedCategory : categories[0];
    }

    const selectedCard = catSelect.value || selectedCategory;
    const bookmarks = allLinks
        .filter(link => String(link.workspace || 'main') === wsSelect.value && String(link.category || 'Unsorted') === selectedCard)
        .slice()
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    const selectedBookmark = bookmarkSelect.value || config.modularLayerBookmarkId || (bookmarks[0] ? String(bookmarks[0].id) : '');
    bookmarkSelect.innerHTML = '';
    bookmarks.forEach(link => {
        const option = document.createElement('option');
        option.value = String(link.id);
        option.textContent = `${link.title || 'Untitled'}${link.url ? ` - ${link.url}` : ''}`;
        bookmarkSelect.appendChild(option);
    });
    if (bookmarks.length > 0) {
        bookmarkSelect.value = bookmarks.some(link => String(link.id) === String(selectedBookmark))
            ? String(selectedBookmark)
            : String(bookmarks[0].id);
    }

    wsSelect.onchange = function () {
        config.modularLayerWorkspaceId = wsSelect.value;
        saveConfig();
        refreshModularLayerSelectors();
    };
    catSelect.onchange = function () {
        config.modularLayerCategoryName = catSelect.value;
        saveConfig();
        refreshModularLayerSelectors();
    };
    bookmarkSelect.onchange = function () {
        config.modularLayerBookmarkId = bookmarkSelect.value;
        saveConfig();
    };

    updateModularLayerSelectionVisibility();
}

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
    document.getElementById('bgUrl').value = "";
    document.getElementById('timerToggle').checked = config.timerEnabled;
    document.getElementById('weatherToggle').checked = config.weatherEnabled;
    document.getElementById('userName').value = config.userName || "";
    document.getElementById('accentColor').value = config.accent || "#00d4ff";
    document.getElementById('searchEngineSelect').value = config.searchEngine || "https://www.google.com/search?q=";
    document.getElementById('searchModeSelect').value = config.searchMode || "basic";
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
    if (modularSyncInterval) modularSyncInterval.value = Math.max(2000, Math.min(60000, Number(config.modularStateSyncIntervalMs || 5000)));
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
    // Theme Settings
    const theme = config.themeMode || 'dark';
    const radios = document.getElementsByName('themeMode');
    for (const r of radios) { r.checked = (r.value === theme); }

    document.getElementById('bgColor').value = config.bgColor || "#222222";
    document.getElementById('cardColor').value = config.cardColor || "#1e1e1e";
    loadRatingSettingsInputs();

    // Set initial state of color inputs
    updateColorInputAvailability();
    if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
    if (typeof refreshCardBackupList === 'function') refreshCardBackupList();
    if (typeof refreshBookmarkBackupList === 'function') refreshBookmarkBackupList();
    refreshModularLayerSelectors();
    refreshModularStorePathFromServer();
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
function saveSettingsBookmarkClickOpen() { config.bookmarkClickOpensLink = !!document.getElementById('bookmarkClickOpenToggle').checked; saveConfig(); }
function saveSettingsBackupMode() {
    const mode = normalizeBackupSettingsMode(document.getElementById('backupSettingsMode')?.value || 'all');
    config.backupSettingsMode = mode;
    saveConfig();
    applyBackupSettingsLayout(mode);
}
function saveSettingsModularSyncEnabled() {
    config.modularStateSyncEnabled = !!document.getElementById('modularSyncToggle')?.checked;
    saveConfig();
    if (window.EveDataStore?.ModularSync?.setEnabled) {
        const applied = window.EveDataStore.ModularSync.setEnabled(config.modularStateSyncEnabled);
        if (applied === false && config.modularStateSyncEnabled) {
            showToast('Modular sync requires server mode (http://localhost)', 'info');
        }
    }
}
function saveSettingsModularSyncInterval() {
    const raw = document.getElementById('modularSyncIntervalMs')?.value;
    const interval = clampNumber(raw, 2000, 60000);
    config.modularStateSyncIntervalMs = interval;
    saveConfig();
    if (window.EveDataStore?.ModularSync?.setIntervalMs) {
        window.EveDataStore.ModularSync.setIntervalMs(interval);
    }
}
function saveSettingsModularSyncConflictStrategy() {
    const value = document.getElementById('modularSyncConflictStrategy')?.value === 'local_wins'
        ? 'local_wins'
        : 'remote_wins';
    config.modularStateConflictStrategy = value;
    saveConfig();
    if (window.EveDataStore?.ModularSync?.setConflictStrategy) {
        window.EveDataStore.ModularSync.setConflictStrategy(value);
    }
}
function saveSettingsModularStorePathDraft() {
    const value = String(document.getElementById('modularStorePathInput')?.value || '').trim();
    config.modularStateRootPath = value;
    saveConfig();
}
function _isHttpSettingsContext() {
    return /^https?:$/i.test(window.location.protocol || '');
}
async function _activateDataPackFolderViaPicker(options = {}) {
    if (typeof window.activateDataPackFolderFromPicker !== 'function') {
        showToast('Folder picker activation is unavailable', 'error');
        return false;
    }

    const result = await window.activateDataPackFolderFromPicker(options);
    if (!result?.ok) {
        if (result?.canceled) {
            showToast('Active data pack selection canceled', 'info');
            return false;
        }
        showToast(result?.error || 'Could not load selected data pack folder', 'error');
        return false;
    }

    const tabs = Number(result?.summary?.tabs || 0);
    const cards = Number(result?.summary?.cards || 0);
    const bookmarks = Number(result?.summary?.bookmarks || 0);
    showToast(`Active data pack loaded (${tabs} tabs, ${cards} cards, ${bookmarks} bookmarks).`, 'success');

    if (options?.reload !== false) {
        location.reload();
    } else {
        if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
        refreshModularLayerSelectors();
    }
    return true;
}
async function refreshModularStorePathFromServer() {
    const input = document.getElementById('modularStorePathInput');
    if (!input) return;
    const localDraft = String(config.modularStateRootPath || '');
    if (!_isHttpSettingsContext() || !window.EveDataStore?.ModularSync?.getStorePath) {
        input.value = localDraft;
        return;
    }

    const result = await window.EveDataStore.ModularSync.getStorePath();
    if (!result?.ok) {
        input.value = localDraft;
        return;
    }
    input.value = String(result.activePath || '');
    config.modularStateRootPath = String(result.activePath || '');
    saveConfig();
}
async function applyModularStorePath() {
    const pathValue = String(document.getElementById('modularStorePathInput')?.value || '').trim();
    const createIfMissing = !!document.getElementById('modularStoreCreateIfMissing')?.checked;
    const canSetStorePath = _isHttpSettingsContext() && !!window.EveDataStore?.ModularSync?.setStorePath;

    if (!canSetStorePath || !pathValue) {
        return _activateDataPackFolderViaPicker({
            confirmMessage: 'Set selected folder as active data pack? (Overwrites current bookmarks & library)'
        });
    }

    const result = await window.EveDataStore.ModularSync.setStorePath(pathValue, {
        createIfMissing,
        bootstrap: true
    });
    if (!result?.ok) {
        return showToast(result?.error || 'Could not set modular store folder', 'error');
    }

    config.modularStateRootPath = String(result.activePath || pathValue || '');
    saveConfig();
    await refreshModularStorePathFromServer();
    refreshModularLayerSelectors();
    showToast('Modular store folder updated', 'success');
}
function saveSettingsModularLayerPathDraft() {
    const value = String(document.getElementById('modularLayerPathInput')?.value || '').trim();
    config.modularLayerPath = value;
    saveConfig();
}
function saveSettingsModularLayerScope() {
    const scope = String(document.getElementById('modularLayerScope')?.value || 'store').toLowerCase();
    config.modularLayerScope = scope;
    saveConfig();
    updateModularLayerSelectionVisibility();
}
function getModularLayerScopeInputs() {
    const scope = String(document.getElementById('modularLayerScope')?.value || 'store').toLowerCase();
    const workspaceId = String(document.getElementById('modularLayerWorkspaceSelect')?.value || '').trim();
    const categoryName = String(document.getElementById('modularLayerCategorySelect')?.value || '').trim();
    const bookmarkId = String(document.getElementById('modularLayerBookmarkSelect')?.value || '').trim();
    const layerPath = String(document.getElementById('modularLayerPathInput')?.value || '').trim();
    return { scope, workspaceId, categoryName, bookmarkId, layerPath };
}
async function backupModularLayerToFolder() {
    if (!window.EveDataStore?.ModularSync?.backupLayer) {
        return showToast('Modular sync module not loaded', 'error');
    }
    const { scope, workspaceId, categoryName, bookmarkId, layerPath } = getModularLayerScopeInputs();
    if ((scope === 'tab' || scope === 'card' || scope === 'bookmark') && !workspaceId) {
        return showToast('Select a workspace for this layer backup', 'warning');
    }
    if ((scope === 'card' || scope === 'bookmark') && !categoryName) {
        return showToast('Select a card for this layer backup', 'warning');
    }
    if (scope === 'bookmark' && !bookmarkId) {
        return showToast('Select a bookmark for this layer backup', 'warning');
    }

    const result = await window.EveDataStore.ModularSync.backupLayer({
        layer: scope,
        workspaceId,
        categoryName,
        bookmarkId,
        destinationPath: layerPath
    });
    if (!result?.ok) {
        return showToast(result?.error || 'Layer backup failed', 'error');
    }

    if (result.destinationPath) {
        const input = document.getElementById('modularLayerPathInput');
        if (input) input.value = result.destinationPath;
        config.modularLayerPath = result.destinationPath;
        saveConfig();
    }
    showToast('Layer folder backup created', 'success');
}
async function importModularLayerFromFolder() {
    if (!window.EveDataStore?.ModularSync?.importLayer) {
        return showToast('Modular sync module not loaded', 'error');
    }
    const { scope, workspaceId, categoryName, bookmarkId, layerPath } = getModularLayerScopeInputs();
    if (!layerPath) {
        return showToast('Enter a source folder path to import from', 'warning');
    }
    if ((scope === 'tab' || scope === 'card' || scope === 'bookmark') && !workspaceId) {
        return showToast('Select a workspace for this layer import', 'warning');
    }
    if ((scope === 'card' || scope === 'bookmark') && !categoryName) {
        return showToast('Select a card for this layer import', 'warning');
    }
    if (scope === 'bookmark' && !bookmarkId) {
        return showToast('Select a bookmark for this layer import', 'warning');
    }

    const result = await window.EveDataStore.ModularSync.importLayer({
        layer: scope,
        workspaceId,
        categoryName,
        bookmarkId,
        sourcePath: layerPath
    });
    if (!result?.ok) {
        return showToast(result?.error || 'Layer import failed', 'error');
    }

    config.modularLayerPath = layerPath;
    saveConfig();
    refreshModularLayerSelectors();
    if (typeof refreshWorkspaceBackupList === 'function') refreshWorkspaceBackupList();
    showToast('Layer folder imported into active modular store', 'success');
}
async function syncModularStateNow() {
    if (!window.EveDataStore?.ModularSync?.syncNow) {
        return showToast('Modular sync module not loaded', 'error');
    }
    const ok = await window.EveDataStore.ModularSync.syncNow(true);
    showToast(
        ok ? 'Modular store saved' : 'Could not save modular store (server mode required)',
        ok ? 'success' : 'error'
    );
}
async function pullModularStateNow() {
    if (_isHttpSettingsContext() && window.EveDataStore?.ModularSync?.pullNow) {
        const ok = await window.EveDataStore.ModularSync.pullNow(true);
        showToast(
            ok ? 'Loaded modular state' : 'No modular changes to load',
            ok ? 'success' : 'info'
        );
        return;
    }

    await _activateDataPackFolderViaPicker({
        confirmMessage: 'Load selected data-pack folder as active data? (Overwrites current bookmarks & library)'
    });
}
async function normalizeModularBookmarkTitles() {
    if (!window.EveDataStore?.ModularSync?.normalizeBookmarkFilenames) {
        return showToast('Modular sync module not loaded', 'error');
    }
    const result = await window.EveDataStore.ModularSync.normalizeBookmarkFilenames();
    if (!result?.ok) {
        return showToast(result?.error || 'Could not normalize bookmark filenames', 'error');
    }
    showToast('Bookmark filenames normalized from id + title', 'success');
}

function _extractBookmarkPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.bookmark && typeof payload.bookmark === 'object') return payload.bookmark;
    return payload;
}

function _sanitizeBrowserFilenameSegment(value, fallback) {
    const cleaned = String(value || '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim();
    return cleaned || fallback;
}

function _cleanBrowserNameSegment(value, fallback, maxLength) {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    text = _sanitizeBrowserFilenameSegment(text, fallback);
    if (text.length > maxLength) {
        text = text.slice(0, maxLength).replace(/[ .\-_]+$/g, '');
    }
    return text || fallback;
}

function _buildBrowserBookmarkFilename(bookmark, categoryName = '') {
    const safeBookmark = bookmark || {};
    const linkPart = _cleanBrowserNameSegment(safeBookmark.id || 'bookmark', 'bookmark', 40);
    const cardPart = _cleanBrowserNameSegment(categoryName || 'uncategorized', 'uncategorized', 60);
    const titlePart = _cleanBrowserNameSegment(safeBookmark.title || 'untitled', 'untitled', 80);
    return _sanitizeBrowserFilenameSegment(`${linkPart}--${cardPart}--${titlePart}.json`, `${linkPart}.json`);
}

function _shortHashText(input) {
    const text = String(input || '');
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).slice(0, 8) || 'copy';
}

async function _readJsonFromFileHandle(fileHandle) {
    const file = await fileHandle.getFile();
    const text = await file.text();
    return { text, json: JSON.parse(text) };
}

async function _fileHandleExists(directoryHandle, fileName) {
    try {
        await directoryHandle.getFileHandle(fileName);
        return true;
    } catch {
        return false;
    }
}

async function _readBookmarkIdFromHandle(fileHandle) {
    try {
        const { json } = await _readJsonFromFileHandle(fileHandle);
        const bookmark = _extractBookmarkPayload(json);
        return String(bookmark?.id || '').trim();
    } catch {
        return '';
    }
}

function _buildLiveBookmarkMap() {
    const map = new Map();
    const liveLinks = Array.isArray(window.eveState?.links)
        ? window.eveState.links
        : (Array.isArray(window.links) ? window.links : []);
    liveLinks.forEach((link) => {
        const id = String(link?.id || '').trim();
        if (!id) return;
        map.set(id, { ...link });
    });
    return map;
}

function _applyLiveBookmarkToPayload(json, fallbackBookmark, liveBookmark, bookmarkId) {
    if (!liveBookmark || typeof liveBookmark !== 'object') {
        return {
            nextJson: json,
            effectiveBookmark: fallbackBookmark,
            contentChanged: false
        };
    }

    const mergedBookmark = {
        ...(fallbackBookmark || {}),
        ...liveBookmark,
        id: bookmarkId
    };

    if (json && typeof json === 'object' && json.bookmark && typeof json.bookmark === 'object') {
        const currentText = JSON.stringify(json.bookmark || {});
        const nextText = JSON.stringify(mergedBookmark);
        if (currentText === nextText) {
            return { nextJson: json, effectiveBookmark: mergedBookmark, contentChanged: false };
        }
        return {
            nextJson: { ...json, bookmark: mergedBookmark },
            effectiveBookmark: mergedBookmark,
            contentChanged: true
        };
    }

    const currentText = JSON.stringify(json || {});
    const nextText = JSON.stringify(mergedBookmark);
    return {
        nextJson: mergedBookmark,
        effectiveBookmark: mergedBookmark,
        contentChanged: currentText !== nextText
    };
}

async function _pickUniqueBookmarkName(directoryHandle, desiredName, currentName, bookmarkId) {
    if (desiredName === currentName) return desiredName;

    const exists = await _fileHandleExists(directoryHandle, desiredName);
    if (!exists) return desiredName;

    const existingHandle = await directoryHandle.getFileHandle(desiredName);
    const existingBookmarkId = await _readBookmarkIdFromHandle(existingHandle);
    if (existingBookmarkId && bookmarkId && existingBookmarkId === bookmarkId) {
        return desiredName;
    }

    const stem = desiredName.endsWith('.json') ? desiredName.slice(0, -5) : desiredName;
    const baseHash = _shortHashText(`${currentName}:${bookmarkId}:${Date.now()}`);
    let index = 0;
    while (index < 500) {
        const suffix = index === 0 ? baseHash : `${baseHash}-${index}`;
        const candidate = `${stem}--${suffix}.json`;
        if (!(await _fileHandleExists(directoryHandle, candidate))) {
            return candidate;
        }
        index += 1;
    }
    throw new Error(`Could not find unique filename for ${desiredName}`);
}

async function _normalizeBookmarkFilesInDirectory(directoryHandle, stats, options = {}) {
    const liveBookmarkMap = options.liveBookmarkMap instanceof Map ? options.liveBookmarkMap : new Map();
    // Skip non-bookmark control files in modular folders.
    const blockedFileNames = new Set([
        'store.json',
        'config.json',
        'tab.json',
        'card.json',
        '_library-unlinked.json'
    ]);

    for await (const [entryName, entryHandle] of directoryHandle.entries()) {
        if (entryHandle.kind === 'directory') {
            await _normalizeBookmarkFilesInDirectory(entryHandle, stats, options);
            continue;
        }

        const lowerName = String(entryName || '').toLowerCase();
        if (!lowerName.endsWith('.json')) {
            continue;
        }
        if (blockedFileNames.has(lowerName) || lowerName.startsWith('_')) {
            continue;
        }

        stats.scanned += 1;
        try {
            const { json } = await _readJsonFromFileHandle(entryHandle);
            const bookmark = _extractBookmarkPayload(json);
            const bookmarkId = String(bookmark?.id || '').trim();
            if (!bookmarkId) {
                stats.skipped += 1;
                continue;
            }

            const liveBookmark = liveBookmarkMap.get(bookmarkId) || null;
            const payloadUpdate = _applyLiveBookmarkToPayload(json, bookmark, liveBookmark, bookmarkId);
            const effectiveBookmark = payloadUpdate.effectiveBookmark || bookmark;
            const categoryName = String(effectiveBookmark?.category || 'uncategorized').trim() || 'uncategorized';
            let targetName = _buildBrowserBookmarkFilename(effectiveBookmark, categoryName);
            const contentChanged = !!payloadUpdate.contentChanged;
            const outputText = contentChanged
                ? JSON.stringify(payloadUpdate.nextJson, null, 2)
                : JSON.stringify(json, null, 2);

            targetName = await _pickUniqueBookmarkName(directoryHandle, targetName, entryName, bookmarkId);
            if (targetName === entryName && !contentChanged) {
                stats.unchanged += 1;
                continue;
            }

            if (targetName === entryName && contentChanged) {
                const writableCurrent = await entryHandle.createWritable();
                await writableCurrent.write(outputText);
                await writableCurrent.close();
                stats.contentUpdated += 1;
                continue;
            }

            const maybeTargetHandle = await _fileHandleExists(directoryHandle, targetName)
                ? await directoryHandle.getFileHandle(targetName)
                : null;
            if (maybeTargetHandle) {
                const targetBookmarkId = await _readBookmarkIdFromHandle(maybeTargetHandle);
                if (targetBookmarkId && targetBookmarkId === bookmarkId) {
                    await directoryHandle.removeEntry(entryName);
                    stats.removed += 1;
                    continue;
                }
            }

            const newHandle = await directoryHandle.getFileHandle(targetName, { create: true });
            const writable = await newHandle.createWritable();
            await writable.write(outputText);
            await writable.close();
            await directoryHandle.removeEntry(entryName);
            stats.renamed += 1;
            if (contentChanged) {
                stats.contentUpdated += 1;
            }
        } catch (error) {
            stats.errors += 1;
            console.warn('[Settings] Browser bookmark filename normalize failed for', entryName, error);
        }
    }
}

async function normalizeBookmarkTitlesBrowserOnly() {
    if (typeof window.showDirectoryPicker !== 'function') {
        return showToast('Browser folder normalization needs Chrome/Edge Directory Picker support', 'error');
    }
    try {
        const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (!directoryHandle || typeof directoryHandle.removeEntry !== 'function') {
            return showToast('Selected folder is not writable in this browser', 'error');
        }

        const stats = {
            scanned: 0,
            renamed: 0,
            removed: 0,
            contentUpdated: 0,
            unchanged: 0,
            skipped: 0,
            errors: 0
        };
        const liveBookmarkMap = _buildLiveBookmarkMap();

        await _normalizeBookmarkFilesInDirectory(directoryHandle, stats, { liveBookmarkMap });
        if (stats.scanned === 0) {
            return showToast('No bookmark JSON files found in selected folder', 'info');
        }

        const summary = `Normalized bookmarks: ${stats.renamed} renamed, ${stats.contentUpdated} content synced, ${stats.removed} duplicates removed, ${stats.unchanged} unchanged`;
        if (stats.errors > 0) {
            showToast(`${summary} (${stats.errors} errors)`, 'warning');
        } else {
            showToast(summary, 'success');
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            return showToast('Folder normalization canceled', 'info');
        }
        showToast(`Folder normalization failed: ${error.message || error}`, 'error');
    }
}
async function sendModularStateToGemini() {
    const modeSelect = document.getElementById('modularGeminiMode');
    const mode = modeSelect?.value === 'full' ? 'full' : 'summary';
    config.modularGeminiMode = mode;
    saveConfig();

    if (!window.EveDataStore?.ModularSync?.sendContextToGemini) {
        return showToast('Modular Gemini bridge not loaded', 'error');
    }
    const result = await window.EveDataStore.ModularSync.sendContextToGemini(mode, 30);
    if (!result?.ok) {
        return showToast(result?.error || 'Could not send modular context to Gemini', 'error');
    }
    if (result.sent) {
        return showToast(`Sent ${mode} modular context to Gemini`, 'success');
    }
    if (result.copied) {
        return showToast('Gemini context copied to clipboard (send manually)', 'info');
    }
    showToast('Gemini context prepared', 'info');
}
function saveSettingsUrl() { config.background = document.getElementById('bgUrl').value; saveConfig(); applySettings(); }
function saveRatingSettingsScale() { saveDerivedRatingSettingsFromInputs(); }
function saveRatingSettingsPersonalWeight() { saveDerivedRatingSettingsFromInputs(); }
function saveRatingProviderSettings() { saveDerivedRatingSettingsFromInputs(); }

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
