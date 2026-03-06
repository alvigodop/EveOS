// --- Data Transfer Folder Import Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importReady) return;
    if (!ns.sharedReady || !ns.exportReady || !ns.importParseReady) {
        console.warn('[DataTransfer] Import helpers missing; folder import actions not initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getWorkspaceMeta = ns.getWorkspaceMeta;
    const resolveTabFoldersFromRoot = ns.resolveTabFoldersFromRoot;
    const resolveCardFoldersFromRoot = ns.resolveCardFoldersFromRoot;
    const parseTabFolderHandle = ns.parseTabFolderHandle;
    const parseCardFolderHandle = ns.parseCardFolderHandle;
    const buildUnifiedStateFromParsed = ns.buildUnifiedStateFromParsed;
    const parseFullStateFromFolder = ns.parseFullStateFromFolder;
    const summarizeStateCounts = ns.summarizeStateCounts;
    const parseAnyDataPackFolder = ns.parseAnyDataPackFolder;

    async function activateDataPackFolderFromPicker(options = {}) {
        if (typeof window.showDirectoryPicker !== 'function') {
            return { ok: false, error: 'Folder picker is not supported in this browser.' };
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyState) {
            return { ok: false, error: 'Unified state restore is unavailable right now.' };
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            const parsed = await parseAnyDataPackFolder(rootHandle, options);
            const summary = summarizeStateCounts(parsed.state);
            const confirmMessage = options.confirmMessage
                || `Set selected folder as active data pack (${summary.tabs} tabs, ${summary.cards} cards, ${summary.bookmarks} bookmarks)?`;
            if (options.confirm !== false) {
                const confirmed = await showConfirm(confirmMessage);
                if (!confirmed) {
                    return { ok: false, canceled: true };
                }
                if (options.confirmTwice) {
                    const finalConfirmMessage = options.finalConfirmMessage
                        || 'Final confirmation: apply selected data pack now? This overwrites current bookmarks & library.';
                    const finalConfirmed = await showConfirm(finalConfirmMessage);
                    if (!finalConfirmed) {
                        return { ok: false, canceled: true };
                    }
                }
            }

            const applied = !!dataStore.applyState(parsed.state);
            if (!applied) {
                return { ok: false, error: 'Could not apply selected data pack.' };
            }

            return {
                ok: true,
                sourceType: parsed.sourceType,
                summary
            };
        } catch (error) {
            if (error?.name === 'AbortError') {
                return { ok: false, canceled: true };
            }
            return {
                ok: false,
                error: error?.message || String(error)
            };
        }
    }

    async function importFullDataFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyState) {
            return showToast('Unified backup restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore data from selected backup folder? (Overwrites bookmarks & library)'))) {
                return;
            }
            const state = await parseFullStateFromFolder(rootHandle);
            const ok = dataStore.applyState(state);
            if (!ok) return showToast('Folder restore could not be applied.', 'error');
            showToast('Folder backup restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Folder restore canceled.', 'info');
            }
            showToast(`Folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importWorkspaceFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyWorkspaceState) {
            return showToast('Workspace restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore tab from selected folder? (Overwrites selected tab workspace)'))) {
                return;
            }

            const selectedWorkspaceId = String(getWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const tabFolders = await resolveTabFoldersFromRoot(rootHandle);
            if (!tabFolders.length) {
                throw new Error('No tab folder found in selected location.');
            }

            const parsedTabs = [];
            for (const tabFolder of tabFolders) {
                parsedTabs.push(await parseTabFolderHandle(tabFolder, { workspaceId: selectedWorkspaceId }));
            }

            let chosen = parsedTabs.find((tab) => String(tab.workspaceId) === selectedWorkspaceId);
            if (!chosen) chosen = parsedTabs[0];

            const workspaceState = buildUnifiedStateFromParsed([chosen], {
                metadataType: 'workspace',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            workspaceState.metadata.workspaceId = chosen.workspaceId;
            workspaceState.metadata.workspaceName = chosen.workspaceName;
            workspaceState.metadata.type = 'workspace';

            const ok = dataStore.applyWorkspaceState(workspaceState);
            if (!ok) return showToast('Tab folder restore could not be applied.', 'error');
            showToast('Tab folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Tab folder restore canceled.', 'info');
            }
            showToast(`Tab folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importCardFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyCardState) {
            return showToast('Card restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore card from selected folder? (Overwrites selected workspace/card)'))) {
                return;
            }

            const selectedWorkspaceId = String(getCardWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const selectedCategoryName = String(getCardCategorySelect()?.value || '').trim();
            const cardFolders = await resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) {
                throw new Error('No card folder found in selected location.');
            }

            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await parseCardFolderHandle(cardFolder, {
                    workspaceId: selectedWorkspaceId,
                    categoryName: selectedCategoryName
                }));
            }

            let chosen = parsedCards.find((card) =>
                String(card.workspaceId) === selectedWorkspaceId
                && String(card.categoryName || '').toLowerCase() === String(selectedCategoryName || '').toLowerCase()
            );
            if (!chosen) {
                chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId) || parsedCards[0];
            }

            const workspaceMeta = getWorkspaceMeta(chosen.workspaceId);
            const tabLike = {
                workspaceId: chosen.workspaceId,
                workspaceName: workspaceMeta.name,
                workspaceIcon: workspaceMeta.icon,
                parsedCards: [chosen]
            };
            const cardState = buildUnifiedStateFromParsed([tabLike], {
                metadataType: 'card',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            cardState.metadata.workspaceId = chosen.workspaceId;
            cardState.metadata.categoryName = chosen.categoryName;
            cardState.metadata.type = 'card';

            const ok = dataStore.applyCardState(cardState);
            if (!ok) return showToast('Card folder restore could not be applied.', 'error');
            showToast('Card folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Card folder restore canceled.', 'info');
            }
            showToast(`Card folder restore failed: ${error.message || error}`, 'error');
        }
    }

    window.importDataFolderBrowserOnly = importFullDataFromFolderBrowserOnly;
    window.importWorkspaceFolderBackupBrowserOnly = importWorkspaceFromFolderBrowserOnly;
    window.importCardFolderBackupBrowserOnly = importCardFromFolderBrowserOnly;
    window.activateDataPackFolderFromPicker = activateDataPackFolderFromPicker;

    Object.assign(ns, {
        parseAnyDataPackFolder,
        activateDataPackFolderFromPicker,
        importFullDataFromFolderBrowserOnly,
        importWorkspaceFromFolderBrowserOnly,
        importCardFromFolderBrowserOnly
    });
    ns.importReady = true;
})();
