// --- EVENTS & INTERACTION (CLEANED) ---

const SITE_KEYBOARD_SHORTCUTS = Object.freeze([
    { keys: '/', description: 'Focus the main search field', scope: 'Global' },
    { keys: 'Shift+Enter', description: 'Open Expanded search mode for the current query', scope: 'Search field' },
    { keys: 'N', description: 'Open the Add Link modal', scope: 'Global' },
    { keys: 'Alt+B', description: 'Toggle Select mode', scope: 'Global' },
    { keys: 'Escape', description: 'Close open modals and menus, clear search focus, and exit Select mode', scope: 'Global' }
]);

window.EveKeyboardShortcuts = window.EveKeyboardShortcuts || {};
window.EveKeyboardShortcuts.list = SITE_KEYBOARD_SHORTCUTS.map((entry) => ({ ...entry }));

function getDropTargetLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function setDropTargetLinks(nextLinks) {
    if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
    if (window.eveState) window.eveState.links = nextLinks;
    window.links = nextLinks;
    if (typeof links !== 'undefined') links = nextLinks;
    return nextLinks;
}

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
        } else if (payload !== null && typeof payload === 'object' && payload.type === 'detached-link' && payload.entryId && payload.linkId) {
            const targetWorkspace = ev.currentTarget.getAttribute('data-card-workspace') || (window.eveState?.config?.activeWorkspace) || 'main';
            const restored = window.EveConstellationMap?._detached?.restoreDetachedLinks?.(
                payload.entryId,
                [payload.linkId],
                {
                    workspaceId: targetWorkspace,
                    categoryName: newCategory,
                    folderId: ''
                }
            );
            if (restored && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        } else if (payload !== null && typeof payload === 'object' && payload.type === 'detached-folder' && payload.entryId) {
            const targetWorkspace = ev.currentTarget.getAttribute('data-card-workspace') || (window.eveState?.config?.activeWorkspace) || 'main';
            const restored = window.EveConstellationMap?._detached?.restoreDetachedEntry?.(
                payload.entryId,
                {
                    workspaceId: targetWorkspace,
                    categoryName: newCategory,
                    targetParentId: ''
                }
            );
            if (restored && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
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
        const targetLinks = getDropTargetLinks();
        const idx = targetLinks.findIndex(l => String(l.id) === String(id));
        if (idx < 0) return;
        if (targetLinks[idx].category === newCategory) return;
        targetLinks[idx].category = newCategory;
        window.EveBookmarkFolders?.clearLinkFolderAssignment?.(targetLinks[idx]);
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(targetLinks[idx].id);
        movedAny = true;
    });

    if (movedAny) {
        setDropTargetLinks(getDropTargetLinks());
        if (typeof saveData === 'function') saveData({ forceRender: true });
    }
}

// --- KEYBOARD SHORTCUTS ---
function isEditableKeyboardTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tagName = String(target.tagName || '').toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    return !!target.closest('[contenteditable="true"]');
}

document.addEventListener('keydown', (e) => {
    const keyboardTarget = e.target instanceof HTMLElement ? e.target : document.activeElement;

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
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (typeof toggleBulkMode === 'function') toggleBulkMode();
        return;
    }
    if (isEditableKeyboardTarget(keyboardTarget)) return;
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
