// --- Data Transfer Import Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importActionsReady) return;
    if (!ns.sharedReady || !ns.importReady) {
        console.warn('[DataTransfer] Import helpers missing; import actions not initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getFolderWorkspaceSelect = ns.getFolderWorkspaceSelect;
    const getFolderCategorySelect = ns.getFolderCategorySelect;
    const getFolderSelect = ns.getFolderSelect;
    const remapWorkspaceStateForRestore = ns.remapWorkspaceStateForRestore;
    const remapCardStateForRestore = ns.remapCardStateForRestore;
    const remapFolderStateForRestore = ns.remapFolderStateForRestore;

    function resetFileInput(input) {
        if (!input) return;
        input.value = '';
    }

    function setLegacyLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') {
            window.setLiveLinks(nextLinks);
            return;
        }
        if (window.eveState) window.eveState.links = nextLinks;
        if (typeof links !== 'undefined') {
            links = nextLinks;
        } else {
            window.links = nextLinks;
        }
    }

    function setLegacyConfig(nextConfig) {
        if (typeof config !== 'undefined') {
            config = nextConfig;
        } else {
            window.config = nextConfig;
        }
    }

    async function processImportFile(file, input) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = ns.robustParseJson(e.target.result);
                const dataStore = getDataStore();

                if (json.metadata && json.bookmarks && json.library) {
                    if (!dataStore?.applyState) {
                        showToast('Unified backup support is unavailable right now.', 'error');
                        return;
                    }
                    if (await showConfirm('Restore Unified Backup? (Overwrites bookmarks & library)')) {
                        const applied = dataStore.applyState(json);
                        if (!applied) {
                            showToast('Unified backup could not be applied.', 'error');
                            return;
                        }
                        showToast('Unified Backup Restored! Saving...', 'success');
                        const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                            ? await ns.persistAndReloadAfterRestore()
                            : { ok: true };
                        if (persisted?.ok === false) {
                            showToast(`Unified backup saved in memory but failed to persist: ${persisted.error || 'unknown error'}`, 'error');
                        }
                    }
                } else if (json.links && !json.config) {
                    if (await showConfirm('Restore Organized Backup? (Overwrites Everything)')) {
                        setLegacyLinks(json.links);
                        if (json.date) console.log('Backup Date:', json.date);
                        showToast('Organized Backup Restored! Saving...', 'success');
                        const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                            ? await ns.persistAndReloadAfterRestore()
                            : { ok: true };
                        if (persisted?.ok === false) {
                            showToast(`Organized backup saved in memory but failed to persist: ${persisted.error || 'unknown error'}`, 'error');
                        }
                    }
                } else if (json.links && json.config) {
                    if (await showConfirm('Restore Full Backup? (Overwrites Settings & Workspaces)')) {
                        setLegacyLinks(json.links);
                        setLegacyConfig(json.config);
                        showToast('Full Backup Restored! Saving...', 'success');
                        const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                            ? await ns.persistAndReloadAfterRestore()
                            : { ok: true };
                        if (persisted?.ok === false) {
                            showToast(`Full backup saved in memory but failed to persist: ${persisted.error || 'unknown error'}`, 'error');
                        }
                    }
                } else if (Array.isArray(json)) {
                    setLegacyLinks(json);
                    showToast('Backup Restored! Saving...', 'success');
                    const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                        ? await ns.persistAndReloadAfterRestore()
                        : { ok: true };
                    if (persisted?.ok === false) {
                        showToast(`Backup saved in memory but failed to persist: ${persisted.error || 'unknown error'}`, 'error');
                    }
                } else if (json.children || json.title) {
                    showToast('Importing bookmarks structure...', 'info');
                } else {
                    showToast('Invalid Backup File', 'error');
                }
            } catch (err) {
                showToast('Error importing: ' + err.message, 'error');
            } finally {
                resetFileInput(input);
            }
        };
        reader.readAsText(file);
    }

    function bindImportInput(input) {
        if (!input || input.dataset.eveImportBound === '1') return;
        input.dataset.eveImportBound = '1';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            processImportFile(file, input);
        });
    }

    window.importData = function (inputOrEvent) {
        const fromEvent = inputOrEvent?.target instanceof HTMLInputElement ? inputOrEvent.target : null;
        const input = inputOrEvent instanceof HTMLInputElement
            ? inputOrEvent
            : fromEvent;

        if (input?.files?.length) {
            processImportFile(input.files[0], input);
            return;
        }

        if (input) {
            bindImportInput(input);
            return;
        }

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json';
        bindImportInput(picker);
        picker.click();
    };

    window.importWorkspaceBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = ns.robustParseJson(e.target.result);
                const appConfig = getAppConfig();
                const selectedWorkspaceId = String(
                    getWorkspaceSelect?.()?.value
                    || appConfig.activeWorkspace
                    || json?.metadata?.workspaceId
                    || ''
                ).trim() || 'main';
                const remappedState = typeof remapWorkspaceStateForRestore === 'function'
                    ? remapWorkspaceStateForRestore(json, selectedWorkspaceId)
                    : json;
                const isWorkspace = remappedState?.metadata?.type === 'workspace';
                const success = isWorkspace && dataStore ? dataStore.applyWorkspaceState(remappedState) : false;
                if (success) {
                    resetFileInput(inputElement);
                    showToast('Workspace restored! Saving...', 'success');
                    const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                        ? await ns.persistAndReloadAfterRestore()
                        : { ok: true };
                    if (persisted?.ok === false) {
                        return showToast(`Workspace restore persisted locally failed: ${persisted.error || 'unknown error'}`, 'error');
                    }
                    return;
                }
                showToast('Invalid workspace backup', 'error');
            } catch (err) {
                showToast('Error importing workspace: ' + err.message, 'error');
            } finally {
                resetFileInput(inputElement);
            }
        };
        reader.readAsText(file);
    };

    window.importCardBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = ns.robustParseJson(e.target.result);
                const appConfig = getAppConfig();
                const selectedWorkspaceId = String(
                    getCardWorkspaceSelect?.()?.value
                    || appConfig.activeWorkspace
                    || json?.metadata?.workspaceId
                    || ''
                ).trim() || 'main';
                const selectedCategoryName = String(getCardCategorySelect?.()?.value || '').trim();
                const remappedState = typeof remapCardStateForRestore === 'function'
                    ? remapCardStateForRestore(json, {
                        workspaceId: selectedWorkspaceId,
                        categoryName: selectedCategoryName,
                        createUniqueCategory: true
                    })
                    : json;
                const isCard = remappedState?.metadata?.type === 'card';
                const success = isCard && dataStore?.applyCardState ? dataStore.applyCardState(remappedState) : false;
                if (success) {
                    resetFileInput(inputElement);
                    showToast('Card restored! Saving...', 'success');
                    const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                        ? await ns.persistAndReloadAfterRestore({
                            reloadUrl: window.location.pathname + '?ws=' + encodeURIComponent(remappedState?.metadata?.workspaceId || selectedWorkspaceId)
                        })
                        : { ok: true };
                    if (persisted?.ok === false) {
                        return showToast(`Card restore persisted locally failed: ${persisted.error || 'unknown error'}`, 'error');
                    }
                    return;
                }
                showToast('Invalid card backup', 'error');
            } catch (err) {
                showToast('Error importing card: ' + err.message, 'error');
            } finally {
                resetFileInput(inputElement);
            }
        };
        reader.readAsText(file);
    };

    window.importBookmarkBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = ns.robustParseJson(e.target.result);
                const isBookmark = json.metadata?.type === 'bookmark';
                const success = isBookmark && dataStore?.applyBookmarkState ? dataStore.applyBookmarkState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    showToast('Bookmark restored! Saving...', 'success');
                    const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                        ? await ns.persistAndReloadAfterRestore()
                        : { ok: true };
                    if (persisted?.ok === false) {
                        return showToast(`Bookmark restore persisted locally failed: ${persisted.error || 'unknown error'}`, 'error');
                    }
                    return;
                }
                showToast('Invalid bookmark backup', 'error');
            } catch (err) {
                showToast('Error importing bookmark: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    };

    window.importFolderBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = ns.robustParseJson(e.target.result);
                const appConfig = getAppConfig();
                const selectedWorkspaceId = String(
                    getFolderWorkspaceSelect?.()?.value
                    || appConfig.activeWorkspace
                    || json?.metadata?.workspaceId
                    || ''
                ).trim() || 'main';
                const selectedCategoryName = String(
                    getFolderCategorySelect?.()?.value
                    || json?.metadata?.categoryName
                    || 'Unsorted'
                ).trim() || 'Unsorted';
                const selectedFolderId = String(getFolderSelect?.()?.value || '').trim();
                const remappedState = typeof remapFolderStateForRestore === 'function'
                    ? remapFolderStateForRestore(json, {
                        workspaceId: selectedWorkspaceId,
                        categoryName: selectedCategoryName,
                        folderId: selectedFolderId
                    })
                    : json;
                const isFolder = remappedState?.metadata?.type === 'folder';
                const success = isFolder && dataStore?.applyFolderState ? dataStore.applyFolderState(remappedState) : false;
                if (success) {
                    resetFileInput(inputElement);
                    showToast('Folder subtree restored! Saving...', 'success');
                    const persisted = typeof ns.persistAndReloadAfterRestore === 'function'
                        ? await ns.persistAndReloadAfterRestore()
                        : { ok: true };
                    if (persisted?.ok === false) {
                        return showToast(`Folder restore persisted locally failed: ${persisted.error || 'unknown error'}`, 'error');
                    }
                    return;
                }
                showToast('Invalid folder backup', 'error');
            } catch (err) {
                showToast('Error importing folder: ' + err.message, 'error');
            } finally {
                resetFileInput(inputElement);
            }
        };
        reader.readAsText(file);
    };

    window.triggerWorkspaceImport = function () {
        const input = document.getElementById('importWorkspaceFile');
        if (input) input.click();
    };

    ns.importActionsReady = true;
})();
