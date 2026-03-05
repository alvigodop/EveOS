// --- Data Transfer Module ---
// Handles legacy JSON import/export glue and delegates folder workflows.
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (!ns.sharedReady || !ns.exportReady || !ns.importReady) {
        console.warn('[DataTransfer] Helpers missing; main module not fully initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const isLocalhostHost = ns.isLocalhostHost;
    const exportFullBackupAsFolder = ns.exportFullBackupAsFolder;
    function resetFileInput(input) {
        if (!input) return;
        input.value = "";
    }

    function setLegacyLinks(nextLinks) {
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
                const json = JSON.parse(e.target.result);
                const dataStore = getDataStore();

                if (json.metadata && json.bookmarks && json.library) {
                    if (!dataStore?.applyState) {
                        showToast("Unified backup support is unavailable right now.", "error");
                        return;
                    }
                    if (await showConfirm("Restore Unified Backup? (Overwrites bookmarks & library)")) {
                        const applied = dataStore.applyState(json);
                        if (!applied) {
                            showToast("Unified backup could not be applied.", "error");
                            return;
                        }
                        location.reload();
                        showToast("Unified Backup Restored!", "success");
                    }
                } else if (json.links && !json.config) {
                    // Organized Backup (Links only)
                    if (await showConfirm("Restore Organized Backup? (Overwrites Everything)")) {
                        setLegacyLinks(json.links);
                        if (json.date) console.log("Backup Date:", json.date);
                        saveData();
                        location.reload();
                        showToast("Organized Backup Restored!", "success");
                    }
                } else if (json.links && json.config) {
                    // Full Backup
                    if (await showConfirm("Restore Full Backup? (Overwrites Settings & Workspaces)")) {
                        setLegacyLinks(json.links);
                        setLegacyConfig(json.config);
                        saveData();
                        saveConfig();
                        location.reload();
                        showToast("Full Backup Restored!", "success");
                    }
                } else if (Array.isArray(json)) {
                    // Legacy: Raw Array
                    setLegacyLinks(json);
                    saveData();
                    location.reload();
                } else if (json.children || json.title) {
                    showToast("Importing bookmarks structure...", "info");
                } else {
                    showToast("Invalid Backup File", "error");
                }
            } catch (err) {
                showToast("Error importing: " + err.message, "error");
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

        // Inline onchange="importData(this)" fires after selection; process immediately.
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

    window.exportData = async function () {
        const dataStore = getDataStore();
        const exportState = dataStore ? dataStore.captureState() : {
            date: new Date().toISOString(),
            config: getAppConfig(),
            links: getAppLinks()
        };

        const canAttemptFolderExport = typeof window.showDirectoryPicker === 'function';
        if (canAttemptFolderExport) {
            try {
                // In localhost server mode, persist latest in-memory state to modular JSON
                // before writing the client-side backup folder snapshot.
                if (isLocalhostHost() && window.EveDataStore?.ModularSync?.syncNow) {
                    await window.EveDataStore.ModularSync.syncNow(true);
                }
                const folderResult = await exportFullBackupAsFolder(exportState);
                if (folderResult?.ok) {
                    const tabsCount = Number(folderResult.tabsCount || 0);
                    const cardsCount = Number(folderResult.cardsCount || 0);
                    const bookmarksCount = Number(folderResult.bookmarksCount || 0);
                    const dataPackSummary = `${tabsCount} tabs, ${cardsCount} cards, ${bookmarksCount} bookmarks`;
                    showToast(`Folder backup created (${dataPackSummary}).`, 'success');
                    return;
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    showToast('Folder backup canceled.', 'info');
                    return;
                }
                console.warn('[DataTransfer] Folder backup export failed, using JSON fallback:', error);
                showToast('Folder backup failed. Downloading JSON backup instead.', 'warning');
            }
        }

        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    };

    window.importWorkspaceBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const isWorkspace = json.metadata?.type === 'workspace';
                const success = isWorkspace && dataStore ? dataStore.applyWorkspaceState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Workspace restored!", "success");
                }
                showToast("Invalid workspace backup", "error");
            } catch (err) {
                showToast("Error importing workspace: " + err.message, "error");
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
                const json = JSON.parse(e.target.result);
                const isCard = json.metadata?.type === 'card';
                const success = isCard && dataStore?.applyCardState ? dataStore.applyCardState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Card restored!", "success");
                }
                showToast("Invalid card backup", "error");
            } catch (err) {
                showToast("Error importing card: " + err.message, "error");
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
                const json = JSON.parse(e.target.result);
                const isBookmark = json.metadata?.type === 'bookmark';
                const success = isBookmark && dataStore?.applyBookmarkState ? dataStore.applyBookmarkState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Bookmark restored!", "success");
                }
                showToast("Invalid bookmark backup", "error");
            } catch (err) {
                showToast("Error importing bookmark: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    };

    window.triggerWorkspaceImport = function () {
        const input = document.getElementById('importWorkspaceFile');
        if (input) input.click();
    };
})();
