// --- EVENTS & INTERACTION (CLEANED) ---

// --- DRAG & DROP ---
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev, id) {
    ev.dataTransfer.setData("text/plain", id);
}

function drop(ev, newCategory) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    const id = ev.dataTransfer.getData("text/plain");
    const idx = links.findIndex(l => l.id == id);
    if (idx > -1) {
        links[idx].category = newCategory;
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(links[idx].id);
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
