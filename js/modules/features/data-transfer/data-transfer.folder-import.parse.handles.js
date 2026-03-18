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
    const getDirectoryHandleByAliases = ns.getDirectoryHandleByAliases;
    const readJsonFromFileHandle = ns.readJsonFromFileHandle;
    const readJsonFileIfExists = ns.readJsonFileIfExists;
    const listDirectoryEntries = ns.listDirectoryEntries;
    const inferWorkspaceIdFromFolderName = ns.inferWorkspaceIdFromFolderName;
    const inferCategoryFromFolderName = ns.inferCategoryFromFolderName;
    const makePlaceholderBookmark = ns.makePlaceholderBookmark;

 function normalizeClickBehaviorMode(value) {
     const normalized = String(value || '').trim().toLowerCase();
     return ['inherit', 'invert', 'focus_only', 'open_and_focus', 'open_only'].includes(normalized)
         ? normalized
         : 'inherit';
 }

 function normalizeTaskMode(value) {
     const normalized = String(value || '').trim().toLowerCase();
     return ['inherit', 'task', 'non_task'].includes(normalized)
         ? normalized
         : 'inherit';
 }

    function normalizeTreeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return {
            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)
        };
    }

    function normalizeFolderNode(rawNode, folderName, parentId = null, fallbackIndex = 0) {
        const source = rawNode && typeof rawNode === 'object' ? rawNode : {};
        const fallbackName = String(folderName || 'Folder').trim() || 'Folder';
        const name = String(source.name || source.title || fallbackName).trim() || fallbackName;
        const parsedOrder = Number(source.order);
        const order = Number.isFinite(parsedOrder) ? parsedOrder : 0;
        let id = String(source.id || '').trim();
        if (!id) {
            id = `folder-${String(parentId || 'root')}-${fallbackIndex}`;
        }
        return {
            id,
            parentId: parentId || (String(source.parentId || '').trim() || null),
            name,
         order,
         createdAt: String(source.createdAt || '').trim(),
         updatedAt: String(source.updatedAt || '').trim(),
         clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode),
         taskMode: normalizeTaskMode(source.taskMode)
     };
 }

    async function parseEntriesDirectory(entriesHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, folderId = null) {
        if (!entriesHandle) return;
        const entriesList = await listDirectoryEntries(entriesHandle);
        for (const { name, handle } of entriesList) {
            if (handle.kind !== 'file') continue;
            const lowerName = String(name || '').toLowerCase();
            if (!lowerName.endsWith('.json') || lowerName.startsWith('_')) continue;
            if (lowerName === 'card.json' || lowerName === 'folder.json') continue;
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
            if (folderId) bookmark.folderId = folderId;
            else delete bookmark.folderId;
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
    }

    async function parseFolderTree(foldersHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, folderTreeNodes, parentId = null) {
        if (!foldersHandle) return;
        const folderEntries = (await listDirectoryEntries(foldersHandle)).filter((entry) => entry.handle.kind === 'directory');
        let folderIndex = 0;
        for (const { handle } of folderEntries) {
            folderIndex += 1;
            const folderJson = await readJsonFileIfExists(handle, 'folder.json');
            const node = normalizeFolderNode(folderJson, handle.name, parentId, folderIndex);
            folderTreeNodes.push(node);
            const entriesHandle = await getDirectoryHandleByAliases(handle, ['entries', 'e']);
            if (entriesHandle) {
                await parseEntriesDirectory(entriesHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, node.id);
            }
            const nestedFoldersHandle = await getDirectoryHandleByAliases(handle, ['folders', 'f']);
            if (nestedFoldersHandle) {
                await parseFolderTree(nestedFoldersHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, folderTreeNodes, node.id);
            }
        }
    }

    async function parseCardFolderHandle(cardFolderHandle, defaults = {}) {
        const cardJson = await readJsonFileIfExists(cardFolderHandle, 'card.json');
        const workspaceId = String(cardJson?.workspaceId || defaults.workspaceId || inferWorkspaceIdFromFolderName(defaults.workspaceFolderName || '', 'main') || 'main').trim() || 'main';
        const categoryName = String(cardJson?.categoryName || cardJson?.name || cardJson?.title || defaults.categoryName || inferCategoryFromFolderName(cardFolderHandle.name, 'Unsorted')).trim() || 'Unsorted';
        const dataType = String(cardJson?.dataType || 'graphicNovels').trim() || 'graphicNovels';
        const bookmarkFolderName = String(cardJson?.bookmarkFolder || 'entries').trim() || 'entries';
        let entriesHandle = await getDirectoryHandleIfExists(cardFolderHandle, bookmarkFolderName);
        if (!entriesHandle && !['entries', 'e'].includes(bookmarkFolderName)) {
            entriesHandle = await getDirectoryHandleByAliases(cardFolderHandle, ['entries', 'e']);
        }
        if (!entriesHandle) entriesHandle = await getDirectoryHandleByAliases(cardFolderHandle, ['entries', 'e']);
        if (!entriesHandle) entriesHandle = cardFolderHandle;

        const links = [];
        const connectionMap = new Map();
        const categoryEntries = [];
        const folderTreeNodes = [];
        const folderTreeSettings = normalizeTreeSettings({ clickBehaviorMode: cardJson?.clickBehaviorMode });
        await parseEntriesDirectory(entriesHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, null);

        const foldersHandle = await getDirectoryHandleByAliases(cardFolderHandle, ['folders', 'f']);
        if (foldersHandle) {
            await parseFolderTree(foldersHandle, workspaceId, categoryName, links, connectionMap, categoryEntries, folderTreeNodes, null);
        }

        const unlinkedPayload = await readJsonFileIfExists(cardFolderHandle, '_library-unlinked.json');
        if (Array.isArray(unlinkedPayload?.entries)) {
            unlinkedPayload.entries.forEach((entry) => categoryEntries.push({ ...(entry || {}) }));
        }
        if (links.length === 0 && folderTreeNodes.length === 0 && categoryEntries.length === 0 && folderTreeSettings.clickBehaviorMode === 'inherit') {
            links.push(makePlaceholderBookmark(workspaceId, categoryName));
        }

        return {
            workspaceId,
            categoryName,
            dataType,
            folderView: cardJson?.libraryFolderView && typeof cardJson.libraryFolderView === 'object'
                ? { ...cardJson.libraryFolderView }
                : null,
            links,
            connections: Array.from(connectionMap.values()),
            categoryEntries,
            folderTree: {
                nodes: folderTreeNodes,
                settings: folderTreeSettings
            }
        };
    }

    async function parseTabFolderHandle(tabFolderHandle, defaults = {}) {
        const tabJson = await readJsonFileIfExists(tabFolderHandle, 'tab.json');
        const workspaceId = String(tabJson?.id || defaults.workspaceId || inferWorkspaceIdFromFolderName(tabFolderHandle.name, 'main')).trim() || 'main';
        const workspaceName = String(tabJson?.name || defaults.workspaceName || workspaceId).trim() || workspaceId;
        const workspaceIcon = tabJson?.icon || defaults.workspaceIcon || 'folder';
        const cardsRoot = await getDirectoryHandleByAliases(tabFolderHandle, ['cards', 'c']);
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
