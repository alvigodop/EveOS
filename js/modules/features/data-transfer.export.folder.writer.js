// --- Data Transfer Export Folder Writer Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportFolderWriterReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady) {
        console.warn('[DataTransfer] Shared or export utils missing; export folder writers not initialized.');
        return;
    }

    const sanitizePathSegment = ns.sanitizePathSegment;
    const buildWorkspaceFolderName = ns.buildWorkspaceFolderName;
    const buildCardFolderName = ns.buildCardFolderName;
    const buildFallbackConfig = ns.buildFallbackConfig;
    const buildWorkspaceListForFullBackup = ns.buildWorkspaceListForFullBackup;
    const groupLinksByWorkspaceAndCategory = ns.groupLinksByWorkspaceAndCategory;
    const getConnectionEntryId = ns.getConnectionEntryId;
    const findScopedCategoryData = ns.findScopedCategoryData;
    const findLibraryEntryById = ns.findLibraryEntryById;
    const buildConnectionMap = ns.buildConnectionMap;
    const sortLinksForExport = ns.sortLinksForExport;
    const buildBookmarkFileName = ns.buildBookmarkFileName;

    async function writeTextFileToFolder(rootHandle, relativePath, content) {
        const segments = String(relativePath || '')
            .replace(/\\/g, '/')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean);
        if (!segments.length) return;

        let currentHandle = rootHandle;
        for (let i = 0; i < segments.length - 1; i += 1) {
            const dirName = sanitizePathSegment(segments[i], 'folder');
            currentHandle = await currentHandle.getDirectoryHandle(dirName, { create: true });
        }

        const fileName = sanitizePathSegment(segments[segments.length - 1], 'file.txt');
        const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    async function writeJsonFileToFolder(rootHandle, relativePath, payload) {
        await writeTextFileToFolder(rootHandle, relativePath, JSON.stringify(payload, null, 2));
    }

    async function writeStoreMetaFiles(rootHandle, scopedConfig, workspaces, activeWorkspaceId) {
        const workspaceList = Array.isArray(workspaces) && workspaces.length > 0
            ? workspaces.map((ws) => ({
                id: String(ws?.id || '').trim() || 'main',
                name: ws?.name || String(ws?.id || 'main'),
                icon: ws?.icon || 'folder'
            }))
            : [{ id: 'main', name: 'Main', icon: 'folder' }];
        const activeWorkspace = String(activeWorkspaceId || scopedConfig?.activeWorkspace || workspaceList[0]?.id || 'main').trim() || 'main';
        const normalizedConfig = {
            ...(scopedConfig || {}),
            workspaces: workspaceList,
            activeWorkspace
        };
        await writeJsonFileToFolder(rootHandle, '_meta/store.json', {
            format: 'eveos.modular-state.v1',
            version: 1,
            updatedAt: new Date().toISOString(),
            activeWorkspace,
            workspaces: workspaceList
        });
        await writeJsonFileToFolder(rootHandle, '_meta/config.json', normalizedConfig);
        return normalizedConfig;
    }

    async function writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta) {
        return writeStoreMetaFiles(rootHandle, scopedConfig, [workspaceMeta], workspaceMeta.id);
    }

    async function writeScopedCardFolder(rootHandle, cardRootPath, workspaceId, categoryName, links, categories, connectionMap) {
        const sortedLinks = sortLinksForExport(links);
        const scopedLibrary = findScopedCategoryData(categories, workspaceId, categoryName);
        await writeJsonFileToFolder(rootHandle, `${cardRootPath}/card.json`, {
            schema: 'eveos.card.v1',
            workspaceId,
            categoryName,
            title: categoryName,
            dataType: scopedLibrary?.dataType || 'graphicNovels',
            bookmarkFolder: 'entries',
            bookmarkCount: sortedLinks.length
        });

        let writtenBookmarks = 0;
        const usedEntryIds = new Set();
        for (const link of sortedLinks) {
            const linkId = String(link?.id || '').trim();
            const connection = connectionMap.get(linkId) || null;
            const entryId = getConnectionEntryId(connection);
            if (entryId) usedEntryIds.add(String(entryId));
            const libraryEntry = findLibraryEntryById(categories, workspaceId, categoryName, entryId);
            const bookmarkPayload = {
                schema: 'eveos.bookmark.v1',
                bookmark: link,
                library: {
                    linked: !!libraryEntry,
                    connection,
                    entry: libraryEntry || null
                }
            };
            const fileName = buildBookmarkFileName(link, categoryName);
            await writeJsonFileToFolder(rootHandle, `${cardRootPath}/entries/${fileName}`, bookmarkPayload);
            writtenBookmarks += 1;
        }

        const scopedEntries = Array.isArray(scopedLibrary?.entries) ? scopedLibrary.entries : [];
        const unlinkedEntries = scopedEntries.filter((entry) => !usedEntryIds.has(String(entry?.id || '').trim()));
        if (unlinkedEntries.length > 0) {
            await writeJsonFileToFolder(rootHandle, `${cardRootPath}/_library-unlinked.json`, {
                schema: 'eveos.card-library-unlinked.v1',
                workspaceId,
                categoryName,
                entries: unlinkedEntries
            });
        }

        return writtenBookmarks;
    }

    async function writeFullStoreFolderBackup(rootHandle, fullState) {
        const links = sortLinksForExport(fullState?.bookmarks?.links || []);
        const categories = fullState?.library?.categories || {};
        const connections = fullState?.library?.connections || [];
        const config = fullState?.bookmarks?.config || {};
        const workspaces = buildWorkspaceListForFullBackup(fullState);
        const activeWorkspace = String(config.activeWorkspace || workspaces[0]?.id || 'main').trim() || 'main';
        const normalizedConfig = await writeStoreMetaFiles(rootHandle, config, workspaces, activeWorkspace);
        const connectionMap = buildConnectionMap(connections);
        const linksByWorkspace = groupLinksByWorkspaceAndCategory(links, activeWorkspace);

        let tabCount = 0;
        let cardCount = 0;
        let bookmarkCount = 0;

        for (const workspace of workspaces) {
            const workspaceId = String(workspace?.id || '').trim() || 'main';
            const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspace?.name || workspaceId);
            const tabRootPath = `tabs/${workspaceFolder}`;
            const categoryMap = linksByWorkspace.get(workspaceId) || new Map();
            const cardEntries = Array.from(categoryMap.entries());

            await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
                schema: 'eveos.tab.v1',
                id: workspaceId,
                name: workspace?.name || workspaceId,
                icon: workspace?.icon || 'folder',
                bookmarkCount: Array.from(categoryMap.values()).reduce((sum, list) => sum + list.length, 0),
                cardCount: cardEntries.length
            });
            tabCount += 1;

            for (const [categoryName, categoryLinks] of cardEntries) {
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${tabRootPath}/cards/${cardFolder}`;
                const written = await writeScopedCardFolder(
                    rootHandle,
                    cardRootPath,
                    workspaceId,
                    categoryName,
                    categoryLinks,
                    categories,
                    connectionMap
                );
                cardCount += 1;
                bookmarkCount += written;
            }
        }

        await writeJsonFileToFolder(rootHandle, 'state/eve_state.json', {
            ...(fullState || {}),
            bookmarks: {
                ...(fullState?.bookmarks || {}),
                config: normalizedConfig
            }
        });

        return {
            tabsCount: tabCount,
            cardsCount: cardCount,
            bookmarksCount: bookmarkCount
        };
    }

    Object.assign(ns, {
        writeJsonFileToFolder,
        writeStoreMetaFiles,
        writeFallbackMetaFiles,
        writeScopedCardFolder,
        writeFullStoreFolderBackup,
        buildFallbackConfig,
        sortLinksForExport,
        buildConnectionMap,
        getConnectionEntryId,
        findLibraryEntryById,
        buildCardFolderName,
        buildWorkspaceFolderName,
        buildBookmarkFileName
    });
    ns.exportFolderWriterReady = true;
})();
