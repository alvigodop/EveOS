window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    const {
        getConfig,
        getLinks,
        toBulkId,
        getDatapackIndexApi,
        hasReadableDatapackLinkSnapshot,
        getIndexedRootLinkIds,
        addSelectedIds,
        removeSelectedIds,
        areAllIdsSelected,
        addTouchedScope
    } = ns;

    function _getScopeIndex() {
        const currentLinks = getLinks();
        // Simple generation check â€” rebuild if links array reference changed
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

    function getBookmarkCountForCard(categoryName, workspaceId) {
        const ws = String(workspaceId || '').trim();
        const cat = String(categoryName || 'Unsorted').trim();
        const index = _getScopeIndex();
        const bucket = index.get(ws + '::' + cat);
        return bucket ? bucket.length : 0;
    }

    function getFolderTreeForScope(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders;
        const shared = folderApi?._shared;
        if (!shared || typeof shared.getScopedNodes !== 'function') return [];
        const nodes = shared.getScopedNodes(workspaceId, categoryName) || [];
        if (!Array.isArray(nodes) || nodes.length === 0) return [];

        const childrenMap = new Map();
        nodes.forEach((node) => {
            const parentId = String(node?.parentId || '').trim();
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            childrenMap.get(parentId).push(node);
        });
        childrenMap.forEach((list) => {
            list.sort((a, b) => {
                const oa = Number(a?.order) || 0;
                const ob = Number(b?.order) || 0;
                if (oa !== ob) return oa - ob;
                return String(a?.name || '').localeCompare(String(b?.name || ''));
            });
        });

        function build(parentId) {
            const list = childrenMap.get(String(parentId || '').trim()) || [];
            return list.map((node) => ({
                id: String(node.id || ''),
                name: String(node.name || '').trim() || 'Folder',
                children: build(node.id)
            })).filter((entry) => entry.id);
        }
        return build('');
    }

    function getBookmarkCountForFolder(workspaceId, categoryName, folderId, options = {}) {
        const ws = String(workspaceId || '').trim();
        const cat = String(categoryName || 'Unsorted').trim();
        const targetFolderId = String(folderId || '').trim();
        if (!targetFolderId) return 0;
        const recursive = options.recursive !== false;

        const index = _getScopeIndex();
        const bucket = index.get(ws + '::' + cat) || [];

        if (!recursive) {
            return bucket.filter((link) => String(link?.folderId || '').trim() === targetFolderId).length;
        }

        const folderApi = window.EveBookmarkFolders;
        const shared = folderApi?._shared;
        const nodes = (shared?.getScopedNodes?.(ws, cat) || []);
        const childrenMap = new Map();
        nodes.forEach((node) => {
            const parentId = String(node?.parentId || '').trim();
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            childrenMap.get(parentId).push(node);
        });
        const descendants = new Set([targetFolderId]);
        function collect(id) {
            (childrenMap.get(id) || []).forEach((child) => {
                const cid = String(child?.id || '').trim();
                if (!cid || descendants.has(cid)) return;
                descendants.add(cid);
                collect(cid);
            });
        }
        collect(targetFolderId);

        return bucket.filter((link) => descendants.has(String(link?.folderId || '').trim())).length;
    }

    function getBookmarkCountForWorkspace(workspaceId) {
        const ws = String(workspaceId || '').trim();
        if (!ws) return 0;
        const index = _getScopeIndex();
        let total = 0;
        index.forEach((bucket, key) => {
            const keyWs = String(key).split('::')[0];
            if (keyWs === ws) total += bucket.length;
        });
        return total;
    }

    function getScopeLinkIdsForCard(categoryName, workspaceId) {
        const indexApi = getDatapackIndexApi();
        if (hasReadableDatapackLinkSnapshot(indexApi) && typeof indexApi.getExactBookmarkLinkIds === 'function') {
            return indexApi.getExactBookmarkLinkIds({
                workspaceId: workspaceId,
                categoryName: categoryName
            }).map(toBulkId).filter(Boolean);
        }

        const ws = String(workspaceId || '').trim();
        const cat = String(categoryName || 'Unsorted').trim();
        const key = ws + '::' + cat;
        const index = _getScopeIndex();
        const bucket = index.get(key);
        return bucket ? bucket.map((link) => String(link.id)) : [];
    }

    function getScopeLinkIdsForFolder(categoryName, workspaceId, folderId) {
        const indexApi = getDatapackIndexApi();
        if (hasReadableDatapackLinkSnapshot(indexApi) && typeof indexApi.getExactBookmarkLinkIds === 'function') {
            if (!folderId) {
                return getIndexedRootLinkIds(indexApi, workspaceId, categoryName) || [];
            }
            return indexApi.getExactBookmarkLinkIds({
                workspaceId: workspaceId,
                categoryName: categoryName,
                folderId: folderId
            }).map(toBulkId).filter(Boolean);
        }

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

    // â”€â”€ Debounced bulk UI update â”€â”€
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

    Object.assign(ns, {
        toggleScopeSelection,
        updateBulkUI,
        getScopeLinkIdsForCard,
        getScopeLinkIdsForFolder,
        getBookmarkCountForCard,
        getBookmarkCountForWorkspace,
        getFolderTreeForScope,
        getBookmarkCountForFolder
    });
})();
