// --- SETTINGS MODULAR STORE WORKFLOW ACTIONS ---

async function backupModularLayerToFolder() {
    if (!window.EveDataStore?.ModularSync?.backupLayer) {
        return showToast('Modular sync module not loaded', 'error');
    }
    let { scope, workspaceId, categoryName, bookmarkId, layerPath } = getModularLayerScopeInputs();
    const hasServerPicker = !!window.EveDataStore?.ModularSync?.pickFolderPath;
    if (hasServerPicker) {
        layerPath = await pickModularLayerFolderPath({ silentOnCancel: true });
        if (!layerPath) {
            return showToast('Backup canceled: folder not selected.', 'info');
        }
    } else if (!layerPath) {
        return showToast('Set Folder Path in Copy Between Packs (Advanced) before running server folder backups.', 'warning');
    }
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

    const input = document.getElementById('modularLayerPathInput');
    if (input) input.value = layerPath;
    config.modularLayerPath = layerPath;
    saveConfig();
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
    const confirmed = await confirmDataPackOverwrite('Save UI state to active modular store');
    if (!confirmed) {
        return showToast('Save to modular store canceled.', 'info');
    }
    const ok = await window.EveDataStore.ModularSync.syncNow(true);
    showToast(
        ok ? 'Modular store saved' : 'Could not save modular store (check server mode/path)',
        ok ? 'success' : 'error'
    );
}

async function pullModularStateNow() {
    if (_isHttpSettingsContext() && window.EveDataStore?.ModularSync?.pullNow) {
        const confirmed = await confirmDataPackOverwrite('Load from active modular store');
        if (!confirmed) {
            return showToast('Load from modular store canceled.', 'info');
        }
        const ok = await window.EveDataStore.ModularSync.pullNow(true);
        showToast(
            ok ? 'Loaded modular state' : 'No modular changes to load',
            ok ? 'success' : 'info'
        );
        return;
    }

    await _activateDataPackFolderViaPicker({
        confirmMessage: 'Load selected data-pack folder as active data? (Overwrites current bookmarks & library)',
        confirmTwice: true,
        finalConfirmMessage: 'Final confirmation: load this selected data-pack now? This may revert loaded state.'
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
