// --- SETTINGS MODULAR UI HELPERS ---

function getAllLinksForSettings() {
    if (window.eveState?.links) return window.eveState.links;
    if (typeof links !== 'undefined') return links;
    return [];
}

function getAllWorkspacesForSettings() {
    const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];
    if (workspaces.length > 0) return workspaces;
    return [{ id: 'main', name: 'Main', icon: 'folder' }];
}

function normalizeBackupSettingsMode(mode) {
    const normalized = String(mode || 'all').toLowerCase();
    const allowed = ['all', 'full', 'workspace', 'card', 'folder', 'bookmark', 'modular', 'layer'];
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
        all: ['full', 'workspace', 'card', 'folder', 'bookmark', 'modular', 'layer'],
        full: ['full'],
        workspace: ['workspace'],
        card: ['card'],
        folder: ['folder'],
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
    const folderSelect = document.getElementById('modularLayerFolderSelect');
    const bookmarkSelect = document.getElementById('modularLayerBookmarkSelect');
    if (!wsSelect || !catSelect || !folderSelect || !bookmarkSelect) return;

    const showWorkspace = scope === 'tab' || scope === 'card' || scope === 'folder' || scope === 'bookmark';
    const showCategory = scope === 'card' || scope === 'folder' || scope === 'bookmark';
    const showFolder = scope === 'folder';
    const showBookmark = scope === 'bookmark';

    wsSelect.style.display = showWorkspace ? 'block' : 'none';
    catSelect.style.display = showCategory ? 'block' : 'none';
    folderSelect.style.display = showFolder ? 'block' : 'none';
    bookmarkSelect.style.display = showBookmark ? 'block' : 'none';
}

function refreshModularLayerSelectors() {
    const wsSelect = document.getElementById('modularLayerWorkspaceSelect');
    const catSelect = document.getElementById('modularLayerCategorySelect');
    const folderSelect = document.getElementById('modularLayerFolderSelect');
    const bookmarkSelect = document.getElementById('modularLayerBookmarkSelect');
    if (!wsSelect || !catSelect || !folderSelect || !bookmarkSelect) return;

    const allLinks = getAllLinksForSettings();
    const workspaces = getAllWorkspacesForSettings();
    const selectedWorkspace = wsSelect.value || config.modularLayerWorkspaceId || config.activeWorkspace || workspaces[0]?.id || 'main';

    wsSelect.innerHTML = '';
    workspaces.forEach((ws) => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name || ws.id;
        wsSelect.appendChild(option);
    });
    wsSelect.value = workspaces.some((ws) => ws.id === selectedWorkspace) ? selectedWorkspace : (workspaces[0]?.id || 'main');

    const categories = [...new Set(
        []
            .concat(
                allLinks
                    .filter((link) => String(link.workspace || 'main') === wsSelect.value)
                    .map((link) => String(link.category || 'Unsorted'))
            )
            .concat(
                typeof window.EveDataTransfer?.getBookmarkFolderScopedKeys === 'function'
                    ? window.EveDataTransfer.getBookmarkFolderScopedKeys()
                        .map((key) => String(key || '').split('::'))
                        .filter((parts) => String(parts[0] || 'main') === String(wsSelect.value || 'main'))
                        .map((parts) => String(parts.slice(1).join('::') || 'Unsorted'))
                    : []
            )
    )].sort((a, b) => a.localeCompare(b));
    const selectedCategory = catSelect.value || config.modularLayerCategoryName || categories[0] || 'Unsorted';
    catSelect.innerHTML = '';
    categories.forEach((category) => {
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
        .filter((link) => String(link.workspace || 'main') === wsSelect.value && String(link.category || 'Unsorted') === selectedCard)
        .slice()
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    const selectedBookmark = bookmarkSelect.value || config.modularLayerBookmarkId || (bookmarks[0] ? String(bookmarks[0].id) : '');
    bookmarkSelect.innerHTML = '';
    bookmarks.forEach((link) => {
        const option = document.createElement('option');
        option.value = String(link.id);
        option.textContent = `${link.title || 'Untitled'}${link.url ? ` - ${link.url}` : ''}`;
        bookmarkSelect.appendChild(option);
    });
    if (bookmarks.length > 0) {
        bookmarkSelect.value = bookmarks.some((link) => String(link.id) === String(selectedBookmark))
            ? String(selectedBookmark)
            : String(bookmarks[0].id);
    }
    if (window.EveDataTransfer?.populateFolderSelect) {
        const selectedFolderId = folderSelect.value || config.modularLayerFolderId || '';
        window.EveDataTransfer.populateFolderSelect(folderSelect, wsSelect.value, selectedCard, selectedFolderId);
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
    folderSelect.onchange = function () {
        config.modularLayerFolderId = folderSelect.value;
        saveConfig();
    };
    bookmarkSelect.onchange = function () {
        config.modularLayerBookmarkId = bookmarkSelect.value;
        saveConfig();
    };

    updateModularLayerSelectionVisibility();
}

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
            showToast('Modular sync requires server mode (localhost or LAN URL)', 'info');
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
    const folderId = String(document.getElementById('modularLayerFolderSelect')?.value || '').trim();
    const bookmarkId = String(document.getElementById('modularLayerBookmarkSelect')?.value || '').trim();
    const layerPath = String(document.getElementById('modularLayerPathInput')?.value || '').trim();
    return { scope, workspaceId, categoryName, folderId, bookmarkId, layerPath };
}
