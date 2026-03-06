// --- Data Transfer Folder Import Parse Root Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseRootReady) return;
    if (!ns.sharedReady || !ns.importParseHandlesReady || !ns.importParseStateReady) {
        console.warn('[DataTransfer] Shared, handle, or state helpers missing; import root parse helpers not initialized.');
        return;
    }

    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getDirectoryHandleIfExists = ns.getDirectoryHandleIfExists;
    const readJsonFileIfExists = ns.readJsonFileIfExists;
    const resolveTabFoldersFromRoot = ns.resolveTabFoldersFromRoot;
    const resolveCardFoldersFromRoot = ns.resolveCardFoldersFromRoot;
    const parseTabFolderHandle = ns.parseTabFolderHandle;
    const parseCardFolderHandle = ns.parseCardFolderHandle;
    const buildUnifiedStateFromParsed = ns.buildUnifiedStateFromParsed;
    const buildParsedTabsFromCards = ns.buildParsedTabsFromCards;

    async function tryReadUnifiedStateFromFolder(rootHandle) {
        const stateRoot = await getDirectoryHandleIfExists(rootHandle, 'state');
        if (!stateRoot) return null;
        const statePayload = await readJsonFileIfExists(stateRoot, 'eve_state.json');
        if (!statePayload || typeof statePayload !== 'object' || !statePayload.bookmarks || !statePayload.library) return null;
        return statePayload;
    }

    async function parseFullStateFromFolder(rootHandle) {
        const directState = await tryReadUnifiedStateFromFolder(rootHandle);
        if (directState) return directState;
        const metaRoot = await getDirectoryHandleIfExists(rootHandle, '_meta');
        const configPayload = metaRoot ? await readJsonFileIfExists(metaRoot, 'config.json') : null;
        const tabFolders = await resolveTabFoldersFromRoot(rootHandle);
        if (!tabFolders.length) {
            throw new Error('No tab folders found. Expected tabs/<tab>/cards/... structure.');
        }
        const parsedTabs = [];
        for (const tabFolder of tabFolders) {
            parsedTabs.push(await parseTabFolderHandle(tabFolder));
        }
        return buildUnifiedStateFromParsed(parsedTabs, {
            metadataType: 'store',
            config: configPayload || {},
            activeWorkspace: configPayload?.activeWorkspace || parsedTabs[0]?.workspaceId || 'main'
        });
    }

    async function parseAnyDataPackFolder(rootHandle, options = {}) {
        try {
            const fullState = await parseFullStateFromFolder(rootHandle);
            return { state: fullState, sourceType: 'store' };
        } catch (fullError) {
            const preferredWorkspaceId = String(options.workspaceId || getWorkspaceSelect()?.value || getCardWorkspaceSelect()?.value || getAppConfig().activeWorkspace || 'main').trim() || 'main';
            const cardFolders = await resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) throw new Error(fullError?.message || 'No importable data-pack structure found.');
            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await parseCardFolderHandle(cardFolder, { workspaceId: preferredWorkspaceId }));
            }
            const parsedTabs = buildParsedTabsFromCards(parsedCards);
            if (!parsedTabs.length) throw new Error('No importable card data found in selected folder.');
            const currentConfig = getAppConfig();
            const state = buildUnifiedStateFromParsed(parsedTabs, {
                metadataType: 'store',
                config: currentConfig && typeof currentConfig === 'object' ? currentConfig : {},
                activeWorkspace: parsedTabs[0]?.workspaceId || preferredWorkspaceId
            });
            return { state, sourceType: 'card' };
        }
    }

    Object.assign(ns, { parseFullStateFromFolder, parseAnyDataPackFolder });
    ns.importParseRootReady = true;
})();
