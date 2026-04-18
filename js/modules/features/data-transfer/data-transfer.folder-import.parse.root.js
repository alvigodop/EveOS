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
    const getDirectoryHandleByAliases = ns.getDirectoryHandleByAliases;
    const readJsonFileIfExists = ns.readJsonFileIfExists;
    const collectTabFoldersRecursive = ns.collectTabFoldersRecursive;
    const listDirectoryEntries = ns.listDirectoryEntries;
    const resolveTabFoldersFromRoot = ns.resolveTabFoldersFromRoot;
    const resolveCardFoldersFromRoot = ns.resolveCardFoldersFromRoot;
    const parseTabFolderHandle = ns.parseTabFolderHandle;
    const parseCardFolderHandle = ns.parseCardFolderHandle;
    const buildUnifiedStateFromParsed = ns.buildUnifiedStateFromParsed;
    const buildParsedTabsFromCards = ns.buildParsedTabsFromCards;

    async function tryReadKnowledgeStateFromFolder(rootHandle) {
        const knowledgeRoot = await getDirectoryHandleByAliases(rootHandle, ['knowledge', 'k']);
        if (!knowledgeRoot) return null;
        const payload = await readJsonFileIfExists(knowledgeRoot, 'scoped-storage.json');
        if (!payload || typeof payload !== 'object') return null;
        if (!payload.scopedStorage || typeof payload.scopedStorage !== 'object') return null;
        return {
            scopedStorage: payload.scopedStorage
        };
    }

    async function tryReadUnifiedStateFromFolder(rootHandle) {
        const stateRoot = await getDirectoryHandleByAliases(rootHandle, ['state', 's']);
        if (!stateRoot) return null;
        const statePayload = await readJsonFileIfExists(stateRoot, 'eve_state.json');
        if (!statePayload || typeof statePayload !== 'object' || !statePayload.bookmarks || !statePayload.library) return null;
        if (!statePayload.knowledge) {
            const knowledgeState = await tryReadKnowledgeStateFromFolder(rootHandle);
            if (knowledgeState) statePayload.knowledge = knowledgeState;
        }
        return statePayload;
    }

    async function parseFullStateFromFolder(rootHandle) {
        const directState = await tryReadUnifiedStateFromFolder(rootHandle);
        if (directState) return directState;
        const metaRoot = await getDirectoryHandleByAliases(rootHandle, ['_meta', 'm']);
        const configPayload = metaRoot ? await readJsonFileIfExists(metaRoot, 'config.json') : null;
        const pinsPayload = metaRoot ? await readJsonFileIfExists(metaRoot, 'pins.json') : null;
        const tabsRoot = await getDirectoryHandleByAliases(rootHandle, ['tabs', 't']);
        const tabFolders = tabsRoot ? await collectTabFoldersRecursive(tabsRoot, []) : await resolveTabFoldersFromRoot(rootHandle);
        if (!tabFolders.length) {
            throw new Error('No tab folders found. Expected tabs/<tab>/cards/... structure.');
        }

        const parsedTabs = [];
        if (tabsRoot) {
            const rootTabFolders = (await listDirectoryEntries(tabsRoot))
                .filter((entry) => entry.handle.kind === 'directory')
                .map((entry) => entry.handle);

            const visitTabTree = async (tabFolderHandle, parentWorkspaceId = '') => {
                const parsedTab = await parseTabFolderHandle(tabFolderHandle, { parentWorkspaceId });
                parsedTabs.push(parsedTab);
                const nestedTabsHandle = await getDirectoryHandleByAliases(tabFolderHandle, ['tabs', 't']);
                if (!nestedTabsHandle) return;
                const directChildren = [];
                const nestedEntries = await listDirectoryEntries(nestedTabsHandle);
                nestedEntries.forEach(({ handle }) => {
                    if (handle.kind === 'directory') directChildren.push(handle);
                });
                for (const childHandle of directChildren) {
                    await visitTabTree(childHandle, parsedTab.workspaceId);
                }
            };

            for (const rootTabFolder of rootTabFolders) {
                await visitTabTree(rootTabFolder);
            }
        } else {
            for (const tabFolder of tabFolders) {
                parsedTabs.push(await parseTabFolderHandle(tabFolder));
            }
        }
        const nextState = buildUnifiedStateFromParsed(parsedTabs, {
            metadataType: 'store',
            config: configPayload || {},
            quickPins: Array.isArray(pinsPayload?.pins) ? pinsPayload.pins : [],
            activeWorkspace: configPayload?.activeWorkspace || parsedTabs[0]?.workspaceId || 'main'
        });
        const knowledgeState = await tryReadKnowledgeStateFromFolder(rootHandle);
        if (knowledgeState) nextState.knowledge = knowledgeState;
        return nextState;
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
            const knowledgeState = await tryReadKnowledgeStateFromFolder(rootHandle);
            if (knowledgeState) state.knowledge = knowledgeState;
            return { state, sourceType: 'card' };
        }
    }

    Object.assign(ns, { parseFullStateFromFolder, parseAnyDataPackFolder });
    ns.importParseRootReady = true;
})();
