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
        const writeKnowledgeSnapshot = deps.writeKnowledgeSnapshot;
        const filterKnowledgeState = deps.filterKnowledgeState;
        const sortLinksForExport = deps.sortLinksForExport;
        const buildConnectionMap = deps.buildConnectionMap;
        const buildCardFolderName = deps.buildCardFolderName;
        const buildWorkspaceFolderName = deps.buildWorkspaceFolderName;
        const backupDirs = deps.BACKUP_DIRS || {
            meta: '_meta',
            state: 'state',
            tabs: 't',
            cards: 'c',
            folders: 'f',
            entries: 'e'
        };

        // --- ZIP helpers ---
        const zipModules = window.EveDataTransfer.ExportModules;
        function getZipHelpers() {
            if (typeof zipModules.createZipWriter === 'function') {
                return zipModules.createZipWriter({ sanitizePathSegment: deps.sanitizePathSegment || window.EveDataTransfer.sanitizePathSegment });
            }
            return null;
        }

        function canUseZip() {
            return typeof JSZip === 'function' && !!getZipHelpers();
        }

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

        // --- Full backup ---
        async function exportFullBackupAsFolder(exportState) {
            // Try ZIP first (works everywhere)
            if (canUseZip()) {
                const zipHelpers = getZipHelpers();
                const zipHandle = zipHelpers.createZipRootHandle();
                const storeSummary = await writeFullStoreFolderBackup(zipHandle, exportState);
                const manifest = {
                    schema: 'eveos.client-folder-backup.v1',
                    generatedAt: new Date().toISOString(),
                    pageUrl: window.location.href,
                    notes: 'Client folder backup snapshot (full data-pack layout + unified state).',
                    files: {
                        state: `${backupDirs.state}/eve_state.json`,
                        knowledge: `${backupDirs.knowledge}/scoped-storage.json`,
                        tabsRoot: `${backupDirs.tabs}/`
                    },
                    dataPack: {
                        tabs: Number(storeSummary?.tabsCount || 0),
                        cards: Number(storeSummary?.cardsCount || 0),
                        bookmarks: Number(storeSummary?.bookmarksCount || 0)
                    }
                };
                await writeJsonFileToFolder(zipHandle, 'manifest.json', manifest);
                const folderName = getSuggestedBackupFolderName();
                const blob = await zipHandle.generateBlob();
                zipHelpers.downloadBlob(blob, `${folderName}.zip`);
                return {
                    ok: true,
                    folderName,
                    tabsCount: Number(storeSummary?.tabsCount || 0),
                    cardsCount: Number(storeSummary?.cardsCount || 0),
                    bookmarksCount: Number(storeSummary?.bookmarksCount || 0)
                };
            }

            // Fallback: native FS API (showDirectoryPicker)
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
                        state: `${backupDirs.state}/eve_state.json`,
                        knowledge: `${backupDirs.knowledge}/scoped-storage.json`,
                        tabsRoot: `${backupDirs.tabs}/`
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

        // --- Workspace (tab) backup ---
        async function exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName) {
            if (canUseZip()) {
                const zipHelpers = getZipHelpers();
                const zipHandle = zipHelpers.createZipRootHandle();
                const links = sortLinksForExport(workspaceState?.bookmarks?.links || []);
                const categories = workspaceState?.library?.categories || {};
                const connections = workspaceState?.library?.connections || [];
                const folderTrees = workspaceState?.bookmarks?.folders || {};
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, workspaceState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(workspaceState?.bookmarks?.config, workspaceMeta);
                const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspaceMeta.name);
                const tabRootPath = `${backupDirs.tabs}/${workspaceFolder}`;
                const cardEntries = buildWorkspaceCardEntries(workspaceId, links, categories, folderTrees);
                const knowledgeState = filterKnowledgeState(workspaceState?.knowledge, cardEntries.map(([categoryName]) => categoryName));

                await writeJsonFileToFolder(zipHandle, `${backupDirs.state}/workspace-state.json`, workspaceState || {});
                await writeFallbackMetaFiles(zipHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(zipHandle, knowledgeState);
                await writeJsonFileToFolder(zipHandle, `${tabRootPath}/tab.json`, {
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
                    const cardRootPath = `${tabRootPath}/${backupDirs.cards}/${cardFolder}`;
                    writtenBookmarks += await writeScopedCardFolder(
                        zipHandle, cardRootPath, workspaceId, categoryName,
                        categoryLinks, categories, connectionMap, folderTrees
                    );
                }

                const folderName = buildScopedBackupFolderName('tab-backup', workspaceName || workspaceId);
                const blob = await zipHandle.generateBlob();
                zipHelpers.downloadBlob(blob, `${folderName}.zip`);
                return {
                    ok: true,
                    folderName,
                    workspaceFolder,
                    cards: cardEntries.length,
                    bookmarks: writtenBookmarks
                };
            }

            // Fallback: native FS API
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
                const tabRootPath = `${backupDirs.tabs}/${workspaceFolder}`;
                const cardEntries = buildWorkspaceCardEntries(workspaceId, links, categories, folderTrees);
                const knowledgeState = filterKnowledgeState(workspaceState?.knowledge, cardEntries.map(([categoryName]) => categoryName));

                await writeJsonFileToFolder(rootHandle, `${backupDirs.state}/workspace-state.json`, workspaceState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(rootHandle, knowledgeState);
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
                    const cardRootPath = `${tabRootPath}/${backupDirs.cards}/${cardFolder}`;
                    writtenBookmarks += await writeScopedCardFolder(
                        rootHandle, cardRootPath, workspaceId, categoryName,
                        categoryLinks, categories, connectionMap, folderTrees
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

        // --- Card backup ---
        async function exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName) {
            if (canUseZip()) {
                const zipHelpers = getZipHelpers();
                const zipHandle = zipHelpers.createZipRootHandle();
                const links = sortLinksForExport(cardState?.bookmarks?.links || []);
                const categories = cardState?.library?.categories || {};
                const connections = cardState?.library?.connections || [];
                const folderTrees = cardState?.bookmarks?.folders || {};
                const knowledgeState = filterKnowledgeState(cardState?.knowledge, [categoryName]);
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, cardState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(cardState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${backupDirs.cards}/${cardFolder}`;

                await writeJsonFileToFolder(zipHandle, `${backupDirs.state}/card-state.json`, cardState || {});
                await writeFallbackMetaFiles(zipHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(zipHandle, knowledgeState);
                const writtenBookmarks = await writeScopedCardFolder(
                    zipHandle, cardRootPath, workspaceId, categoryName,
                    links, categories, connectionMap, folderTrees
                );

                const folderName = buildScopedBackupFolderName('card-backup', workspaceName || workspaceId, categoryName);
                const blob = await zipHandle.generateBlob();
                zipHelpers.downloadBlob(blob, `${folderName}.zip`);
                return {
                    ok: true,
                    folderName,
                    cardFolder,
                    bookmarks: writtenBookmarks
                };
            }

            // Fallback: native FS API
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
                const knowledgeState = filterKnowledgeState(cardState?.knowledge, [categoryName]);
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, cardState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(cardState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${backupDirs.cards}/${cardFolder}`;

                await writeJsonFileToFolder(rootHandle, `${backupDirs.state}/card-state.json`, cardState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(rootHandle, knowledgeState);
                const writtenBookmarks = await writeScopedCardFolder(
                    rootHandle, cardRootPath, workspaceId, categoryName,
                    links, categories, connectionMap, folderTrees
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

        // --- Folder backup ---
        async function exportFolderFolderFallback(folderState, workspaceId, categoryName, workspaceName) {
            if (canUseZip()) {
                const zipHelpers = getZipHelpers();
                const zipHandle = zipHelpers.createZipRootHandle();
                const links = sortLinksForExport(folderState?.bookmarks?.links || []);
                const categories = folderState?.library?.categories || {};
                const connections = folderState?.library?.connections || [];
                const folderTrees = folderState?.bookmarks?.folders || {};
                const knowledgeState = filterKnowledgeState(folderState?.knowledge, [categoryName]);
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, folderState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(folderState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${backupDirs.cards}/${cardFolder}`;

                await writeJsonFileToFolder(zipHandle, `${backupDirs.state}/folder-state.json`, folderState || {});
                await writeFallbackMetaFiles(zipHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(zipHandle, knowledgeState);
                const writtenBookmarks = await writeScopedCardFolder(
                    zipHandle, cardRootPath, workspaceId, categoryName,
                    links, categories, connectionMap, folderTrees
                );

                const folderName = buildScopedBackupFolderName('folder-backup', workspaceName || workspaceId, categoryName);
                const blob = await zipHandle.generateBlob();
                zipHelpers.downloadBlob(blob, `${folderName}.zip`);
                return {
                    ok: true,
                    folderName,
                    cardFolder,
                    bookmarks: writtenBookmarks
                };
            }

            // Fallback: native FS API
            if (typeof window.showDirectoryPicker !== 'function') {
                return { ok: false, error: 'Folder export is not supported in this browser.' };
            }

            const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const folderName = buildScopedBackupFolderName('folder-backup', workspaceName || workspaceId, categoryName);
            try {
                const rootHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
                const links = sortLinksForExport(folderState?.bookmarks?.links || []);
                const categories = folderState?.library?.categories || {};
                const connections = folderState?.library?.connections || [];
                const folderTrees = folderState?.bookmarks?.folders || {};
                const knowledgeState = filterKnowledgeState(folderState?.knowledge, [categoryName]);
                const connectionMap = buildConnectionMap(connections);
                const workspaceMeta = getWorkspaceMeta(workspaceId, folderState?.bookmarks?.config);
                const scopedConfig = buildFallbackConfig(folderState?.bookmarks?.config, workspaceMeta);
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${backupDirs.cards}/${cardFolder}`;

                await writeJsonFileToFolder(rootHandle, `${backupDirs.state}/folder-state.json`, folderState || {});
                await writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta);
                await writeKnowledgeSnapshot(rootHandle, knowledgeState);
                const writtenBookmarks = await writeScopedCardFolder(
                    rootHandle, cardRootPath, workspaceId, categoryName,
                    links, categories, connectionMap, folderTrees
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
            exportFolderFolderFallback,
            writeFullStoreFolderBackup
        };
    };
})();
