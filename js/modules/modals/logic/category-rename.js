window.openRenameModal = function (oldName) {
    document.getElementById('oldCatName').value = oldName;
    document.getElementById('renameInput').value = oldName;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
};

function categoryExistsOutsideWorkspace(categoryName, workspaceId) {
    const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
    const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';

    const hasLinkOutsideWorkspace = (Array.isArray(window.links) ? window.links : []).some(function (link) {
        return String(link?.workspace || 'main').trim() !== normalizedWorkspace
            && String(link?.category || 'Unsorted').trim() === normalizedCategory;
    });
    if (hasLinkOutsideWorkspace) return true;

    const folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    return Object.keys(folderStore).some(function (scopedKey) {
        const parts = String(scopedKey || '').split('::');
        const storeWorkspace = String(parts.shift() || 'main').trim() || 'main';
        const storeCategory = String(parts.join('::') || 'Unsorted').trim() || 'Unsorted';
        return storeWorkspace !== normalizedWorkspace && storeCategory === normalizedCategory;
    });
}

window.confirmRename = function () {
    const o = document.getElementById('oldCatName').value;
    const name = document.getElementById('renameInput').value.trim();
    const workspaceId = String(window.ctxWsId || config?.activeWorkspace || 'main').trim() || 'main';
    if (!name) return showToast("Name required", "warning");
    if (name && name !== o) {
        links.forEach(l => {
            if (String(l?.workspace || 'main').trim() !== workspaceId) return;
            if (String(l?.category || 'Unsorted').trim() !== String(o || 'Unsorted').trim()) return;
            l.category = name;
            window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(l.id);
        });
        if (window.EveBookmarkFolders?.renameCategoryScope) {
            window.EveBookmarkFolders.renameCategoryScope(workspaceId, o, name);
        } else {
            window.EveBookmarkFolders?.renameCategoryEverywhere?.(o, name);
        }
        if (window.EveCategoryOrder?.renameCategory) {
            window.EveCategoryOrder.renameCategory(workspaceId, o, name);
        } else if (window.EveCategoryOrder?.renameCategoryEverywhere) {
            window.EveCategoryOrder.renameCategoryEverywhere(o, name);
        } else {
            const idx = config.categoryOrder.indexOf(o);
            if (idx > -1) config.categoryOrder[idx] = name;
        }
        if (window.EveBookmarkFolders?.renameCardTaskScope) {
            window.EveBookmarkFolders.renameCardTaskScope(workspaceId, o, name);
        } else if (config.hideStats.includes(o) && !categoryExistsOutsideWorkspace(o, workspaceId)) {
            config.hideStats = config.hideStats.filter(c => c !== o);
            config.hideStats.push(name);
        }
        saveConfig();
        saveData();
    }
    closeModals();
};

window.handleRenameEnter = function (e) { if (e.key === 'Enter') confirmRename(); };
