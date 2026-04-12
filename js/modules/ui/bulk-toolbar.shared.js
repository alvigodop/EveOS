// --- BULK TOOLBAR SHARED STATE ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
var bulkMode = window.bulkMode === true;
var selectedIds = window.selectedIds instanceof Set ? window.selectedIds : new Set();
var bulkLastToggledId = window.bulkLastToggledId ? String(window.bulkLastToggledId) : '';
window.bulkMode = bulkMode;
window.selectedIds = selectedIds;
window.bulkLastToggledId = bulkLastToggledId;

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.sharedReady) return;

    function syncBulkMode(nextValue) {
        bulkMode = !!nextValue;
        window.bulkMode = bulkMode;
        return bulkMode;
    }

    function getLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined' && config) return config;
        return {};
    }

    function toBulkId(value) {
        return String(value);
    }

    function clearSelection() {
        selectedIds.clear();
        window.selectedIds = selectedIds;
        bulkLastToggledId = '';
        window.bulkLastToggledId = bulkLastToggledId;
        return selectedIds;
    }

    function toggleSelectedId(id) {
        const selectedId = toBulkId(id);
        if (selectedIds.has(selectedId)) selectedIds.delete(selectedId);
        else selectedIds.add(selectedId);
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function addSelectedIds(ids) {
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            const selectedId = toBulkId(id);
            if (selectedId) selectedIds.add(selectedId);
        });
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function removeSelectedIds(ids) {
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            const selectedId = toBulkId(id);
            if (selectedId) selectedIds.delete(selectedId);
        });
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function setLastToggledId(id) {
        bulkLastToggledId = toBulkId(id);
        window.bulkLastToggledId = bulkLastToggledId;
        return bulkLastToggledId;
    }

    function getLastToggledId() {
        return bulkLastToggledId ? toBulkId(bulkLastToggledId) : '';
    }

    function getSelectedLinks() {
        return getLinks().filter(link => selectedIds.has(toBulkId(link?.id)));
    }

    function areAllIdsSelected(ids) {
        const normalized = (Array.isArray(ids) ? ids : []).map(toBulkId).filter(Boolean);
        return normalized.length > 0 && normalized.every((id) => selectedIds.has(id));
    }

    // ── Indexed link lookup for fast scope queries ──
    // Pre-index links by workspace::category to avoid O(n) scans on every button update.
    let _scopeIndex = null;
    let _scopeIndexGen = 0;

    function _getScopeIndex() {
        const currentLinks = getLinks();
        // Simple generation check — rebuild if links array reference changed
        if (_scopeIndex && _scopeIndex._ref === currentLinks && _scopeIndex._len === currentLinks.length) {
            return _scopeIndex;
        }
        const index = new Map();
        for (let i = 0; i < currentLinks.length; i++) {
            const link = currentLinks[i];
            const ws = String(link?.workspace || '').trim();
            const cat = String(link?.category || 'Unsorted').trim();
            const key = ws + '::' + cat;
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(link);
        }
        _scopeIndex = index;
        _scopeIndex._ref = currentLinks;
        _scopeIndex._len = currentLinks.length;
        _scopeIndexGen++;
        return index;
    }

    function getScopeLinkIdsForCard(categoryName, workspaceId) {
        const ws = String(workspaceId || '').trim();
        const cat = String(categoryName || 'Unsorted').trim();
        const key = ws + '::' + cat;
        const index = _getScopeIndex();
        const bucket = index.get(key);
        return bucket ? bucket.map((link) => String(link.id)) : [];
    }

    function getScopeLinkIdsForFolder(categoryName, workspaceId, folderId) {
        if (!folderId) {
            const ws = String(workspaceId || '').trim();
            const cat = String(categoryName || 'Unsorted').trim();
            const key = ws + '::' + cat;
            const index = _getScopeIndex();
            const bucket = index.get(key) || [];
            return bucket
                .filter((link) => !String(link?.folderId || '').trim())
                .map((link) => String(link.id));
        }
        const folderApi = window.EveFolderViewV2;
        if (folderApi?.getFolderScopedLinkIds) {
            return folderApi.getFolderScopedLinkIds(workspaceId, categoryName, folderId);
        }
        return [];
    }

    function toggleScopeSelection(ids) {
        const normalized = Array.from(new Set((Array.isArray(ids) ? ids : []).map(toBulkId).filter(Boolean)));
        if (!normalized.length) return selectedIds;
        if (areAllIdsSelected(normalized)) {
            removeSelectedIds(normalized);
        } else {
            addSelectedIds(normalized);
        }
        return selectedIds;
    }

    // ── Debounced bulk UI update ──
    // Coalesce rapid-fire selection changes into a single rAF
    let _bulkUIRafId = 0;

    function updateBulkUI() {
        if (_bulkUIRafId) return; // already pending
        _bulkUIRafId = requestAnimationFrame(_updateBulkUIImmediate);
    }

    function _updateBulkUIImmediate() {
        _bulkUIRafId = 0;
        const el = document.getElementById('bulk-count');
        if (el) el.innerText = `${selectedIds.size} Selected`;
        
        // 1. Update individual checkboxes
        document.querySelectorAll('.bulk-check[data-bulk-id]').forEach((checkbox) => {
            const bulkId = toBulkId(checkbox.getAttribute('data-bulk-id'));
            checkbox.checked = selectedIds.has(bulkId);
        });

        // 2. Update scope toggle buttons (Card/Folder selectors)
        // Pre-build the scope index once for all buttons
        _getScopeIndex();

        document.querySelectorAll('.bulk-scope-btn[data-scope-category]').forEach((btn) => {
            const cat = btn.getAttribute('data-scope-category');
            const ws = btn.getAttribute('data-scope-workspace');
            const fid = btn.getAttribute('data-scope-folder-id'); // null for card root
            
            const scopeIds = fid 
                ? getScopeLinkIdsForFolder(cat, ws, fid)
                : getScopeLinkIdsForCard(cat, ws);
            
            const isFullySelected = areAllIdsSelected(scopeIds);
            const symbol = isFullySelected ? '&#9745;' : '&#9744;';
            
            // Update the symbol part of the button
            if (btn.tagName === 'BUTTON' && btn.childNodes.length > 0) {
                const iconNode = Array.from(btn.childNodes).find(n => n.nodeType === 3 || (n.nodeType === 1 && n.tagName !== 'SPAN'));
                if (iconNode) {
                    if (iconNode.nodeType === 3) iconNode.textContent = isFullySelected ? '\u2611' : '\u2610';
                    else iconNode.innerHTML = symbol;
                } else {
                    btn.innerHTML = symbol + (btn.querySelector('span') ? btn.querySelector('span').outerHTML : '');
                }
            } else {
                btn.innerHTML = symbol;
            }
        });
    }

    function getAllCategoryNames(workspaceId) {
        const scopedWorkspaceId = String(workspaceId || '').trim();
        const scopedLinks = scopedWorkspaceId
            ? getLinks().filter(link => String(link.workspace || '').trim() === scopedWorkspaceId)
            : getLinks();

        const names = [...new Set(
            scopedLinks
                .map(link => String(link.category || 'Unsorted').trim())
                .filter(Boolean)
        )];

        if (!names.includes('Unsorted')) names.push('Unsorted');
        return names.sort((a, b) => a.localeCompare(b));
    }

    function getVisibleDashboardCategoryNames() {
        const grid = document.getElementById('dashboard-grid');
        if (!grid) return [];

        const names = [...new Set(
            Array.from(grid.querySelectorAll('.category-card .category-title'))
                .map(node => String(node.textContent || '').trim())
                .filter(Boolean)
        )];

        return names.sort((a, b) => a.localeCompare(b));
    }

    function escapeBulkMoveHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSelectedCategoryName() {
        const selectedLinks = getSelectedLinks();
        if (!selectedLinks.length) return 'Unsorted';
        return String(selectedLinks[0].category || 'Unsorted').trim() || 'Unsorted';
    }

    function getSelectedWorkspaceForMove() {
        const activeWorkspaceId = String(getConfig()?.activeWorkspace || '').trim();
        if (activeWorkspaceId) return activeWorkspaceId;
        const selectedLink = getSelectedLinks()[0];
        return String(selectedLink?.workspace || '').trim();
    }

    function getWorkspaceList() {
        const list = Array.isArray(getConfig()?.workspaces) ? getConfig().workspaces : [];
        return list
            .map(workspace => ({
                id: String(workspace?.id || ''),
                name: String(workspace?.name || '').trim() || 'Unnamed',
                icon: String(workspace?.icon || '').trim()
            }))
            .filter(workspace => workspace.id);
    }

    function getSelectedWorkspaceId() {
        const selectedLink = getSelectedLinks()[0];
        if (selectedLink?.workspace) return String(selectedLink.workspace);
        return String(getConfig()?.activeWorkspace || getWorkspaceList()[0]?.id || '');
    }

    Object.assign(ns, {
        getBulkMode: function () { return !!bulkMode; },
        setBulkMode: syncBulkMode,
        getSelectedIds: function () { return selectedIds; },
        getLinks,
        getConfig,
        toBulkId,
        clearSelection,
        toggleSelectedId,
        addSelectedIds,
        removeSelectedIds,
        toggleScopeSelection,
        areAllIdsSelected,
        getSelectedLinks,
        setLastToggledId,
        getLastToggledId,
        updateBulkUI,
        getScopeLinkIdsForCard,
        getScopeLinkIdsForFolder,
        getAllCategoryNames,
        getVisibleDashboardCategoryNames,
        escapeBulkMoveHtml,
        getSelectedCategoryName,
        getSelectedWorkspaceForMove,
        getWorkspaceList,
        getSelectedWorkspaceId
    });
    ns.sharedReady = true;
})();
