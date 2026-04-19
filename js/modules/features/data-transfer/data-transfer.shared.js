// --- Data Transfer Shared ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.sharedReady) return;
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

    function getBookmarkLocationSelect() {
        return document.getElementById('bookmarkBackupLocationSelect');
    }

    function getFolderWorkspaceSelect() {
        return document.getElementById('folderBackupWorkspaceSelect');
    }

    function getFolderCategorySelect() {
        return document.getElementById('folderBackupCategorySelect');
    }

    function getFolderSelect() {
        return document.getElementById('folderBackupFolderSelect');
    }

    function getLayerPathInput() {
        return document.getElementById('modularLayerPathInput');
    }

    function isHttpContext() {
        return /^https?:$/i.test(window.location.protocol || '');
    }

    function canUseServerFolderBackups(modularSync = window.EveDataStore?.ModularSync) {
        return isHttpContext() && typeof modularSync?.backupLayer === 'function';
    }

    function buildBookmarkLocationValue(folderId) {
        const normalizedFolderId = String(folderId || '').trim();
        return normalizedFolderId ? `folder:${normalizedFolderId}` : 'root';
    }

    function parseBookmarkLocationValue(value) {
        const rawValue = String(value || '').trim();
        if (rawValue.startsWith('folder:')) {
            return {
                mode: 'folder',
                folderId: rawValue.slice('folder:'.length).trim()
            };
        }
        return {
            mode: 'root',
            folderId: ''
        };
    }

    function getBookmarkFolderNodesForScope(workspaceId, categoryName) {
        const stateModule = window.EveLibrary?.State;
        if (!stateModule?.getBookmarkFolderNodes) return [];
        const nodes = stateModule.getBookmarkFolderNodes(categoryName, workspaceId);
        return Array.isArray(nodes) ? nodes.map((node) => ({ ...(node || {}) })) : [];
    }

    function getBookmarkFolderScopedKeys() {
        const store = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
        return store && typeof store === 'object' ? Object.keys(store) : [];
    }

    function buildFolderOptionLabel(node, nodeById) {
        const parts = [];
        let current = node && typeof node === 'object' ? node : null;
        let guard = 0;
        while (current && guard < 20) {
            parts.unshift(String(current.name || current.title || current.id || 'Folder').trim() || 'Folder');
            const parentId = String(current.parentId || '').trim();
            current = parentId ? (nodeById.get(parentId) || null) : null;
            guard += 1;
        }
        return parts.join(' / ') || String(node?.id || 'Folder');
    }

    function populateFolderSelect(folderSelect, workspaceId, categoryName, selectedFolderId) {
        if (!folderSelect) return;
        const nodes = getBookmarkFolderNodesForScope(workspaceId, categoryName);
        const nodeById = new Map(nodes.map((node) => [String(node?.id || '').trim(), node]));
        folderSelect.innerHTML = '';
        nodes
            .slice()
            .sort((a, b) => buildFolderOptionLabel(a, nodeById).localeCompare(buildFolderOptionLabel(b, nodeById)))
            .forEach((node) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) return;
                const option = document.createElement('option');
                option.value = nodeId;
                option.textContent = buildFolderOptionLabel(node, nodeById);
                folderSelect.appendChild(option);
            });
        if (nodes.length > 0) {
            const hasSelected = nodes.some((node) => String(node?.id || '').trim() === String(selectedFolderId || '').trim());
            folderSelect.value = hasSelected ? String(selectedFolderId || '').trim() : String(nodes[0]?.id || '').trim();
        }
    }

    function populateBookmarkLocationSelect(locationSelect, workspaceId, categoryName, selectedValue) {
        if (!locationSelect) return buildBookmarkLocationValue('');
        const nodes = getBookmarkFolderNodesForScope(workspaceId, categoryName);
        const nodeById = new Map(nodes.map((node) => [String(node?.id || '').trim(), node]));
        const normalizedSelectedValue = String(selectedValue || '').trim() || buildBookmarkLocationValue('');
        locationSelect.innerHTML = '';

        const rootOption = document.createElement('option');
        rootOption.value = buildBookmarkLocationValue('');
        rootOption.textContent = 'Root Bookmarks Only';
        locationSelect.appendChild(rootOption);

        nodes
            .slice()
            .sort((a, b) => buildFolderOptionLabel(a, nodeById).localeCompare(buildFolderOptionLabel(b, nodeById)))
            .forEach((node) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) return;
                const option = document.createElement('option');
                option.value = buildBookmarkLocationValue(nodeId);
                option.textContent = `Folder: ${buildFolderOptionLabel(node, nodeById)}`;
                locationSelect.appendChild(option);
            });

        const hasSelected = Array.from(locationSelect.options).some((option) => option.value === normalizedSelectedValue);
        locationSelect.value = hasSelected ? normalizedSelectedValue : buildBookmarkLocationValue('');
        return locationSelect.value;
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
            []
                .concat(
                    allLinks
                        .filter(entry => entry.workspace === activeWorkspace)
                        .map(entry => entry.category || 'Unsorted')
                )
                .concat(
                    getBookmarkFolderScopedKeys()
                        .map((key) => String(key || '').split('::'))
                        .filter((parts) => String(parts[0] || 'main') === String(activeWorkspace))
                        .map((parts) => parts.slice(1).join('::') || 'Unsorted')
                )
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '<option value="">(Create New Card)</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
        categorySelect.value = '';
    }

    function refreshBookmarkBackupList() {
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const locationSelect = getBookmarkLocationSelect();
        const linkSelect = getBookmarkLinkSelect();
        if (!wsSelect || !categorySelect || !locationSelect || !linkSelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const selectedWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';
        const selectedCategory = categorySelect.value || 'Unsorted';
        const selectedLocation = locationSelect.value || buildBookmarkLocationValue('');
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
        const activeLocationValue = populateBookmarkLocationSelect(
            locationSelect,
            selectedWorkspace,
            activeCategory,
            selectedLocation
        );
        const { folderId: activeFolderId } = parseBookmarkLocationValue(activeLocationValue);
        const bookmarkLinks = allLinks
            .filter(entry => (
                entry.workspace === selectedWorkspace
                && (entry.category || 'Unsorted') === activeCategory
                && String(entry.folderId || '').trim() === activeFolderId
            ))
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

    function refreshFolderBackupList() {
        const wsSelect = getFolderWorkspaceSelect();
        const categorySelect = getFolderCategorySelect();
        const folderSelect = getFolderSelect();
        if (!wsSelect || !categorySelect || !folderSelect) return;

        const appConfig = getAppConfig();
        const allLinks = getAppLinks();
        const workspaces = appConfig.workspaces || [];
        const selectedWorkspace = wsSelect.value || appConfig.activeWorkspace || workspaces[0]?.id || '';
        const selectedCategory = categorySelect.value || 'Unsorted';
        const selectedFolderId = folderSelect.value || '';

        wsSelect.innerHTML = '';
        workspaces.forEach((ws) => {
            const option = document.createElement('option');
            option.value = ws.id;
            option.textContent = ws.name || ws.id;
            wsSelect.appendChild(option);
        });
        wsSelect.value = selectedWorkspace;

        const categories = [...new Set(
            []
                .concat(
                    allLinks
                        .filter((entry) => entry.workspace === selectedWorkspace)
                        .map((entry) => entry.category || 'Unsorted')
                )
                .concat(
                    getBookmarkFolderScopedKeys()
                        .map((key) => String(key || '').split('::'))
                        .filter((parts) => String(parts[0] || 'main') === String(selectedWorkspace))
                        .map((parts) => parts.slice(1).join('::') || 'Unsorted')
                )
        )].sort((a, b) => a.localeCompare(b));

        categorySelect.innerHTML = '';
        categories.forEach((cat) => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
        if (categories.length > 0) {
            categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : categories[0];
        }

        populateFolderSelect(folderSelect, selectedWorkspace, categorySelect.value || categories[0] || '', selectedFolderId);
    }

    function refreshWorkspaceBackupList() {
        const select = getWorkspaceSelect();
        if (!select) {
            refreshCardBackupList();
            refreshBookmarkBackupList();
            refreshFolderBackupList();
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
        refreshFolderBackupList();
        const cardWsSelect = getCardWorkspaceSelect();
        if (cardWsSelect) {
            cardWsSelect.onchange = refreshCardBackupList;
        }
        const bookmarkWsSelect = getBookmarkWorkspaceSelect();
        const bookmarkCategorySelect = getBookmarkCategorySelect();
        const bookmarkLocationSelect = getBookmarkLocationSelect();
        if (bookmarkWsSelect) {
            bookmarkWsSelect.onchange = refreshBookmarkBackupList;
        }
        if (bookmarkCategorySelect) {
            bookmarkCategorySelect.onchange = refreshBookmarkBackupList;
        }
        if (bookmarkLocationSelect) {
            bookmarkLocationSelect.onchange = refreshBookmarkBackupList;
        }
        const folderWsSelect = getFolderWorkspaceSelect();
        const folderCategorySelect = getFolderCategorySelect();
        if (folderWsSelect) {
            folderWsSelect.onchange = refreshFolderBackupList;
        }
        if (folderCategorySelect) {
            folderCategorySelect.onchange = refreshFolderBackupList;
        }
    }

    window.refreshWorkspaceBackupList = refreshWorkspaceBackupList;
    window.refreshCardBackupList = refreshCardBackupList;
    window.refreshBookmarkBackupList = refreshBookmarkBackupList;
    window.refreshFolderBackupList = refreshFolderBackupList;

    function robustParseJson(text) {
        if (typeof text !== 'string') return null;
        try {
            return JSON.parse(text);
        } catch (err) {
            try {
                // Attempt to repair common "dirty" JSON issues
                // 1. Remove trailing commas in arrays/objects
                let repaired = text.replace(/,(\s*[\]}])/g, '$1');
                return JSON.parse(repaired);
            } catch (innerErr) {
                throw err;
            }
        }
    }

    async function persistRestoredState(options = {}) {
        const skipRender = options.skipRender !== false;
        const skipSuggestions = options.skipSuggestions !== false;
        if (typeof window.saveData === 'function') {
            await Promise.resolve(window.saveData({
                immediate: true,
                skipRender,
                skipSuggestions
            }));
        }
        if (typeof window.saveConfig === 'function') {
            await Promise.resolve(window.saveConfig({ immediate: true }));
        }

        const config = getAppConfig();
        const shouldSyncModular = options.syncModular !== false
            && isHttpContext()
            && config?.modularStateSyncEnabled !== false
            && typeof window.EveDataStore?.ModularSync?.syncNow === 'function';
        if (shouldSyncModular) {
            const result = await window.EveDataStore.ModularSync.syncNow(true);
            if (result?.ok === false) {
                return {
                    ok: false,
                    error: result.error || 'Failed to sync restored state to the active data pack.'
                };
            }
        }

        return { ok: true };
    }

    async function persistAndReloadAfterRestore(options = {}) {
        const persisted = await persistRestoredState(options);
        if (!persisted?.ok) return persisted;

        const reloadUrl = String(options.reloadUrl || '').trim();
        if (reloadUrl) {
            window.location.href = reloadUrl;
            return { ok: true, reloaded: true, reloadUrl };
        }

        location.reload();
        return { ok: true, reloaded: true };
    }

    function cloneStructuredData(value, fallbackValue = null) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return fallbackValue;
        }
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        if (window.EveLibrary?.State?.buildScopedCategoryKey) {
            return window.EveLibrary.State.buildScopedCategoryKey(categoryName, workspaceId);
        }
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function parseScopedCategoryKey(value) {
        const raw = String(value || '').trim();
        if (!raw) return { workspaceId: 'main', categoryName: 'Unsorted' };
        const pivot = raw.indexOf('::');
        if (pivot < 0) {
            return {
                workspaceId: 'main',
                categoryName: raw || 'Unsorted'
            };
        }
        return {
            workspaceId: String(raw.slice(0, pivot) || 'main').trim() || 'main',
            categoryName: String(raw.slice(pivot + 2) || 'Unsorted').trim() || 'Unsorted'
        };
    }

    function buildCardTargetId(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function parseCardTargetId(value) {
        return parseScopedCategoryKey(value);
    }

    function buildFolderTargetId(workspaceId, categoryName, folderId) {
        const base = buildCardTargetId(workspaceId, categoryName);
        const normalizedFolderId = String(folderId || '').trim();
        return normalizedFolderId ? `${base}::${normalizedFolderId}` : base;
    }

    function parseFolderTargetId(value) {
        const raw = String(value || '').trim();
        if (!raw) {
            return {
                workspaceId: 'main',
                categoryName: 'Unsorted',
                folderId: ''
            };
        }
        const firstPivot = raw.indexOf('::');
        if (firstPivot < 0) {
            return {
                workspaceId: 'main',
                categoryName: 'Unsorted',
                folderId: raw
            };
        }
        const workspaceId = String(raw.slice(0, firstPivot) || 'main').trim() || 'main';
        const remainder = raw.slice(firstPivot + 2);
        const secondPivot = remainder.indexOf('::');
        if (secondPivot < 0) {
            return {
                workspaceId,
                categoryName: String(remainder || 'Unsorted').trim() || 'Unsorted',
                folderId: ''
            };
        }
        return {
            workspaceId,
            categoryName: String(remainder.slice(0, secondPivot) || 'Unsorted').trim() || 'Unsorted',
            folderId: String(remainder.slice(secondPivot + 2) || '').trim()
        };
    }

    function getStateBookmarks(state) {
        return state?.bookmarks && typeof state.bookmarks === 'object'
            ? state.bookmarks
            : {};
    }

    function getStateLibrary(state) {
        return state?.library && typeof state.library === 'object'
            ? state.library
            : {};
    }

    function getFirstStoreEntry(store) {
        const entries = store && typeof store === 'object' ? Object.entries(store) : [];
        return entries.length > 0 ? entries[0] : [null, null];
    }

    function inferRestoreScope(state) {
        const metadata = state?.metadata && typeof state.metadata === 'object' ? state.metadata : {};
        const bookmarks = getStateBookmarks(state);
        const library = getStateLibrary(state);
        const links = Array.isArray(bookmarks.links) ? bookmarks.links : [];
        const firstLink = links[0] || null;
        const workspaceId = String(
            metadata.workspaceId
            || bookmarks.config?.activeWorkspace
            || firstLink?.workspace
            || ''
        ).trim();
        const categoryName = String(
            metadata.categoryName
            || firstLink?.category
            || ''
        ).trim();
        if (workspaceId || categoryName) {
            return {
                workspaceId: workspaceId || 'main',
                categoryName: categoryName || 'Unsorted'
            };
        }
        const [folderKey] = getFirstStoreEntry(bookmarks.folders);
        if (folderKey) return parseScopedCategoryKey(folderKey);
        const [libraryKey] = getFirstStoreEntry(library.categories);
        if (libraryKey) return parseScopedCategoryKey(libraryKey);
        return { workspaceId: 'main', categoryName: 'Unsorted' };
    }

    function getTreeNodes(tree) {
        if (Array.isArray(tree?.nodes)) {
            return tree.nodes.map((node) => ({ ...(node || {}) }));
        }
        if (Array.isArray(tree)) {
            return tree.map((node) => ({ ...(node || {}) }));
        }
        return [];
    }

    function getRootFolderIdFromTree(tree) {
        const nodes = getTreeNodes(tree);
        const rootNode = nodes.find((node) => !String(node?.parentId || '').trim()) || nodes[0] || null;
        return String(rootNode?.id || '').trim();
    }

    function remapCategoryOrderByWorkspace(orderStore, sourceWorkspaceId, targetWorkspaceId) {
        if (!orderStore || typeof orderStore !== 'object') return {};
        const nextOrderStore = cloneStructuredData(orderStore, {});
        if (!sourceWorkspaceId || sourceWorkspaceId === targetWorkspaceId) return nextOrderStore;
        if (Object.prototype.hasOwnProperty.call(nextOrderStore, sourceWorkspaceId)) {
            nextOrderStore[targetWorkspaceId] = cloneStructuredData(nextOrderStore[sourceWorkspaceId], nextOrderStore[sourceWorkspaceId]);
            delete nextOrderStore[sourceWorkspaceId];
        }
        return nextOrderStore;
    }

    function remapScopedBuckets(store, options = {}) {
        const sourceWorkspaceId = String(options.sourceWorkspaceId || '').trim() || 'main';
        const targetWorkspaceId = String(options.targetWorkspaceId || '').trim() || sourceWorkspaceId;
        const sourceCategoryName = String(options.sourceCategoryName || '').trim();
        const targetCategoryName = String(options.targetCategoryName || '').trim() || sourceCategoryName || 'Unsorted';
        const nextStore = {};
        Object.entries(store && typeof store === 'object' ? store : {}).forEach(([key, value]) => {
            const parsed = parseScopedCategoryKey(key);
            const nextWorkspaceId = parsed.workspaceId === sourceWorkspaceId ? targetWorkspaceId : parsed.workspaceId;
            const nextCategoryName = sourceCategoryName && parsed.categoryName === sourceCategoryName
                ? targetCategoryName
                : parsed.categoryName;
            nextStore[buildScopedCategoryKey(nextWorkspaceId, nextCategoryName)] = cloneStructuredData(value, value);
        });
        return nextStore;
    }

    function remapQuickPinsForRestore(pins, options = {}) {
        const sourceWorkspaceId = String(options.sourceWorkspaceId || '').trim();
        const targetWorkspaceId = String(options.targetWorkspaceId || '').trim() || sourceWorkspaceId || 'main';
        const sourceCategoryName = String(options.sourceCategoryName || '').trim();
        const targetCategoryName = String(options.targetCategoryName || '').trim() || sourceCategoryName || 'Unsorted';
        const sourceRootFolderId = String(options.sourceRootFolderId || '').trim();
        const targetRootFolderId = String(options.targetRootFolderId || '').trim() || sourceRootFolderId;
        return (Array.isArray(pins) ? pins : []).map((rawPin) => {
            const pin = { ...(rawPin || {}) };
            const targetType = String(pin?.targetType || '').trim().toLowerCase();
            if (targetType === 'card') {
                const parsedTarget = parseCardTargetId(pin.targetId);
                if (
                    (!sourceWorkspaceId || parsedTarget.workspaceId === sourceWorkspaceId)
                    && (!sourceCategoryName || parsedTarget.categoryName === sourceCategoryName)
                ) {
                    pin.targetId = buildCardTargetId(targetWorkspaceId, targetCategoryName);
                }
                return pin;
            }
            if (targetType === 'folder') {
                const parsedTarget = parseFolderTargetId(pin.targetId);
                if (
                    (!sourceWorkspaceId || parsedTarget.workspaceId === sourceWorkspaceId)
                    && (!sourceCategoryName || parsedTarget.categoryName === sourceCategoryName)
                ) {
                    const nextFolderId = sourceRootFolderId && targetRootFolderId && parsedTarget.folderId === sourceRootFolderId
                        ? targetRootFolderId
                        : parsedTarget.folderId;
                    pin.targetId = buildFolderTargetId(targetWorkspaceId, targetCategoryName, nextFolderId);
                }
                return pin;
            }
            return pin;
        });
    }

    function remapWorkspaceStateForRestore(state, targetWorkspaceId) {
        const nextState = cloneStructuredData(state, null);
        if (!nextState || typeof nextState !== 'object') return null;
        const sourceScope = inferRestoreScope(nextState);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const nextWorkspaceId = String(targetWorkspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const bookmarks = getStateBookmarks(nextState);
        const library = getStateLibrary(nextState);

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            type: 'workspace'
        };
        nextState.bookmarks = {
            ...bookmarks,
            links: (Array.isArray(bookmarks.links) ? bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId
            })),
            config: {
                ...(bookmarks.config || {}),
                activeWorkspace: nextWorkspaceId
            },
            folders: remapScopedBuckets(bookmarks.folders, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            }),
            pins: remapQuickPinsForRestore(bookmarks.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            })
        };
        if (bookmarks.config?.categoryOrderByWorkspace && typeof bookmarks.config.categoryOrderByWorkspace === 'object') {
            nextState.bookmarks.config.categoryOrderByWorkspace = remapCategoryOrderByWorkspace(
                bookmarks.config.categoryOrderByWorkspace,
                sourceWorkspaceId,
                nextWorkspaceId
            );
        }
        nextState.library = {
            ...library,
            categories: remapScopedBuckets(library.categories, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId
            }),
            connections: (Array.isArray(library.connections) ? library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId
            }))
        };
        return nextState;
    }

    function remapCardStateForRestore(state, options = {}) {
        const nextState = cloneStructuredData(state, null);
        if (!nextState || typeof nextState !== 'object') return null;
        const sourceScope = inferRestoreScope(nextState);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const sourceCategoryName = String(sourceScope.categoryName || 'Unsorted').trim() || 'Unsorted';
        const nextWorkspaceId = String(options.workspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const requestedCategoryName = String(options.categoryName || '').trim();
        const shouldCreateUniqueCategory = !!options.createUniqueCategory && (!requestedCategoryName || requestedCategoryName === 'Unsorted');
        const nextCategoryName = shouldCreateUniqueCategory
            ? getUniqueCategoryName(nextWorkspaceId, sourceCategoryName || 'Restored Card')
            : (requestedCategoryName || sourceCategoryName || 'Unsorted');
        const bookmarks = getStateBookmarks(nextState);
        const library = getStateLibrary(nextState);

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            categoryName: nextCategoryName,
            type: 'card'
        };
        nextState.bookmarks = {
            ...bookmarks,
            links: (Array.isArray(bookmarks.links) ? bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId,
                category: nextCategoryName
            })),
            config: {
                ...(bookmarks.config || {}),
                activeWorkspace: nextWorkspaceId
            },
            folders: remapScopedBuckets(bookmarks.folders, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            }),
            pins: remapQuickPinsForRestore(bookmarks.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            })
        };
        nextState.library = {
            ...library,
            categories: remapScopedBuckets(library.categories, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName
            }),
            connections: (Array.isArray(library.connections) ? library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId,
                categoryName: nextCategoryName
            }))
        };
        return nextState;
    }

    function remapFolderStateForRestore(state, options = {}) {
        const sourceScope = inferRestoreScope(state);
        const sourceWorkspaceId = String(sourceScope.workspaceId || 'main').trim() || 'main';
        const sourceCategoryName = String(sourceScope.categoryName || 'Unsorted').trim() || 'Unsorted';
        const sourceScopedKey = buildScopedCategoryKey(sourceWorkspaceId, sourceCategoryName);
        const sourceTree = getStateBookmarks(state).folders?.[sourceScopedKey] || getFirstStoreEntry(getStateBookmarks(state).folders)[1];
        const sourceRootFolderId = String(
            state?.metadata?.folderId
            || getRootFolderIdFromTree(sourceTree)
            || ''
        ).trim();
        const nextState = remapCardStateForRestore(state, {
            workspaceId: options.workspaceId,
            categoryName: options.categoryName,
            createUniqueCategory: false
        });
        if (!nextState) return null;

        const nextWorkspaceId = String(nextState.metadata?.workspaceId || sourceWorkspaceId).trim() || sourceWorkspaceId;
        const nextCategoryName = String(nextState.metadata?.categoryName || sourceCategoryName).trim() || sourceCategoryName;
        const nextScopedKey = buildScopedCategoryKey(nextWorkspaceId, nextCategoryName);
        const nextRootFolderId = String(options.folderId || sourceRootFolderId).trim() || sourceRootFolderId;
        const nextTreeStore = cloneStructuredData(nextState.bookmarks?.folders, {});
        const nextTree = nextTreeStore?.[nextScopedKey];
        const nextTreeNodes = getTreeNodes(nextTree);

        if (sourceRootFolderId && nextRootFolderId && sourceRootFolderId !== nextRootFolderId) {
            nextTreeNodes.forEach((node) => {
                if (String(node?.id || '').trim() === sourceRootFolderId) {
                    node.id = nextRootFolderId;
                }
                if (String(node?.parentId || '').trim() === sourceRootFolderId) {
                    node.parentId = nextRootFolderId;
                }
            });
        }

        if (nextTree && typeof nextTree === 'object' && !Array.isArray(nextTree)) {
            nextTreeStore[nextScopedKey] = { ...nextTree, nodes: nextTreeNodes };
        } else if (nextTreeNodes.length > 0) {
            nextTreeStore[nextScopedKey] = { nodes: nextTreeNodes };
        }

        nextState.metadata = {
            ...(nextState.metadata || {}),
            workspaceId: nextWorkspaceId,
            categoryName: nextCategoryName,
            folderId: nextRootFolderId,
            type: 'folder'
        };
        nextState.bookmarks = {
            ...(nextState.bookmarks || {}),
            folders: nextTreeStore,
            links: (Array.isArray(nextState.bookmarks?.links) ? nextState.bookmarks.links : []).map((link) => ({
                ...(link || {}),
                workspace: nextWorkspaceId,
                category: nextCategoryName,
                folderId: sourceRootFolderId && nextRootFolderId && String(link?.folderId || '').trim() === sourceRootFolderId
                    ? nextRootFolderId
                    : link?.folderId
            })),
            pins: remapQuickPinsForRestore(nextState.bookmarks?.pins, {
                sourceWorkspaceId,
                targetWorkspaceId: nextWorkspaceId,
                sourceCategoryName,
                targetCategoryName: nextCategoryName,
                sourceRootFolderId,
                targetRootFolderId: nextRootFolderId
            })
        };
        nextState.library = {
            ...(nextState.library || {}),
            connections: (Array.isArray(nextState.library?.connections) ? nextState.library.connections : []).map((connection) => ({
                ...(connection || {}),
                workspace: nextWorkspaceId,
                categoryName: nextCategoryName
            }))
        };
        return nextState;
    }

    function getUniqueCategoryName(workspaceId, baseName) {
        const wsId = String(workspaceId || 'main').trim() || 'main';
        const name = String(baseName || 'Restored Card').trim() || 'Restored Card';
        
        // Get existing categories from the order system if available
        const order = window.EveCategoryOrder?.getOrder?.(wsId) || [];
        if (order.length === 0) {
            // Fallback: Check links directly
            const links = window.links || window.eveState?.links || [];
            links.forEach(l => {
                if (String(l.workspace) === wsId && l.category && !order.includes(l.category)) {
                    order.push(l.category);
                }
            });
        }

        if (!order.includes(name)) return name;

        let counter = 1;
        while (order.includes(`${name} (${counter})`)) {
            counter++;
        }
        return `${name} (${counter})`;
    }

    Object.assign(ns, {
        getDataStore,
        getAppConfig,
        getAppLinks,
        getWorkspaceSelect,
        getCardWorkspaceSelect,
        getCardCategorySelect,
        getBookmarkWorkspaceSelect,
        getBookmarkCategorySelect,
        getBookmarkLinkSelect,
        getBookmarkLocationSelect,
        getFolderWorkspaceSelect,
        getFolderCategorySelect,
        getFolderSelect,
        getLayerPathInput,
        isHttpContext,
        canUseServerFolderBackups,
        buildBookmarkLocationValue,
        parseBookmarkLocationValue,
        getBookmarkFolderNodesForScope,
        getBookmarkFolderScopedKeys,
        buildFolderOptionLabel,
        populateFolderSelect,
        populateBookmarkLocationSelect,
        refreshCardBackupList,
        refreshBookmarkBackupList,
        refreshFolderBackupList,
        refreshWorkspaceBackupList,
        persistRestoredState,
        persistAndReloadAfterRestore,
        cloneStructuredData,
        buildScopedCategoryKey,
        parseScopedCategoryKey,
        buildCardTargetId,
        parseCardTargetId,
        buildFolderTargetId,
        parseFolderTargetId,
        remapWorkspaceStateForRestore,
        remapCardStateForRestore,
        remapFolderStateForRestore,
        robustParseJson,
        getUniqueCategoryName
    });
    ns.sharedReady = true;
})();
