// --- SETTINGS MODULAR STORE PATH ACTIONS ---

function _isHttpSettingsContext() {
    return /^https?:$/i.test(window.location.protocol || '');
}

async function confirmDataPackOverwrite(actionLabel, detailMessage = '') {
    const action = String(actionLabel || 'This action').trim() || 'This action';
    const detail = String(detailMessage || '').trim();
    const firstMessage = `${action} can overwrite your current bookmarks and library${detail ? ` (${detail})` : ''}. Continue?`;
    const secondMessage = `Final confirmation: ${action}? This can revert your active data pack to a previous state.`;
    if (!(await showConfirm(firstMessage))) return false;
    if (!(await showConfirm(secondMessage))) return false;
    return true;
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
        if (typeof refreshModularLayerPathPreview === 'function') refreshModularLayerPathPreview();
        return;
    }

    const result = await window.EveDataStore.ModularSync.getStorePath();
    if (!result?.ok) {
        input.value = localDraft;
        if (typeof refreshModularLayerPathPreview === 'function') refreshModularLayerPathPreview();
        return;
    }
    input.value = String(result.activePath || '');
    config.modularStateRootPath = String(result.activePath || '');
    saveConfig();
    if (typeof refreshModularLayerPathPreview === 'function') refreshModularLayerPathPreview();
}

async function applyModularStorePath() {
    const pathValue = String(document.getElementById('modularStorePathInput')?.value || '').trim();
    const createIfMissing = !!document.getElementById('modularStoreCreateIfMissing')?.checked;
    const canSetStorePath = _isHttpSettingsContext() && !!window.EveDataStore?.ModularSync?.setStorePath;

    if (!canSetStorePath || !pathValue) {
        return _activateDataPackFolderViaPicker({
            confirmMessage: 'Set selected folder as active data pack? (Overwrites current bookmarks & library)',
            confirmTwice: true,
            finalConfirmMessage: 'Final confirmation: set this folder as active data pack now? This may revert loaded state.'
        });
    }

    const confirmed = await confirmDataPackOverwrite(
        'Set active data-pack folder',
        pathValue
    );
    if (!confirmed) {
        return showToast('Set active folder canceled.', 'info');
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

async function pickModularLayerFolderPath(options = {}) {
    const silentOnCancel = !!options.silentOnCancel;
    const picker = window.EveDataStore?.ModularSync?.pickFolderPath;
    if (!picker) {
        if (!silentOnCancel) showToast('Folder picker requires localhost server mode', 'warning');
        return '';
    }

    const input = document.getElementById('modularLayerPathInput');
    const initialPath = String(input?.value || config.modularLayerPath || '').trim();
    const result = await picker(initialPath);
    if (!result?.ok) {
        if (!silentOnCancel) showToast(result?.error || 'Could not open folder picker', 'error');
        return '';
    }
    if (result.canceled || !result.path) {
        if (!silentOnCancel) showToast('Folder selection canceled', 'info');
        return '';
    }

    if (input) input.value = result.path;
    config.modularLayerPath = result.path;
    saveConfig();
    if (!silentOnCancel) showToast('Folder path set', 'success');
    return result.path;
}
