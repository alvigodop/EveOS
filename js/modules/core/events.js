// --- EVENTS & INTERACTION (CLEANED) ---

// --- DRAG & DROP ---
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev, id) {
    const draggedId = String(id);
    const dragIds = (() => {
        const hasBulkSelection = typeof bulkMode !== 'undefined'
            && bulkMode
            && typeof selectedIds !== 'undefined'
            && selectedIds
            && selectedIds.size > 0;

        if (hasBulkSelection && selectedIds.has(draggedId)) {
            return Array.from(selectedIds);
        }
        return [draggedId];
    })();

    const payload = JSON.stringify({ ids: dragIds.map(item => String(item)) });
    ev.dataTransfer.setData("application/json", payload);
    ev.dataTransfer.setData("text/plain", payload);
}

function drop(ev, newCategory) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');

    const rawJson = ev.dataTransfer.getData("application/json") || ev.dataTransfer.getData("text/plain");
    let movedAny = false;
    let dragIds = [];

    let payload = null;
    try {
        payload = JSON.parse(rawJson);
        if (Array.isArray(payload?.ids)) {
            dragIds = payload.ids.map(item => String(item));
        } else if (payload !== null && typeof payload === 'object' && payload.type === 'folder' && payload.id) {
            // Folder Drop Logic
            const targetWorkspace = ev.currentTarget.getAttribute('data-card-workspace') || (window.eveState?.config?.activeWorkspace) || 'main';
            const folderApi = window.EveBookmarkFolders;
            if (folderApi && folderApi.transferFolderToCategory) {
                folderApi.transferFolderToCategory(
                    payload.id,
                    payload.sourceWorkspace,
                    payload.sourceCategory,
                    targetWorkspace,
                    newCategory,
                    '' // Drop on root
                );
                if (typeof window.renderDashboard === 'function') window.renderDashboard();
            }
            return;
        } else if (payload !== null && payload !== undefined) {
            dragIds = [String(payload)];
        }
    } catch (error) {
        if (rawJson) dragIds = [String(rawJson)];
    }

    dragIds.forEach((id) => {
        const targetLinks = window.eveState?.links || (typeof links !== 'undefined' ? links : []);
        const idx = targetLinks.findIndex(l => String(l.id) === String(id));
        if (idx < 0) return;
        if (targetLinks[idx].category === newCategory) return;
        targetLinks[idx].category = newCategory;
        window.EveBookmarkFolders?.clearLinkFolderAssignment?.(targetLinks[idx]);
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(targetLinks[idx].id);
        movedAny = true;
    });

    if (movedAny) {
        if (typeof saveData === 'function') saveData();
    }
}

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (typeof closeModals === 'function') closeModals();
        if (typeof closeAllMenus === 'function') closeAllMenus();
        if (typeof clearFocus === 'function') clearFocus();
        const search = document.getElementById('search');
        if (search) {
            search.value = '';
            search.blur();
        }
        if (typeof renderDashboard === 'function') renderDashboard();
        const sp = document.getElementById('scratchpad-container');
        if (sp) sp.classList.remove('open');
        if (typeof bulkMode !== 'undefined' && bulkMode && typeof toggleBulkMode === 'function') toggleBulkMode();
        return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '/') {
        e.preventDefault();
        const search = document.getElementById('search');
        if (search) search.focus();
    }
    if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (typeof openAddModal === 'function') openAddModal();
    }
});
