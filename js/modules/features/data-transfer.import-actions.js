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

    function resetFileInput(input) {
        if (!input) return;
        input.value = '';
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
                        showToast('Unified backup support is unavailable right now.', 'error');
                        return;
                    }
                    if (await showConfirm('Restore Unified Backup? (Overwrites bookmarks & library)')) {
                        const applied = dataStore.applyState(json);
                        if (!applied) {
                            showToast('Unified backup could not be applied.', 'error');
                            return;
                        }
                        location.reload();
                        showToast('Unified Backup Restored!', 'success');
                    }
                } else if (json.links && !json.config) {
                    if (await showConfirm('Restore Organized Backup? (Overwrites Everything)')) {
                        setLegacyLinks(json.links);
                        if (json.date) console.log('Backup Date:', json.date);
                        saveData();
                        location.reload();
                        showToast('Organized Backup Restored!', 'success');
                    }
                } else if (json.links && json.config) {
                    if (await showConfirm('Restore Full Backup? (Overwrites Settings & Workspaces)')) {
                        setLegacyLinks(json.links);
                        setLegacyConfig(json.config);
                        saveData();
                        saveConfig();
                        location.reload();
                        showToast('Full Backup Restored!', 'success');
                    }
                } else if (Array.isArray(json)) {
                    setLegacyLinks(json);
                    saveData();
                    location.reload();
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
                const json = JSON.parse(e.target.result);
                const isWorkspace = json.metadata?.type === 'workspace';
                const success = isWorkspace && dataStore ? dataStore.applyWorkspaceState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast('Workspace restored!', 'success');
                }
                showToast('Invalid workspace backup', 'error');
            } catch (err) {
                showToast('Error importing workspace: ' + err.message, 'error');
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
                    return showToast('Card restored!', 'success');
                }
                showToast('Invalid card backup', 'error');
            } catch (err) {
                showToast('Error importing card: ' + err.message, 'error');
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
                    return showToast('Bookmark restored!', 'success');
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
                const json = JSON.parse(e.target.result);
                const isFolder = json.metadata?.type === 'folder';
                const success = isFolder && dataStore?.applyFolderState ? dataStore.applyFolderState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast('Folder subtree restored!', 'success');
                }
                showToast('Invalid folder backup', 'error');
            } catch (err) {
                showToast('Error importing folder: ' + err.message, 'error');
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
