// --- Data Transfer Export ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportReady) return;
    if (!ns.sharedReady) {
        console.warn('[DataTransfer] Shared helpers missing; export helpers not initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getBookmarkWorkspaceSelect = ns.getBookmarkWorkspaceSelect;
    const getBookmarkCategorySelect = ns.getBookmarkCategorySelect;
    const getBookmarkLinkSelect = ns.getBookmarkLinkSelect;
    const getLayerPathInput = ns.getLayerPathInput;
    function buildWorkspacePayload(workspaceId) {
        const payload = {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Workspace Backup',
                workspaceId,
                type: 'workspace'
            },
            bookmarks: {
                links: [],
                config: {
                    ...getAppConfig(),
                    activeWorkspace: workspaceId
                }
            },
            library: {
                categories: {},
                connections: []
            }
        };
        const allLinks = getAppLinks();
        payload.bookmarks.links = allLinks.filter(entry => entry.workspace === workspaceId);
        return payload;
    }

    function buildCardPayload(workspaceId, categoryName) {
        const payload = buildWorkspacePayload(workspaceId);
        const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        payload.metadata.type = 'card';
        payload.metadata.categoryName = normalizedCategory;
        payload.bookmarks.links = (payload.bookmarks.links || [])
            .filter((entry) => String(entry?.category || 'Unsorted') === normalizedCategory);
        return payload;
    }

    function isLocalhostHost() {
        const host = String(window.location.hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    }

    function sanitizePathSegment(value, fallback = 'item') {
        const cleaned = String(value || '')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .trim();
        return cleaned || fallback;
    }

    function getSuggestedBackupFolderName() {
        const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
        return `eve_backup_${stamp}`;
    }

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

    function slugifyFolderSegment(value, fallback = 'item') {
        const slug = String(value || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || fallback;
    }

    function buildCompactBackupStamp() {
        const now = new Date();
        const pad = (num) => String(num).padStart(2, '0');
        return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    function buildScopedBackupFolderName(scope, ...parts) {
        const safeScope = slugifyFolderSegment(scope || 'backup', 'backup');
        const safeParts = parts
            .map((part) => slugifyFolderSegment(part || '', ''))
            .filter(Boolean)
            .slice(0, 2);
        return [safeScope, ...safeParts, buildCompactBackupStamp()].join('-');
    }

    function buildWorkspaceFolderName(workspaceId, workspaceName) {
        const idPart = slugifyFolderSegment(workspaceId || 'main', 'main');
        const namePart = slugifyFolderSegment(workspaceName || workspaceId || 'main', 'main');
        return idPart === namePart ? idPart : `${idPart}-${namePart}`;
    }

    function buildCardFolderName(categoryName) {
        return slugifyFolderSegment(categoryName || 'unsorted', 'unsorted');
    }

    function buildFallbackConfig(baseConfig, workspaceMeta) {
        const next = { ...(baseConfig || {}) };
        const currentWorkspaces = Array.isArray(next.workspaces) ? next.workspaces : [];
        const filtered = currentWorkspaces.filter((ws) => String(ws?.id || '') !== String(workspaceMeta.id));
        next.workspaces = [...filtered, workspaceMeta];
        next.activeWorkspace = workspaceMeta.id;
        return next;
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

    function buildWorkspaceListForFullBackup(state) {
        const config = state?.bookmarks?.config || {};
        const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
        const activeWorkspace = String(config.activeWorkspace || '').trim();
        const byId = new Map();

        const addWorkspace = (workspace) => {
            const id = String(workspace?.id || '').trim();
            if (!id) return;
            byId.set(id, {
                id,
                name: workspace?.name || id,
                icon: workspace?.icon || 'folder'
            });
        };

        const configured = Array.isArray(config.workspaces) ? config.workspaces : [];
        configured.forEach(addWorkspace);
        links.forEach((link) => {
            const id = String(link?.workspace || activeWorkspace || 'main').trim() || 'main';
            if (!byId.has(id)) {
                byId.set(id, { id, name: id, icon: 'folder' });
            }
        });
        if (activeWorkspace && !byId.has(activeWorkspace)) {
            byId.set(activeWorkspace, { id: activeWorkspace, name: activeWorkspace, icon: 'folder' });
        }
        if (byId.size === 0) {
            byId.set('main', { id: 'main', name: 'Main', icon: 'folder' });
        }
        return Array.from(byId.values());
    }

    function groupLinksByWorkspaceAndCategory(links, fallbackWorkspaceId = 'main') {
        const byWorkspace = new Map();
        (Array.isArray(links) ? links : []).forEach((rawLink) => {
            const workspaceId = String(rawLink?.workspace || fallbackWorkspaceId || 'main').trim() || 'main';
            const categoryName = String(rawLink?.category || 'Unsorted').trim() || 'Unsorted';
            const normalizedLink = { ...rawLink, workspace: workspaceId, category: categoryName };
            if (!byWorkspace.has(workspaceId)) byWorkspace.set(workspaceId, new Map());
            const categories = byWorkspace.get(workspaceId);
            if (!categories.has(categoryName)) categories.set(categoryName, []);
            categories.get(categoryName).push(normalizedLink);
        });
        return byWorkspace;
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

    function getConnectionCategoryName(conn) {
        return conn?.categoryName || conn?.category || conn?.libraryCategory || '';
    }

    function getConnectionEntryId(conn) {
        return conn?.libraryEntryId || conn?.entryId || '';
    }

    function parseScopedCategoryKey(key) {
        const raw = String(key || '').trim();
        if (!raw.includes('::')) {
            return { workspaceId: '', categoryName: raw || 'Unsorted' };
        }
        const [workspaceId, categoryName] = raw.split('::', 2);
        return {
            workspaceId: String(workspaceId || '').trim(),
            categoryName: String(categoryName || '').trim() || 'Unsorted'
        };
    }

    function findScopedCategoryData(allCategories, workspaceId, categoryName) {
        const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
        if (Object.prototype.hasOwnProperty.call(categories, categoryName)) {
            return categories[categoryName] || null;
        }
        for (const [key, value] of Object.entries(categories)) {
            const parsed = parseScopedCategoryKey(key);
            if (String(parsed.categoryName) !== String(categoryName)) continue;
            if (parsed.workspaceId && String(parsed.workspaceId) !== String(workspaceId || '')) continue;
            return value || null;
        }
        return null;
    }

    function findLibraryEntryById(allCategories, workspaceId, categoryName, entryId) {
        const targetId = String(entryId || '').trim();
        if (!targetId) return null;

        const scoped = findScopedCategoryData(allCategories, workspaceId, categoryName);
        const scopedEntries = Array.isArray(scoped?.entries) ? scoped.entries : [];
        const scopedMatch = scopedEntries.find((entry) => String(entry?.id || '').trim() === targetId);
        if (scopedMatch) return scopedMatch;

        const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
        for (const value of Object.values(categories)) {
            const entries = Array.isArray(value?.entries) ? value.entries : [];
            const match = entries.find((entry) => String(entry?.id || '').trim() === targetId);
            if (match) return match;
        }
        return null;
    }

    function buildConnectionMap(connections) {
        const map = new Map();
        (Array.isArray(connections) ? connections : []).forEach((conn) => {
            const linkId = String(conn?.linkId || '').trim();
            if (!linkId) return;
            map.set(linkId, { ...conn });
        });
        return map;
    }

    function sortLinksForExport(links) {
        return (Array.isArray(links) ? links : [])
            .slice()
            .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')));
    }

    function buildBookmarkFileName(link, categoryName) {
        const idPart = sanitizePathSegment(String(link?.id || 'bookmark').slice(0, 40), 'bookmark');
        const cardPart = sanitizePathSegment(String(categoryName || 'uncategorized').slice(0, 60), 'uncategorized');
        const titlePart = sanitizePathSegment(String(link?.title || 'untitled').slice(0, 80), 'untitled');
        return sanitizePathSegment(`${idPart}--${cardPart}--${titlePart}.json`, `${idPart}.json`);
    }

    function getWorkspaceMeta(workspaceId, configOverride) {
        const appConfig = configOverride && typeof configOverride === 'object' ? configOverride : getAppConfig();
        const workspaces = Array.isArray(appConfig.workspaces) ? appConfig.workspaces : [];
        const match = workspaces.find((ws) => String(ws?.id) === String(workspaceId));
        return {
            id: workspaceId,
            name: match?.name || workspaceId,
            icon: match?.icon || '📁'
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

    function downloadWorkspaceBackupJson(workspaceId, workspaceName, exportState) {
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_tab_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_') || workspaceId}.json`;
        a.click();
    }

    function downloadCardBackupJson(workspaceId, workspaceName, categoryName, exportState) {
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_card_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_')}_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        a.click();
    }

    window.exportWorkspaceBackup = async function () {
        const dataStore = getDataStore();
        const select = getWorkspaceSelect();
        const appConfig = getAppConfig();
        const workspaceId = (select?.value || appConfig.activeWorkspace || '').trim();
        if (!workspaceId) {
            return showToast("No workspace selected for export.", "error");
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const modularSync = window.EveDataStore?.ModularSync;
        const workspaceState = dataStore?.captureWorkspace
            ? dataStore.captureWorkspace(workspaceId)
            : buildWorkspacePayload(workspaceId);

        if (modularSync?.backupLayer) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'tab',
                    workspaceId,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Tab folder backup created: ${result.destinationPath}`, "success");
                }
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const folderResult = await exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName);
                if (folderResult?.ok) {
                    return showToast(
                        `Tab folder backup created (${folderResult.cards} cards, ${folderResult.bookmarks} bookmarks).`,
                        'success'
                    );
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return showToast('Tab folder backup canceled.', 'info');
                }
                console.warn('[DataTransfer] Browser tab folder backup failed, falling back to JSON:', error);
            }
        }

        downloadWorkspaceBackupJson(workspaceId, workspaceName, workspaceState);
        showToast("Tab folder export not available. Downloaded tab JSON instead.", "info");
    };

    window.exportCardBackup = async function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        if (!workspaceId || !categoryName) {
            return showToast("Select workspace and card category first.", "error");
        }
        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const modularSync = window.EveDataStore?.ModularSync;
        const cardState = dataStore?.captureCard
            ? dataStore.captureCard(workspaceId, categoryName)
            : buildCardPayload(workspaceId, categoryName);

        if (modularSync?.backupLayer) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'card',
                    workspaceId,
                    categoryName,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Card folder backup created: ${result.destinationPath}`, "success");
                }
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const folderResult = await exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName);
                if (folderResult?.ok) {
                    return showToast(`Card folder backup created (${folderResult.bookmarks} bookmarks).`, 'success');
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return showToast('Card folder backup canceled.', 'info');
                }
                console.warn('[DataTransfer] Browser card folder backup failed, falling back to JSON:', error);
            }
        }

        downloadCardBackupJson(workspaceId, workspaceName, categoryName, cardState);
        showToast("Card folder export not available. Downloaded card JSON instead.", "info");
    };

    window.exportBookmarkBackup = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        const linkId = String(linkSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !linkId) {
            return showToast("Select workspace, category, and bookmark first.", "error");
        }

        const selectedLink = getAppLinks().find(entry => String(entry.id) === linkId);
        const exportState = dataStore?.captureBookmark
            ? dataStore.captureBookmark(workspaceId, categoryName, linkId)
            : null;
        if (!exportState) {
            return showToast("Could not build bookmark backup payload.", "error");
        }

        const workspaceName = appConfig.workspaces?.find(w => w.id === workspaceId)?.name || workspaceId;
        const bookmarkName = (selectedLink?.title || `bookmark_${linkId}`).replace(/[^a-zA-Z0-9]/g, '_');
        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_bookmark_${workspaceName.replace(/[^a-zA-Z0-9]/g, '_')}_${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}_${bookmarkName}.json`;
        a.click();
    };


    Object.assign(ns, {
        isLocalhostHost,
        exportFullBackupAsFolder,
        getWorkspaceMeta
    });
    ns.exportReady = true;
})();
