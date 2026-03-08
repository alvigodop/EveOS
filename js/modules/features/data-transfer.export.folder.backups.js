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
        const writeScopedCardFolder = deps.writeScopedCardFolder;
        const sortLinksForExport = deps.sortLinksForExport;
        const buildConnectionMap = deps.buildConnectionMap;
        const buildCardFolderName = deps.buildCardFolderName;
        const buildWorkspaceFolderName = deps.buildWorkspaceFolderName;

        function parseScopedCategoryKey(scopedKey) {
            const raw = String(scopedKey || '').trim();
            if (!raw) return { workspaceId: 'main', categoryName: 'Unsorted' };
            if (!raw.includes('::')) return { workspaceId: 'main', categoryName: raw };
            const [workspaceId, categoryName] = raw.split('::', 2);
            return {
                workspaceId: String(workspaceId || 'main').trim() || 'main',
                categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
            };
        }

        function buildWorkspaceCardEntries(workspaceId, links, categories, folderTrees) {
            const cards = new Map();
            sortLinksForExport(links || []).forEach((link) => {
                const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
                if (!cards.has(categoryName)) cards.set(categoryName, []);
                cards.get(categoryName).push({ ...link, workspace: workspaceId, category: categoryName });
            });
            Object.keys(categories || {}).forEach((scopedKey) => {
                const parsed = parseScopedCategoryKey(scopedKey);
                if (parsed.workspaceId !== workspaceId) return;
                if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
            });
            Object.keys(folderTrees || {}).forEach((scopedKey) => {
                const parsed = parseScopedCategoryKey(scopedKey);
                if (parsed.workspaceId !== workspaceId) return;
                if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
            });
            return Array.from(cards.entries()).sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
        }

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
                const folderTrees = workspaceState?.bookmarks?.folders || {};
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, workspaceState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(workspaceState?.bookmarks?.config, workspaceMeta);
                const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspaceMeta.name);
                const tabRootPath = `tabs/${workspaceFolder}`;
                const cardEntries = buildWorkspaceCardEntries(workspaceId, links, categories, folderTrees);

                await writeJsonFileToFolder(rootHandle, 'state/workspace-state.json', workspaceState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
                    schema: 'eveos.tab.v1',
                    id: workspaceMeta.id,
                    name: workspaceMeta.name,
                    icon: workspaceMeta.icon,
                    bookmarkCount: links.length,
                    cardCount: cardEntries.length
                });

                let writtenBookmarks = 0;
                for (const [categoryName, categoryLinks] of cardEntries) {
                    const cardFolder = buildCardFolderName(categoryName);
                    const cardRootPath = `${tabRootPath}/cards/${cardFolder}`;
                    writtenBookmarks += await writeScopedCardFolder(
                        rootHandle,
                        cardRootPath,
                        workspaceId,
                        categoryName,
                        categoryLinks,
                        categories,
                        connectionMap,
                        folderTrees
                    );
                }

                return {
                    ok: true,
                    folderName,
                    workspaceFolder,
                    cards: cardEntries.length,
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
                const folderTrees = cardState?.bookmarks?.folders || {};
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, cardState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(cardState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `cards/${cardFolder}`;

                await writeJsonFileToFolder(rootHandle, 'state/card-state.json', cardState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                const writtenBookmarks = await writeScopedCardFolder(
                    rootHandle,
                    cardRootPath,
                    workspaceId,
                    categoryName,
                    links,
                    categories,
                    connectionMap,
                    folderTrees
                );

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
