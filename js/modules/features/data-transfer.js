// --- Data Transfer Module ---
// Handles import/export of backup data
(function () {
    function getDataStore() {
        return window.EveDataStore?.Store || null;
    }

    function getAppConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return {};
    }

    function getAppLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined') return links;
        return [];
    }

    function getWorkspaceSelect() {
        return document.getElementById('tabBackupSelect');
    }

    function getCardWorkspaceSelect() {
        return document.getElementById('cardBackupWorkspaceSelect');
    }

    function getCardCategorySelect() {
        return document.getElementById('cardBackupCategorySelect');
    }

    function getBookmarkWorkspaceSelect() {
        return document.getElementById('bookmarkBackupWorkspaceSelect');
    }

    function getBookmarkCategorySelect() {
        return document.getElementById('bookmarkBackupCategorySelect');
    }

    function getBookmarkLinkSelect() {
        return document.getElementById('bookmarkBackupLinkSelect');
    }

    function getLayerPathInput() {
        return document.getElementById('modularLayerPathInput');
    }

    function refreshCardBackupList() {
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        if (!wsSelect || !categorySelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const activeWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';

        wsSelect.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            wsSelect.appendChild(option);
        });
        wsSelect.value = activeWorkspace;

        const categories = [...new Set(
            allLinks
                .filter(entry => entry.workspace === activeWorkspace)
                .map(entry => entry.category || 'Unsorted')
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
    }

    function refreshBookmarkBackupList() {
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        if (!wsSelect || !categorySelect || !linkSelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const selectedWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';
        const selectedCategory = categorySelect.value || 'Unsorted';
        const selectedLinkId = linkSelect.value || '';

        wsSelect.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            wsSelect.appendChild(option);
        });
        wsSelect.value = selectedWorkspace;

        const categories = [...new Set(
            allLinks
                .filter(entry => entry.workspace === selectedWorkspace)
                .map(entry => entry.category || 'Unsorted')
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
        if (categories.length > 0) {
            categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : categories[0];
        }

        const activeCategory = categorySelect.value || categories[0] || '';
        const bookmarkLinks = allLinks
            .filter(entry => entry.workspace === selectedWorkspace && (entry.category || 'Unsorted') === activeCategory)
            .slice()
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

        linkSelect.innerHTML = '';
        bookmarkLinks.forEach(link => {
            const option = document.createElement('option');
            option.value = String(link.id);
            option.textContent = (link.title || 'Untitled') + (link.url ? ` - ${link.url}` : '');
            linkSelect.appendChild(option);
        });
        if (bookmarkLinks.length > 0) {
            const hasExistingSelection = bookmarkLinks.some(link => String(link.id) === String(selectedLinkId));
            linkSelect.value = hasExistingSelection ? String(selectedLinkId) : String(bookmarkLinks[0].id);
        }
    }

    function refreshWorkspaceBackupList() {
        const select = getWorkspaceSelect();
        if (!select) {
            refreshCardBackupList();
            refreshBookmarkBackupList();
            return;
        }
        const appConfig = getAppConfig();
        const workspaces = appConfig.workspaces || [];
        select.innerHTML = '';
        workspaces.forEach(ws => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            select.appendChild(option);
        });
        select.value = appConfig.activeWorkspace || workspaces[0]?.id || '';
        refreshCardBackupList();
        refreshBookmarkBackupList();
        const cardWsSelect = getCardWorkspaceSelect();
        if (cardWsSelect) {
            cardWsSelect.onchange = refreshCardBackupList;
        }
        const bookmarkWsSelect = getBookmarkWorkspaceSelect();
        const bookmarkCategorySelect = getBookmarkCategorySelect();
        if (bookmarkWsSelect) {
            bookmarkWsSelect.onchange = refreshBookmarkBackupList;
        }
        if (bookmarkCategorySelect) {
            bookmarkCategorySelect.onchange = refreshBookmarkBackupList;
        }
    }

    window.refreshWorkspaceBackupList = refreshWorkspaceBackupList;
    window.refreshCardBackupList = refreshCardBackupList;
    window.refreshBookmarkBackupList = refreshBookmarkBackupList;

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

    async function getDirectoryHandleIfExists(parentHandle, name) {
        try {
            return await parentHandle.getDirectoryHandle(name);
        } catch {
            return null;
        }
    }

    async function getFileHandleIfExists(parentHandle, name) {
        try {
            return await parentHandle.getFileHandle(name);
        } catch {
            return null;
        }
    }

    async function readJsonFromFileHandle(fileHandle) {
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    }

    async function readJsonFileIfExists(parentHandle, name) {
        const fileHandle = await getFileHandleIfExists(parentHandle, name);
        if (!fileHandle) return null;
        try {
            return await readJsonFromFileHandle(fileHandle);
        } catch {
            return null;
        }
    }

    async function listDirectoryEntries(parentHandle) {
        const entries = [];
        for await (const [name, handle] of parentHandle.entries()) {
            entries.push({ name, handle });
        }
        return entries;
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function inferWorkspaceIdFromFolderName(folderName, fallback = 'main') {
        const raw = String(folderName || '').trim();
        if (!raw) return fallback;
        const preHash = raw.split('--')[0] || raw;
        const tokens = preHash.split('-').filter(Boolean);
        if (!tokens.length) return fallback;
        return String(tokens[0]).toLowerCase();
    }

    function inferCategoryFromFolderName(folderName, fallback = 'Unsorted') {
        const raw = String(folderName || '').trim();
        if (!raw) return fallback;
        const preHash = raw.split('--')[0] || raw;
        const normalized = preHash
            .replace(/[_]+/g, '-')
            .replace(/-+/g, ' ')
            .trim();
        if (!normalized) return fallback;
        return normalized
            .split(' ')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    function makePlaceholderBookmark(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const slug = slugifyFolderSegment(cat, 'card');
        return {
            id: `placeholder-${ws}-${slug}`,
            title: `${cat} Placeholder`,
            url: '',
            category: cat,
            workspace: ws,
            notes: 'Auto-generated placeholder for empty card import.',
            tags: ['placeholder'],
            createdAt: new Date().toISOString()
        };
    }

    function addWorkspaceRecord(workspaceMap, workspaceId, workspaceName, workspaceIcon) {
        const id = String(workspaceId || '').trim();
        if (!id) return;
        workspaceMap.set(id, {
            id,
            name: String(workspaceName || id).trim() || id,
            icon: workspaceIcon || 'folder'
        });
    }

    function addCategoryEntries(categoriesMap, workspaceId, categoryName, entries, dataType = 'graphicNovels') {
        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        if (!categoriesMap.has(scopedKey)) {
            categoriesMap.set(scopedKey, {
                dataType: dataType || 'graphicNovels',
                entries: [],
                entryIds: new Set()
            });
        }
        const bucket = categoriesMap.get(scopedKey);
        if (!bucket.dataType) bucket.dataType = dataType || 'graphicNovels';

        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            const normalized = { ...(entry || {}) };
            const entryId = String(normalized.id || '').trim();
            if (entryId) {
                if (bucket.entryIds.has(entryId)) return;
                bucket.entryIds.add(entryId);
            }
            bucket.entries.push(normalized);
        });
    }

    function finalizeCategories(categoriesMap) {
        const categories = {};
        for (const [key, bucket] of categoriesMap.entries()) {
            categories[key] = {
                dataType: bucket.dataType || 'graphicNovels',
                entries: Array.isArray(bucket.entries) ? bucket.entries : []
            };
        }
        return categories;
    }

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

    async function resolveCardFoldersFromRoot(rootHandle) {
        const cardsRoot = await getDirectoryHandleIfExists(rootHandle, 'cards');
        if (cardsRoot) {
            const cardFolders = [];
            const entries = await listDirectoryEntries(cardsRoot);
            entries.forEach(({ handle }) => {
                if (handle.kind === 'directory') cardFolders.push(handle);
            });
            return cardFolders;
        }

        const hasCardFile = !!(await getFileHandleIfExists(rootHandle, 'card.json'));
        const hasEntriesDir = !!(await getDirectoryHandleIfExists(rootHandle, 'entries'));
        if (hasCardFile || hasEntriesDir) {
            return [rootHandle];
        }

        const directCardFolders = [];
        const directEntries = await listDirectoryEntries(rootHandle);
        for (const { handle } of directEntries) {
            if (handle.kind !== 'directory') continue;
            const childHasCard = !!(await getFileHandleIfExists(handle, 'card.json'));
            const childHasEntries = !!(await getDirectoryHandleIfExists(handle, 'entries'));
            if (childHasCard || childHasEntries) {
                directCardFolders.push(handle);
            }
        }
        if (directCardFolders.length > 0) return directCardFolders;

        const tabsRoot = await getDirectoryHandleIfExists(rootHandle, 'tabs');
        if (!tabsRoot) return [];

        const fromTabs = [];
        const tabEntries = await listDirectoryEntries(tabsRoot);
        for (const { handle: tabHandle } of tabEntries) {
            if (tabHandle.kind !== 'directory') continue;
            const tabCardsRoot = await getDirectoryHandleIfExists(tabHandle, 'cards');
            if (!tabCardsRoot) continue;
            const cardEntries = await listDirectoryEntries(tabCardsRoot);
            cardEntries.forEach(({ handle }) => {
                if (handle.kind === 'directory') fromTabs.push(handle);
            });
        }
        return fromTabs;
    }

    async function resolveTabFoldersFromRoot(rootHandle) {
        const tabsRoot = await getDirectoryHandleIfExists(rootHandle, 'tabs');
        if (tabsRoot) {
            const tabFolders = [];
            const entries = await listDirectoryEntries(tabsRoot);
            entries.forEach(({ handle }) => {
                if (handle.kind === 'directory') tabFolders.push(handle);
            });
            return tabFolders;
        }

        const hasTabJson = !!(await getFileHandleIfExists(rootHandle, 'tab.json'));
        if (hasTabJson) {
            return [rootHandle];
        }

        const directEntries = await listDirectoryEntries(rootHandle);
        const directTabs = [];
        for (const { handle } of directEntries) {
            if (handle.kind !== 'directory') continue;
            const childHasTabJson = !!(await getFileHandleIfExists(handle, 'tab.json'));
            const childHasCardsDir = !!(await getDirectoryHandleIfExists(handle, 'cards'));
            if (childHasTabJson || childHasCardsDir) {
                directTabs.push(handle);
            }
        }
        return directTabs;
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

    function buildUnifiedStateFromParsed(parsedTabs, options = {}) {
        const metadataType = options.metadataType || 'store';
        const inputConfig = options.config && typeof options.config === 'object' ? options.config : {};
        const activeWorkspaceFallback = options.activeWorkspace || parsedTabs[0]?.workspaceId || 'main';

        const workspaceMap = new Map();
        const linkMap = new Map();
        const connectionMap = new Map();
        const categoriesMap = new Map();

        parsedTabs.forEach((tab) => {
            addWorkspaceRecord(workspaceMap, tab.workspaceId, tab.workspaceName, tab.workspaceIcon);
            (Array.isArray(tab.parsedCards) ? tab.parsedCards : []).forEach((card) => {
                (Array.isArray(card.links) ? card.links : []).forEach((link) => {
                    const normalized = {
                        ...link,
                        workspace: card.workspaceId,
                        category: card.categoryName
                    };
                    const linkId = String(normalized.id || '').trim();
                    if (!linkId) return;
                    linkMap.set(linkId, normalized);
                });
                (Array.isArray(card.connections) ? card.connections : []).forEach((conn) => {
                    const linkId = String(conn?.linkId || '').trim();
                    if (!linkId) return;
                    connectionMap.set(linkId, {
                        ...conn,
                        linkId,
                        workspace: card.workspaceId,
                        categoryName: conn?.categoryName || card.categoryName
                    });
                });
                addCategoryEntries(
                    categoriesMap,
                    card.workspaceId,
                    card.categoryName,
                    card.categoryEntries,
                    card.dataType || 'graphicNovels'
                );
            });
        });

        const workspaces = workspaceMap.size > 0
            ? Array.from(workspaceMap.values())
            : [{ id: 'main', name: 'Main', icon: 'folder' }];
        const activeWorkspace = String(inputConfig.activeWorkspace || activeWorkspaceFallback || workspaces[0].id).trim() || workspaces[0].id;
        const config = {
            ...inputConfig,
            workspaces,
            activeWorkspace
        };

        return {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Folder Restore',
                type: metadataType
            },
            bookmarks: {
                links: Array.from(linkMap.values()),
                config
            },
            library: {
                categories: finalizeCategories(categoriesMap),
                connections: Array.from(connectionMap.values())
            }
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

    function summarizeStateCounts(state) {
        const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
        const cards = new Set();
        const tabs = new Set();

        links.forEach((link) => {
            const workspaceId = String(link?.workspace || 'main').trim() || 'main';
            const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            tabs.add(workspaceId);
            cards.add(`${workspaceId}::${categoryName}`);
        });

        const configTabs = Array.isArray(state?.bookmarks?.config?.workspaces)
            ? state.bookmarks.config.workspaces.length
            : 0;
        return {
            tabs: Math.max(tabs.size, configTabs),
            cards: cards.size,
            bookmarks: links.length
        };
    }

    function buildParsedTabsFromCards(parsedCards) {
        const tabsByWorkspace = new Map();
        (Array.isArray(parsedCards) ? parsedCards : []).forEach((card) => {
            const workspaceId = String(card?.workspaceId || 'main').trim() || 'main';
            if (!tabsByWorkspace.has(workspaceId)) {
                const meta = getWorkspaceMeta(workspaceId);
                tabsByWorkspace.set(workspaceId, {
                    workspaceId,
                    workspaceName: meta.name || workspaceId,
                    workspaceIcon: meta.icon || 'folder',
                    parsedCards: []
                });
            }
            tabsByWorkspace.get(workspaceId).parsedCards.push(card);
        });
        return Array.from(tabsByWorkspace.values());
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

    async function activateDataPackFolderFromPicker(options = {}) {
        if (typeof window.showDirectoryPicker !== 'function') {
            return { ok: false, error: 'Folder picker is not supported in this browser.' };
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyState) {
            return { ok: false, error: 'Unified state restore is unavailable right now.' };
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            const parsed = await parseAnyDataPackFolder(rootHandle, options);
            const summary = summarizeStateCounts(parsed.state);
            const confirmMessage = options.confirmMessage
                || `Set selected folder as active data pack (${summary.tabs} tabs, ${summary.cards} cards, ${summary.bookmarks} bookmarks)?`;
            if (options.confirm !== false) {
                const confirmed = await showConfirm(confirmMessage);
                if (!confirmed) {
                    return { ok: false, canceled: true };
                }
                if (options.confirmTwice) {
                    const finalConfirmMessage = options.finalConfirmMessage
                        || 'Final confirmation: apply selected data pack now? This overwrites current bookmarks & library.';
                    const finalConfirmed = await showConfirm(finalConfirmMessage);
                    if (!finalConfirmed) {
                        return { ok: false, canceled: true };
                    }
                }
            }

            const applied = !!dataStore.applyState(parsed.state);
            if (!applied) {
                return { ok: false, error: 'Could not apply selected data pack.' };
            }

            return {
                ok: true,
                sourceType: parsed.sourceType,
                summary
            };
        } catch (error) {
            if (error?.name === 'AbortError') {
                return { ok: false, canceled: true };
            }
            return {
                ok: false,
                error: error?.message || String(error)
            };
        }
    }

    async function importFullDataFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyState) {
            return showToast('Unified backup restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore data from selected backup folder? (Overwrites bookmarks & library)'))) {
                return;
            }
            const state = await parseFullStateFromFolder(rootHandle);
            const ok = dataStore.applyState(state);
            if (!ok) return showToast('Folder restore could not be applied.', 'error');
            showToast('Folder backup restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Folder restore canceled.', 'info');
            }
            showToast(`Folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importWorkspaceFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyWorkspaceState) {
            return showToast('Workspace restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore tab from selected folder? (Overwrites selected tab workspace)'))) {
                return;
            }

            const selectedWorkspaceId = String(getWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const tabFolders = await resolveTabFoldersFromRoot(rootHandle);
            if (!tabFolders.length) {
                throw new Error('No tab folder found in selected location.');
            }

            const parsedTabs = [];
            for (const tabFolder of tabFolders) {
                parsedTabs.push(await parseTabFolderHandle(tabFolder, { workspaceId: selectedWorkspaceId }));
            }

            let chosen = parsedTabs.find((tab) => String(tab.workspaceId) === selectedWorkspaceId);
            if (!chosen) chosen = parsedTabs[0];

            const workspaceState = buildUnifiedStateFromParsed([chosen], {
                metadataType: 'workspace',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            workspaceState.metadata.workspaceId = chosen.workspaceId;
            workspaceState.metadata.workspaceName = chosen.workspaceName;
            workspaceState.metadata.type = 'workspace';

            const ok = dataStore.applyWorkspaceState(workspaceState);
            if (!ok) return showToast('Tab folder restore could not be applied.', 'error');
            showToast('Tab folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Tab folder restore canceled.', 'info');
            }
            showToast(`Tab folder restore failed: ${error.message || error}`, 'error');
        }
    }

    async function importCardFromFolderBrowserOnly() {
        if (typeof window.showDirectoryPicker !== 'function') {
            return showToast('Folder restore needs browser directory picker support', 'error');
        }
        const dataStore = getDataStore();
        if (!dataStore?.applyCardState) {
            return showToast('Card restore is unavailable right now.', 'error');
        }

        try {
            const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
            if (!(await showConfirm('Restore card from selected folder? (Overwrites selected workspace/card)'))) {
                return;
            }

            const selectedWorkspaceId = String(getCardWorkspaceSelect()?.value || getAppConfig().activeWorkspace || '').trim() || 'main';
            const selectedCategoryName = String(getCardCategorySelect()?.value || '').trim();
            const cardFolders = await resolveCardFoldersFromRoot(rootHandle);
            if (!cardFolders.length) {
                throw new Error('No card folder found in selected location.');
            }

            const parsedCards = [];
            for (const cardFolder of cardFolders) {
                parsedCards.push(await parseCardFolderHandle(cardFolder, {
                    workspaceId: selectedWorkspaceId,
                    categoryName: selectedCategoryName
                }));
            }

            let chosen = parsedCards.find((card) =>
                String(card.workspaceId) === selectedWorkspaceId
                && String(card.categoryName || '').toLowerCase() === String(selectedCategoryName || '').toLowerCase()
            );
            if (!chosen) {
                chosen = parsedCards.find((card) => String(card.workspaceId) === selectedWorkspaceId) || parsedCards[0];
            }

            const tabLike = {
                workspaceId: chosen.workspaceId,
                workspaceName: getWorkspaceMeta(chosen.workspaceId).name,
                workspaceIcon: getWorkspaceMeta(chosen.workspaceId).icon,
                parsedCards: [chosen]
            };
            const cardState = buildUnifiedStateFromParsed([tabLike], {
                metadataType: 'card',
                config: { activeWorkspace: chosen.workspaceId },
                activeWorkspace: chosen.workspaceId
            });
            cardState.metadata.workspaceId = chosen.workspaceId;
            cardState.metadata.categoryName = chosen.categoryName;
            cardState.metadata.type = 'card';

            const ok = dataStore.applyCardState(cardState);
            if (!ok) return showToast('Card folder restore could not be applied.', 'error');
            showToast('Card folder restored!', 'success');
            location.reload();
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Card folder restore canceled.', 'info');
            }
            showToast(`Card folder restore failed: ${error.message || error}`, 'error');
        }
    }

    window.importDataFolderBrowserOnly = importFullDataFromFolderBrowserOnly;
    window.importWorkspaceFolderBackupBrowserOnly = importWorkspaceFromFolderBrowserOnly;
    window.importCardFolderBackupBrowserOnly = importCardFromFolderBrowserOnly;
    window.activateDataPackFolderFromPicker = activateDataPackFolderFromPicker;

    function resetFileInput(input) {
        if (!input) return;
        input.value = "";
    }

    function setLegacyLinks(nextLinks) {
        if (typeof links !== 'undefined') {
            links = nextLinks;
        } else {
            window.links = nextLinks;
        }
    }

    function setLegacyConfig(nextConfig) {
        if (typeof config !== 'undefined') {
            config = nextConfig;
        } else {
            window.config = nextConfig;
        }
    }

    async function processImportFile(file, input) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const dataStore = getDataStore();

                if (json.metadata && json.bookmarks && json.library) {
                    if (!dataStore?.applyState) {
                        showToast("Unified backup support is unavailable right now.", "error");
                        return;
                    }
                    if (await showConfirm("Restore Unified Backup? (Overwrites bookmarks & library)")) {
                        const applied = dataStore.applyState(json);
                        if (!applied) {
                            showToast("Unified backup could not be applied.", "error");
                            return;
                        }
                        location.reload();
                        showToast("Unified Backup Restored!", "success");
                    }
                } else if (json.links && !json.config) {
                    // Organized Backup (Links only)
                    if (await showConfirm("Restore Organized Backup? (Overwrites Everything)")) {
                        setLegacyLinks(json.links);
                        if (json.date) console.log("Backup Date:", json.date);
                        saveData();
                        location.reload();
                        showToast("Organized Backup Restored!", "success");
                    }
                } else if (json.links && json.config) {
                    // Full Backup
                    if (await showConfirm("Restore Full Backup? (Overwrites Settings & Workspaces)")) {
                        setLegacyLinks(json.links);
                        setLegacyConfig(json.config);
                        saveData();
                        saveConfig();
                        location.reload();
                        showToast("Full Backup Restored!", "success");
                    }
                } else if (Array.isArray(json)) {
                    // Legacy: Raw Array
                    setLegacyLinks(json);
                    saveData();
                    location.reload();
                } else if (json.children || json.title) {
                    showToast("Importing bookmarks structure...", "info");
                } else {
                    showToast("Invalid Backup File", "error");
                }
            } catch (err) {
                showToast("Error importing: " + err.message, "error");
            } finally {
                resetFileInput(input);
            }
        };
        reader.readAsText(file);
    }

    function bindImportInput(input) {
        if (!input || input.dataset.eveImportBound === '1') return;
        input.dataset.eveImportBound = '1';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            processImportFile(file, input);
        });
    }

    window.importData = function (inputOrEvent) {
        const fromEvent = inputOrEvent?.target instanceof HTMLInputElement ? inputOrEvent.target : null;
        const input = inputOrEvent instanceof HTMLInputElement
            ? inputOrEvent
            : fromEvent;

        // Inline onchange="importData(this)" fires after selection; process immediately.
        if (input?.files?.length) {
            processImportFile(input.files[0], input);
            return;
        }

        if (input) {
            bindImportInput(input);
            return;
        }

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json';
        bindImportInput(picker);
        picker.click();
    };

    window.exportData = async function () {
        const dataStore = getDataStore();
        const exportState = dataStore ? dataStore.captureState() : {
            date: new Date().toISOString(),
            config: getAppConfig(),
            links: getAppLinks()
        };

        const canAttemptFolderExport = typeof window.showDirectoryPicker === 'function';
        if (canAttemptFolderExport) {
            try {
                // In localhost server mode, persist latest in-memory state to modular JSON
                // before writing the client-side backup folder snapshot.
                if (isLocalhostHost() && window.EveDataStore?.ModularSync?.syncNow) {
                    await window.EveDataStore.ModularSync.syncNow(true);
                }
                const folderResult = await exportFullBackupAsFolder(exportState);
                if (folderResult?.ok) {
                    const tabsCount = Number(folderResult.tabsCount || 0);
                    const cardsCount = Number(folderResult.cardsCount || 0);
                    const bookmarksCount = Number(folderResult.bookmarksCount || 0);
                    const dataPackSummary = `${tabsCount} tabs, ${cardsCount} cards, ${bookmarksCount} bookmarks`;
                    showToast(`Folder backup created (${dataPackSummary}).`, 'success');
                    return;
                }
                if (folderResult?.error) {
                    showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
                }
            } catch (error) {
                if (error?.name === 'AbortError') {
                    showToast('Folder backup canceled.', 'info');
                    return;
                }
                console.warn('[DataTransfer] Folder backup export failed, using JSON fallback:', error);
                showToast('Folder backup failed. Downloading JSON backup instead.', 'warning');
            }
        }

        const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    };

    window.importWorkspaceBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const isWorkspace = json.metadata?.type === 'workspace';
                const success = isWorkspace && dataStore ? dataStore.applyWorkspaceState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Workspace restored!", "success");
                }
                showToast("Invalid workspace backup", "error");
            } catch (err) {
                showToast("Error importing workspace: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    };

    window.importCardBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const isCard = json.metadata?.type === 'card';
                const success = isCard && dataStore?.applyCardState ? dataStore.applyCardState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Card restored!", "success");
                }
                showToast("Invalid card backup", "error");
            } catch (err) {
                showToast("Error importing card: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    };

    window.importBookmarkBackup = function (inputElement) {
        const dataStore = getDataStore();
        if (!inputElement?.files?.length) return;
        const file = inputElement.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const isBookmark = json.metadata?.type === 'bookmark';
                const success = isBookmark && dataStore?.applyBookmarkState ? dataStore.applyBookmarkState(json) : false;
                if (success) {
                    resetFileInput(inputElement);
                    location.reload();
                    return showToast("Bookmark restored!", "success");
                }
                showToast("Invalid bookmark backup", "error");
            } catch (err) {
                showToast("Error importing bookmark: " + err.message, "error");
            }
        };
        reader.readAsText(file);
    };

    window.triggerWorkspaceImport = function () {
        const input = document.getElementById('importWorkspaceFile');
        if (input) input.click();
    };
})();
