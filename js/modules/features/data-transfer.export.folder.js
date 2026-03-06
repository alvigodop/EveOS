// --- Data Transfer Export Folder Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportFolderReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady || !ns.exportFolderWriterReady) {
        console.warn('[DataTransfer] Shared, export utils, or folder writers missing; export folder helpers not initialized.');
        return;
    }

    const getAppConfig = ns.getAppConfig;
    const getLayerPathInput = ns.getLayerPathInput;
    const getSuggestedBackupFolderName = ns.getSuggestedBackupFolderName;
    const buildScopedBackupFolderName = ns.buildScopedBackupFolderName;
    const getWorkspaceMeta = ns.getWorkspaceMeta;
    const buildFallbackConfig = ns.buildFallbackConfig;
    const writeJsonFileToFolder = ns.writeJsonFileToFolder;
    const writeFallbackMetaFiles = ns.writeFallbackMetaFiles;
    const writeFullStoreFolderBackup = ns.writeFullStoreFolderBackup;
    const sortLinksForExport = ns.sortLinksForExport;
    const buildConnectionMap = ns.buildConnectionMap;
    const getConnectionEntryId = ns.getConnectionEntryId;
    const findLibraryEntryById = ns.findLibraryEntryById;
    const buildCardFolderName = ns.buildCardFolderName;
    const buildWorkspaceFolderName = ns.buildWorkspaceFolderName;
    const buildBookmarkFileName = ns.buildBookmarkFileName;

    async function exportFullBackupAsFolder(exportState) {
        if (typeof window.showDirectoryPicker !== 'function') {
            return { ok: false, error: 'Folder export is not supported in this browser.' };
        }

        const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const folderName = getSuggestedBackupFolderName();
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
    }

    async function exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName) {
        if (typeof window.showDirectoryPicker !== 'function') {
            return { ok: false, error: 'Folder export is not supported in this browser.' };
        }

        const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const folderName = buildScopedBackupFolderName('tab-backup', workspaceName || workspaceId);
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

        await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
        await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
            schema: 'eveos.tab.v1',
            id: workspaceMeta.id,
            name: workspaceMeta.name,
            icon: workspaceMeta.icon,
            bookmarkCount: links.length,
            cardCount: linksByCategory.size
        });
        await writeJsonFileToFolder(rootHandle, 'state/workspace-state.json', workspaceState || {});

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
    }

    async function exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName) {
        if (typeof window.showDirectoryPicker !== 'function') {
            return { ok: false, error: 'Folder export is not supported in this browser.' };
        }

        const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const folderName = buildScopedBackupFolderName('card-backup', workspaceName || workspaceId, categoryName);
        const rootHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
        const links = sortLinksForExport(cardState?.bookmarks?.links || []);
        const categories = cardState?.library?.categories || {};
        const connections = cardState?.library?.connections || [];
        const connectionMap = buildConnectionMap(connections);
        const workspaceMeta = getWorkspaceMeta(workspaceId, cardState?.bookmarks?.config);
        const scopedConfig = buildFallbackConfig(cardState?.bookmarks?.config, workspaceMeta);
        const cardFolder = buildCardFolderName(categoryName);
        const cardRootPath = `cards/${cardFolder}`;

        await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
        await writeJsonFileToFolder(rootHandle, `${cardRootPath}/card.json`, {
            schema: 'eveos.card.v1',
            workspaceId,
            categoryName,
            title: categoryName,
            bookmarkFolder: 'entries',
            bookmarkCount: links.length
        });
        await writeJsonFileToFolder(rootHandle, 'state/card-state.json', cardState || {});

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
    }

    function getLayerDestinationPath() {
        const inputValue = String(getLayerPathInput()?.value || '').trim();
        if (inputValue) return inputValue;
        return String(getAppConfig().modularLayerPath || '').trim();
    }

    async function requireLayerDestinationPath() {
        const modularSync = window.EveDataStore?.ModularSync;
        if (modularSync?.pickFolderPath) {
            try {
                const initialPath = getLayerDestinationPath() || String(getAppConfig().modularLayerPath || '').trim();
                const picked = await modularSync.pickFolderPath(initialPath);
                if (picked?.ok && !picked.canceled && picked.path) {
                    persistLayerDestinationPath(picked.path);
                    return picked.path;
                }
                if (picked?.ok && picked.canceled) {
                    showToast('Backup canceled: folder not selected.', 'info');
                    return '';
                }
            } catch (error) {
                console.warn('[DataTransfer] Could not open folder picker for layer path:', error);
            }
        }

        const path = getLayerDestinationPath();
        if (path) return path;
        showToast('Set Folder Path in Copy Between Packs (Advanced) before running server folder backups.', 'warning');
        return '';
    }

    function persistLayerDestinationPath(nextPath) {
        const value = String(nextPath || '').trim();
        if (!value) return;
        const input = getLayerPathInput();
        if (input) input.value = value;
        const appConfig = getAppConfig();
        if (appConfig && typeof appConfig === 'object') {
            appConfig.modularLayerPath = value;
        }
        if (typeof saveConfig === 'function') {
            saveConfig();
        }
    }

    Object.assign(ns, {
        exportFullBackupAsFolder,
        exportWorkspaceFolderFallback,
        exportCardFolderFallback,
        getLayerDestinationPath,
        requireLayerDestinationPath,
        persistLayerDestinationPath,
        writeFullStoreFolderBackup
    });
    ns.exportFolderReady = true;
})();
