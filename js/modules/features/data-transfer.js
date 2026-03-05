// --- Data Transfer Module ---
// Handles import/export of backup data
(function () {
    function getDataStore() {
        return window.EveDataStore?.Store || null;
    }

    function getAppConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function getAppLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined') return links;
        return [];
    }

    function getWorkspaceSelect() {
        return document.getElementById('tabBackupSelect');
    }

    function getCardWorkspaceSelect() {
        return document.getElementById('cardBackupWorkspaceSelect');
    }

    function getCardCategorySelect() {
        return document.getElementById('cardBackupCategorySelect');
    }

    function getBookmarkWorkspaceSelect() {
        return document.getElementById('bookmarkBackupWorkspaceSelect');
    }

    function getBookmarkCategorySelect() {
        return document.getElementById('bookmarkBackupCategorySelect');
    }

    function getBookmarkLinkSelect() {
        return document.getElementById('bookmarkBackupLinkSelect');
    }

    function refreshCardBackupList() {
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        if (!wsSelect || !categorySelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const activeWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';

        wsSelect.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            wsSelect.appendChild(option);
        });
        wsSelect.value = activeWorkspace;

        const categories = [...new Set(
            allLinks
                .filter(entry => entry.workspace === activeWorkspace)
                .map(entry => entry.category || 'Unsorted')
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
    }

    function refreshBookmarkBackupList() {
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        if (!wsSelect || !categorySelect || !linkSelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const selectedWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';
        const selectedCategory = categorySelect.value || 'Unsorted';
        const selectedLinkId = linkSelect.value || '';

        wsSelect.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            wsSelect.appendChild(option);
        });
        wsSelect.value = selectedWorkspace;

        const categories = [...new Set(
            allLinks
                .filter(entry => entry.workspace === selectedWorkspace)
                .map(entry => entry.category || 'Unsorted')
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
        if (categories.length > 0) {
            categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : categories[0];
        }

        const activeCategory = categorySelect.value || categories[0] || '';
        const bookmarkLinks = allLinks
            .filter(entry => entry.workspace === selectedWorkspace && (entry.category || 'Unsorted') === activeCategory)
            .slice()
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

        linkSelect.innerHTML = '';
        bookmarkLinks.forEach(link => {
            const option = document.createElement('option');
            option.value = String(link.id);
            option.textContent = (link.title || 'Untitled') + (link.url ? ` - ${link.url}` : '');
            linkSelect.appendChild(option);
        });
        if (bookmarkLinks.length > 0) {
            const hasExistingSelection = bookmarkLinks.some(link => String(link.id) === String(selectedLinkId));
            linkSelect.value = hasExistingSelection ? String(selectedLinkId) : String(bookmarkLinks[0].id);
        }
    }

    function refreshWorkspaceBackupList() {
        const select = getWorkspaceSelect();
        if (!select) {
            refreshCardBackupList();
            refreshBookmarkBackupList();
            return;
        }
        const appConfig = getAppConfig();
        const workspaces = appConfig.workspaces || [];
        select.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            select.appendChild(option);
        });
        select.value = appConfig.activeWorkspace || workspaces[0]?.id || '';
        refreshCardBackupList();
        refreshBookmarkBackupList();
        const cardWsSelect = getCardWorkspaceSelect();
        if (cardWsSelect) {
            cardWsSelect.onchange = refreshCardBackupList;
        }
        const bookmarkWsSelect = getBookmarkWorkspaceSelect();
        const bookmarkCategorySelect = getBookmarkCategorySelect();
        if (bookmarkWsSelect) {
            bookmarkWsSelect.onchange = refreshBookmarkBackupList;
        }
        if (bookmarkCategorySelect) {
            bookmarkCategorySelect.onchange = refreshBookmarkBackupList;
        }
    }

    window.refreshWorkspaceBackupList = refreshWorkspaceBackupList;
    window.refreshCardBackupList = refreshCardBackupList;
    window.refreshBookmarkBackupList = refreshBookmarkBackupList;

    function buildWorkspacePayload(workspaceId) {
        const payload = {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Workspace Backup',
                workspaceId,
                type: 'workspace'
            },
            bookmarks: {
                links: [],
                config: {
                    ...getAppConfig(),
                    activeWorkspace: workspaceId
                }
            },
            library: {
                categories: {},
                connections: []
            }
        };
        const allLinks = getAppLinks();
        payload.bookmarks.links = allLinks.filter(entry => entry.workspace === workspaceId);
        return payload;
    }

    window.exportWorkspaceBackup = function () {
        const dataStore = getDataStore();
        const select = getWorkspaceSelect();
        const appConfig = getAppConfig();
        const workspaceId = (select?.value || appConfig.activeWorkspace || '').trim();
        if (!workspaceId) {
            return showToast("No workspace selected for export.", "error");
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const exportState = dataStore ? dataStore.captureWorkspace(workspaceId) : buildWorkspacePayload(workspaceId);
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_tab_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_') || workspaceId}.json`;
        a.click();
    };

    window.exportCardBackup = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        if (!workspaceId || !categoryName) {
            return showToast("Select workspace and card category first.", "error");
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const exportState = dataStore?.captureCard
            ? dataStore.captureCard(workspaceId, categoryName)
            : buildWorkspacePayload(workspaceId);
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_card_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_')}_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        a.click();
    };

    window.exportBookmarkBackup = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        const linkId = String(linkSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !linkId) {
            return showToast("Select workspace, category, and bookmark first.", "error");
        }

        const selectedLink = getAppLinks().find(entry => String(entry.id) === linkId);
        const exportState = dataStore?.captureBookmark
            ? dataStore.captureBookmark(workspaceId, categoryName, linkId)
            : null;
        if (!exportState) {
            return showToast("Could not build bookmark backup payload.", "error");
        }

        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const bookmarkName = (selectedLink?.title || `bookmark_${linkId}`).replace(/[^a-zA-Z0-9]/g, '_');
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_bookmark_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_')}_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}_${bookmarkName}.json`;
        a.click();
    };

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

    window.exportData = function () {
        const dataStore = getDataStore();
        const exportState = dataStore ? dataStore.captureState() : {
            date: new Date().toISOString(),
            config: getAppConfig(),
            links: getAppLinks()
        };
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
