// --- Data Transfer Folder Import Parse Handle Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseHandlesReady) return;
    if (!ns.sharedReady || !ns.importParseFsReady || !ns.importParseStateReady) {
        console.warn('[DataTransfer] Shared, filesystem, or state helpers missing; import handle parse helpers not initialized.');
        return;
    }

    const getDirectoryHandleIfExists = ns.getDirectoryHandleIfExists;
    const readJsonFromFileHandle = ns.readJsonFromFileHandle;
    const readJsonFileIfExists = ns.readJsonFileIfExists;
    const listDirectoryEntries = ns.listDirectoryEntries;
    const inferWorkspaceIdFromFolderName = ns.inferWorkspaceIdFromFolderName;
    const inferCategoryFromFolderName = ns.inferCategoryFromFolderName;
    const makePlaceholderBookmark = ns.makePlaceholderBookmark;

    async function parseCardFolderHandle(cardFolderHandle, defaults = {}) {
        const cardJson = await readJsonFileIfExists(cardFolderHandle, 'card.json');
        const workspaceId = String(cardJson?.workspaceId || defaults.workspaceId || inferWorkspaceIdFromFolderName(defaults.workspaceFolderName || '', 'main') || 'main').trim() || 'main';
        const categoryName = String(cardJson?.categoryName || cardJson?.name || cardJson?.title || defaults.categoryName || inferCategoryFromFolderName(cardFolderHandle.name, 'Unsorted')).trim() || 'Unsorted';
        const dataType = String(cardJson?.dataType || 'graphicNovels').trim() || 'graphicNovels';
        const bookmarkFolderName = String(cardJson?.bookmarkFolder || 'entries').trim() || 'entries';
        let entriesHandle = await getDirectoryHandleIfExists(cardFolderHandle, bookmarkFolderName);
        if (!entriesHandle && bookmarkFolderName !== 'entries') entriesHandle = await getDirectoryHandleIfExists(cardFolderHandle, 'entries');
        if (!entriesHandle) entriesHandle = cardFolderHandle;

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
            if (library?.entry) categoryEntries.push({ ...library.entry });
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
        if (links.length === 0) links.push(makePlaceholderBookmark(workspaceId, categoryName));

        return { workspaceId, categoryName, dataType, links, connections: Array.from(connectionMap.values()), categoryEntries };
    }

    async function parseTabFolderHandle(tabFolderHandle, defaults = {}) {
        const tabJson = await readJsonFileIfExists(tabFolderHandle, 'tab.json');
        const workspaceId = String(tabJson?.id || defaults.workspaceId || inferWorkspaceIdFromFolderName(tabFolderHandle.name, 'main')).trim() || 'main';
        const workspaceName = String(tabJson?.name || defaults.workspaceName || workspaceId).trim() || workspaceId;
        const workspaceIcon = tabJson?.icon || defaults.workspaceIcon || 'folder';
        const cardsRoot = await getDirectoryHandleIfExists(tabFolderHandle, 'cards');
        const cardFolders = cardsRoot ? (await listDirectoryEntries(cardsRoot)).filter((entry) => entry.handle.kind === 'directory').map((entry) => entry.handle) : [];
        const parsedCards = [];
        for (const cardFolder of cardFolders) {
            parsedCards.push(await parseCardFolderHandle(cardFolder, { workspaceId, workspaceFolderName: tabFolderHandle.name }));
        }
        return { workspaceId, workspaceName, workspaceIcon, parsedCards };
    }

    Object.assign(ns, { parseTabFolderHandle, parseCardFolderHandle });
    ns.importParseHandlesReady = true;
})();
