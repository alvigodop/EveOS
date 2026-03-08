// --- Data Transfer Export Folder Backup Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderBackupHelpers = function createFolderBackupHelpers(deps) {
        const getAppConfig = deps.getAppConfig;
        const getSuggestedBackupFolderName = deps.getSuggestedBackupFolderName;
        const buildScopedBackupFolderName = deps.buildScopedBackupFolderName;
        const getWorkspaceMeta = deps.getWorkspaceMeta;
        const buildFallbackConfig = deps.buildFallbackConfig;
        const writeJsonFileToFolder = deps.writeJsonFileToFolder;
        const writeFallbackMetaFiles = deps.writeFallbackMetaFiles;
        const writeFullStoreFolderBackup = deps.writeFullStoreFolderBackup;
        const sortLinksForExport = deps.sortLinksForExport;
        const buildConnectionMap = deps.buildConnectionMap;
        const getConnectionEntryId = deps.getConnectionEntryId;
        const findLibraryEntryById = deps.findLibraryEntryById;
        const buildCardFolderName = deps.buildCardFolderName;
        const buildWorkspaceFolderName = deps.buildWorkspaceFolderName;
        const buildBookmarkFileName = deps.buildBookmarkFileName;

        async function cleanupPartialFolder(parentHandle, folderName) {
            if (!parentHandle || !folderName || typeof parentHandle.removeEntry !== 'function') return;
            try {
                await parentHandle.removeEntry(folderName, { recursive: true });
            } catch (cleanupError) {
                console.warn('[DataTransfer] Failed to remove partial backup folder:', folderName, cleanupError);
            }
        }

        async function exportFullBackupAsFolder(exportState) {
            if (typeof window.showDirectoryPicker !== 'function') {
                return { ok: false, error: 'Folder export is not supported in this browser.' };
            }

            const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const folderName = getSuggestedBackupFolderName();
            try {
                const backupRoot = await parentHandle.getDirectoryHandle(folderName, { create: true });
                const storeSummary = await writeFullStoreFolderBackup(backupRoot, exportState);
                const manifest = {
                    schema: 'eveos.client-folder-backup.v1',
                    generatedAt: new Date().toISOString(),
                    pageUrl: window.location.href,
                    notes: 'Client folder backup snapshot (full data-pack layout + unified state).',
                    files: {
                        state: 'state/eve_state.json',
                        tabsRoot: 'tabs/'
                    },
                    dataPack: {
                        tabs: Number(storeSummary?.tabsCount || 0),
                        cards: Number(storeSummary?.cardsCount || 0),
                        bookmarks: Number(storeSummary?.bookmarksCount || 0)
                    }
                };
                await writeJsonFileToFolder(backupRoot, 'manifest.json', manifest);

                return {
                    ok: true,
                    folderName,
                    tabsCount: Number(storeSummary?.tabsCount || 0),
                    cardsCount: Number(storeSummary?.cardsCount || 0),
                    bookmarksCount: Number(storeSummary?.bookmarksCount || 0)
                };
            } catch (error) {
                await cleanupPartialFolder(parentHandle, folderName);
                throw error;
            }
        }

        async function exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName) {
            if (typeof window.showDirectoryPicker !== 'function') {
                return { ok: false, error: 'Folder export is not supported in this browser.' };
            }

            const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const folderName = buildScopedBackupFolderName('tab-backup', workspaceName || workspaceId);
            try {
                const rootHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
                const links = sortLinksForExport(workspaceState?.bookmarks?.links || []);
                const categories = workspaceState?.library?.categories || {};
                const connections = workspaceState?.library?.connections || [];
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, workspaceState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(workspaceState?.bookmarks?.config, workspaceMeta);
                const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspaceMeta.name);
                const tabRootPath = `tabs/${workspaceFolder}`;

                const linksByCategory = new Map();
                links.forEach((link) => {
                    const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
                    if (!linksByCategory.has(categoryName)) linksByCategory.set(categoryName, []);
                    linksByCategory.get(categoryName).push({ ...link, workspace: workspaceId, category: categoryName });
                });

                await writeJsonFileToFolder(rootHandle, 'state/workspace-state.json', workspaceState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
                    schema: 'eveos.tab.v1',
                    id: workspaceMeta.id,
                    name: workspaceMeta.name,
                    icon: workspaceMeta.icon,
                    bookmarkCount: links.length,
                    cardCount: linksByCategory.size
                });

                let writtenBookmarks = 0;
                for (const [categoryName, categoryLinks] of linksByCategory.entries()) {
                    const cardFolder = buildCardFolderName(categoryName);
                    const cardRootPath = `${tabRootPath}/cards/${cardFolder}`;
                    await writeJsonFileToFolder(rootHandle, `${cardRootPath}/card.json`, {
                        schema: 'eveos.card.v1',
                        workspaceId,
                        categoryName,
                        title: categoryName,
                        bookmarkFolder: 'entries',
                        bookmarkCount: categoryLinks.length
                    });

                    for (const link of sortLinksForExport(categoryLinks)) {
                        const linkId = String(link?.id || '').trim();
                        const connection = connectionMap.get(linkId) || null;
                        const entryId = getConnectionEntryId(connection);
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
                }

                return {
                    ok: true,
                    folderName,
                    workspaceFolder,
                    cards: linksByCategory.size,
                    bookmarks: writtenBookmarks
                };
            } catch (error) {
                await cleanupPartialFolder(parentHandle, folderName);
                throw error;
            }
        }

        async function exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName) {
            if (typeof window.showDirectoryPicker !== 'function') {
                return { ok: false, error: 'Folder export is not supported in this browser.' };
            }

            const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const folderName = buildScopedBackupFolderName('card-backup', workspaceName || workspaceId, categoryName);
            try {
                const rootHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
                const links = sortLinksForExport(cardState?.bookmarks?.links || []);
                const categories = cardState?.library?.categories || {};
                const connections = cardState?.library?.connections || [];
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, cardState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(cardState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `cards/${cardFolder}`;

                await writeJsonFileToFolder(rootHandle, 'state/card-state.json', cardState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeJsonFileToFolder(rootHandle, `${cardRootPath}/card.json`, {
                    schema: 'eveos.card.v1',
                    workspaceId,
                    categoryName,
                    title: categoryName,
                    bookmarkFolder: 'entries',
                    bookmarkCount: links.length
                });

                let writtenBookmarks = 0;
                for (const link of links) {
                    const linkId = String(link?.id || '').trim();
                    const connection = connectionMap.get(linkId) || null;
                    const entryId = getConnectionEntryId(connection);
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

                return {
                    ok: true,
                    folderName,
                    cardFolder,
                    bookmarks: writtenBookmarks
                };
            } catch (error) {
                await cleanupPartialFolder(parentHandle, folderName);
                throw error;
            }
        }

        return {
            exportFullBackupAsFolder,
            exportWorkspaceFolderFallback,
            exportCardFolderFallback,
            writeFullStoreFolderBackup
        };
    };
})();
