// --- Data Transfer Folder Import Parse Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseReady) return;
    if (!ns.sharedReady || !ns.importParseFsReady || !ns.importParseStateReady) {
        console.warn('[DataTransfer] Shared, filesystem, or state parse helpers missing; import parse helpers not initialized.');
        return;
    }

    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getDirectoryHandleIfExists = ns.getDirectoryHandleIfExists;
    const readJsonFromFileHandle = ns.readJsonFromFileHandle;
    const readJsonFileIfExists = ns.readJsonFileIfExists;
    const listDirectoryEntries = ns.listDirectoryEntries;
    const resolveTabFoldersFromRoot = ns.resolveTabFoldersFromRoot;
    const resolveCardFoldersFromRoot = ns.resolveCardFoldersFromRoot;
    const inferWorkspaceIdFromFolderName = ns.inferWorkspaceIdFromFolderName;
    const inferCategoryFromFolderName = ns.inferCategoryFromFolderName;
    const makePlaceholderBookmark = ns.makePlaceholderBookmark;
    const buildUnifiedStateFromParsed = ns.buildUnifiedStateFromParsed;
    const buildParsedTabsFromCards = ns.buildParsedTabsFromCards;

    async function parseCardFolderHandle(cardFolderHandle, defaults = {}) {
        const cardJson = await readJsonFileIfExists(cardFolderHandle, 'card.json');
        const workspaceId = String(
            cardJson?.workspaceId
            || defaults.workspaceId
            || inferWorkspaceIdFromFolderName(defaults.workspaceFolderName || '', 'main')
            || 'main'
        ).trim() || 'main';
        const categoryName = String(
            cardJson?.categoryName
            || cardJson?.name
            || cardJson?.title
            || defaults.categoryName
            || inferCategoryFromFolderName(cardFolderHandle.name, 'Unsorted')
        ).trim() || 'Unsorted';
        const dataType = String(cardJson?.dataType || 'graphicNovels').trim() || 'graphicNovels';

        const bookmarkFolderName = String(cardJson?.bookmarkFolder || 'entries').trim() || 'entries';
        let entriesHandle = await getDirectoryHandleIfExists(cardFolderHandle, bookmarkFolderName);
        if (!entriesHandle && bookmarkFolderName !== 'entries') {
            entriesHandle = await getDirectoryHandleIfExists(cardFolderHandle, 'entries');
        }
        if (!entriesHandle) {
            entriesHandle = cardFolderHandle;
        }

        const links = [];
        const connectionMap = new Map();
        const categoryEntries = [];
        const entriesList = await listDirectoryEntries(entriesHandle);
        for (const { name, handle } of entriesList) {
            if (handle.kind !== 'file') continue;
            const lowerName = String(name || '').toLowerCase();
            if (!lowerName.endsWith('.json') || lowerName.startsWith('_')) continue;

            let payload;
            try {
                payload = await readJsonFromFileHandle(handle);
            } catch {
                continue;
            }

            const bookmark = payload?.bookmark && typeof payload.bookmark === 'object'
                ? { ...payload.bookmark }
                : (payload && typeof payload === 'object' ? { ...payload } : null);
            if (!bookmark) continue;

            if (!bookmark.id) {
                const fallbackId = String(name || '').replace(/\.json$/i, '').trim();
                bookmark.id = fallbackId || `bookmark-${Date.now().toString(36)}`;
            }
            bookmark.workspace = workspaceId;
            bookmark.category = categoryName;
            links.push(bookmark);

            const library = payload?.library && typeof payload.library === 'object' ? payload.library : null;
            if (library?.entry) {
                categoryEntries.push({ ...library.entry });
            }
            if (library?.connection && typeof library.connection === 'object') {
                const conn = { ...library.connection };
                conn.linkId = String(conn.linkId || bookmark.id);
                conn.workspace = workspaceId;
                conn.categoryName = String(conn.categoryName || categoryName);
                if (!conn.id) conn.id = `conn-${conn.linkId}`;
                connectionMap.set(String(conn.linkId), conn);
            }
        }

        const unlinkedPayload = await readJsonFileIfExists(cardFolderHandle, '_library-unlinked.json');
        if (Array.isArray(unlinkedPayload?.entries)) {
            unlinkedPayload.entries.forEach((entry) => categoryEntries.push({ ...(entry || {}) }));
        }

        if (links.length === 0) {
            links.push(makePlaceholderBookmark(workspaceId, categoryName));
        }

        return {
            workspaceId,
            categoryName,
            dataType,
            links,
            connections: Array.from(connectionMap.values()),
            categoryEntries
        };
    }

    async function parseTabFolderHandle(tabFolderHandle, defaults = {}) {
        const tabJson = await readJsonFileIfExists(tabFolderHandle, 'tab.json');
        const workspaceId = String(
            tabJson?.id
            || defaults.workspaceId
            || inferWorkspaceIdFromFolderName(tabFolderHandle.name, 'main')
        ).trim() || 'main';
        const workspaceName = String(tabJson?.name || defaults.workspaceName || workspaceId).trim() || workspaceId;
        const workspaceIcon = tabJson?.icon || defaults.workspaceIcon || 'folder';
        const cardsRoot = await getDirectoryHandleIfExists(tabFolderHandle, 'cards');
        const cardFolders = cardsRoot
            ? (await listDirectoryEntries(cardsRoot)).filter((entry) => entry.handle.kind === 'directory').map((entry) => entry.handle)
            : [];

        const parsedCards = [];
        for (const cardFolder of cardFolders) {
            parsedCards.push(await parseCardFolderHandle(cardFolder, {
                workspaceId,
                workspaceFolderName: tabFolderHandle.name
            }));
        }

        return {
            workspaceId,
            workspaceName,
            workspaceIcon,
            parsedCards
        };
    }

    async function tryReadUnifiedStateFromFolder(rootHandle) {
        const stateRoot = await getDirectoryHandleIfExists(rootHandle, 'state');
        if (!stateRoot) return null;
        const statePayload = await readJsonFileIfExists(stateRoot, 'eve_state.json');
        if (!statePayload || typeof statePayload !== 'object') return null;
        if (!statePayload.bookmarks || !statePayload.library) return null;
        return statePayload;
    }

    async function parseFullStateFromFolder(rootHandle) {
        const directState = await tryReadUnifiedStateFromFolder(rootHandle);
        if (directState) return directState;

        const metaRoot = await getDirectoryHandleIfExists(rootHandle, '_meta');
        const configPayload = metaRoot ? (await readJsonFileIfExists(metaRoot, 'config.json')) : null;

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
            return {
                state: fullState,
                sourceType: 'store'
            };
        } catch (fullError) {
            const preferredWorkspaceId = String(
                options.workspaceId
                || getWorkspaceSelect()?.value
                || getCardWorkspaceSelect()?.value
                || getAppConfig().activeWorkspace
                || 'main'
            ).trim() || 'main';

            const cardFolders = await resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) {
                throw new Error(fullError?.message || 'No importable data-pack structure found.');
            }

            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await parseCardFolderHandle(cardFolder, {
                    workspaceId: preferredWorkspaceId
                }));
            }
            const parsedTabs = buildParsedTabsFromCards(parsedCards);
            if (!parsedTabs.length) {
                throw new Error('No importable card data found in selected folder.');
            }

            const currentConfig = getAppConfig();
            const state = buildUnifiedStateFromParsed(parsedTabs, {
                metadataType: 'store',
                config: currentConfig && typeof currentConfig === 'object' ? currentConfig : {},
                activeWorkspace: parsedTabs[0]?.workspaceId || preferredWorkspaceId
            });
            return {
                state,
                sourceType: 'card'
            };
        }
    }

    Object.assign(ns, {
        parseTabFolderHandle,
        parseCardFolderHandle,
        parseFullStateFromFolder,
        parseAnyDataPackFolder
    });
    ns.importParseReady = true;
})();
