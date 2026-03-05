// --- Data Transfer Folder Import ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importReady) return;
    if (!ns.sharedReady || !ns.exportReady) {
        console.warn('[DataTransfer] Shared helpers or export helpers missing; folder import helpers not initialized.');
        return;
    }
    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getWorkspaceMeta = ns.getWorkspaceMeta;
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

    Object.assign(ns, {
        parseAnyDataPackFolder,
        activateDataPackFolderFromPicker,
        importFullDataFromFolderBrowserOnly,
        importWorkspaceFromFolderBrowserOnly,
        importCardFromFolderBrowserOnly
    });
    ns.importReady = true;
})();
