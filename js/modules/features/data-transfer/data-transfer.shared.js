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
        robustParseJson
    });
    ns.sharedReady = true;
})();
