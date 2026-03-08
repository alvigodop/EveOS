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

    try {
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed?.ids)) {
            dragIds = parsed.ids.map(item => String(item));
        } else if (parsed !== null && parsed !== undefined) {
            dragIds = [String(parsed)];
        }
    } catch (error) {
        if (rawJson) dragIds = [String(rawJson)];
    }

    dragIds.forEach((id) => {
        const idx = links.findIndex(l => String(l.id) === String(id));
        if (idx < 0) return;
        if (links[idx].category === newCategory) return;
        links[idx].category = newCategory;
        window.EveBookmarkFolders?.clearLinkFolderAssignment?.(links[idx]);
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(links[idx].id);
        movedAny = true;
    });

    if (movedAny) {
        saveData();
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
