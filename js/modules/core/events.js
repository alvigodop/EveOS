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

function getCategoryCardDragPayload(ev) {
    if (!ev || !ev.dataTransfer) return null;
    var raw = ev.dataTransfer.getData("application/x-eve-category-card")
        || ev.dataTransfer.getData("application/json")
        || ev.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
        var payload = JSON.parse(raw);
        if (!payload || payload.type !== 'category-card') return null;
        var workspaceId = String(payload.workspaceId || '').trim();
        var categoryName = String(payload.categoryName || '').trim();
        if (!workspaceId || !categoryName) return null;
        return {
            type: 'category-card',
            workspaceId,
            categoryName
        };
    } catch (error) {
        return null;
    }
}

function isCategoryCardDragPayload(ev) {
    if (!ev || !ev.dataTransfer) return false;
    var types = Array.from(ev.dataTransfer.types || []);
    return types.includes('application/x-eve-category-card')
        || !!getCategoryCardDragPayload(ev);
}

function dragCategoryCard(ev, workspaceId, categoryName) {
    if (!ev || !ev.dataTransfer) return;
    var payload = {
        type: 'category-card',
        workspaceId: String(workspaceId || '').trim() || 'main',
        categoryName: String(categoryName || '').trim() || 'Unsorted'
    };
    var serialized = JSON.stringify(payload);
    ev.dataTransfer.setData('application/x-eve-category-card', serialized);
    ev.dataTransfer.setData('application/json', serialized);
    ev.dataTransfer.setData('text/plain', serialized);
    ev.dataTransfer.effectAllowed = 'move';
    var target = ev.currentTarget instanceof HTMLElement ? ev.currentTarget : null;
    if (target) target.classList.add('is-card-title-dragging');
}

function endCategoryCardDrag(ev) {
    var target = ev?.currentTarget instanceof HTMLElement ? ev.currentTarget : null;
    if (target) target.classList.remove('is-card-title-dragging');
    document.querySelectorAll('.category-card.card-drop-target, .ws-drop-target-card').forEach(function (node) {
        node.classList.remove('card-drop-target', 'ws-drop-target-card');
    });
}

function dropCategoryCardOnCard(ev, targetWorkspaceId, targetCategoryName) {
    var payload = getCategoryCardDragPayload(ev);
    if (!payload) return false;
    ev.preventDefault();
    ev.stopPropagation();

    var targetWs = String(targetWorkspaceId || '').trim() || 'main';
    var targetCat = String(targetCategoryName || '').trim() || 'Unsorted';
    var sourceWs = String(payload.workspaceId || '').trim() || 'main';
    var sourceCat = String(payload.categoryName || '').trim() || 'Unsorted';

    var card = ev.currentTarget instanceof HTMLElement ? ev.currentTarget.closest('.category-card') : null;
    if (card) card.classList.remove('card-drop-target');

    if (sourceWs === targetWs) {
        if (sourceCat === targetCat) return true;
        var orderApi = window.EveCategoryOrder;
        var order = orderApi && typeof orderApi.getOrder === 'function'
            ? orderApi.getOrder(targetWs, { persist: true })
            : [];
        var targetIndex = Array.isArray(order) ? order.indexOf(targetCat) : -1;
        if (targetIndex < 0 || !orderApi || typeof orderApi.moveCategoryToPosition !== 'function') return true;
        if (orderApi.moveCategoryToPosition(sourceWs, sourceCat, targetIndex + 1)) {
            if (typeof saveConfig === 'function') {
                saveConfig({
                    source: 'category-card-reorder',
                    meta: {
                        workspaceId: targetWs,
                        categoryName: sourceCat,
                        targetCategoryName: targetCat,
                        targetPosition: targetIndex + 1
                    }
                });
            }
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        return true;
    }

    if (typeof window.moveCategoryCardToWorkspace === 'function') {
        window.moveCategoryCardToWorkspace(sourceWs, sourceCat, targetWs, {
            requireConfirm: true,
            targetCategoryName: sourceCat,
            targetPositionCategoryName: targetCat,
            source: 'category-card-dropped-on-card'
        });
    }
    return true;
}

window.getCategoryCardDragPayload = getCategoryCardDragPayload;
window.isCategoryCardDragPayload = isCategoryCardDragPayload;
window.dragCategoryCard = dragCategoryCard;
window.endCategoryCardDrag = endCategoryCardDrag;
window.dropCategoryCardOnCard = dropCategoryCardOnCard;

function drop(ev, newCategory) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');

    if (dropCategoryCardOnCard(ev, ev.currentTarget.getAttribute('data-card-workspace'), newCategory)) {
        return;
    }

    const rawJson = ev.dataTransfer.getData("application/json") || ev.dataTransfer.getData("text/plain");
    let movedAny = false;
    let dragIds = [];
    const targetWorkspace = ev.currentTarget.getAttribute('data-card-workspace') || (window.eveState?.config?.activeWorkspace) || 'main';

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

    const targetLinks = getDropTargetLinks();
    const mergeApi = window.EveBookmarkMerge;
    const movedIds = [];
    const mergedIds = [];
    const removedIds = [];
    dragIds.forEach((id) => {
        const idx = targetLinks.findIndex(l => String(l.id) === String(id));
        if (idx < 0) return;
        const link = targetLinks[idx];
        const currentWorkspace = String(link.workspace || '').trim() || 'main';
        const currentCategory = String(link.category || 'Unsorted').trim() || 'Unsorted';
        const alreadyAtTarget = currentWorkspace === targetWorkspace && currentCategory === newCategory && !String(link.folderId || '').trim();
        if (alreadyAtTarget) return;

        if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
            const result = mergeApi.moveOrMergeLinkToScope(link, {
                workspaceId: targetWorkspace,
                categoryName: newCategory,
                folderId: ''
            }, {
                source: 'bookmark-dropped-to-category',
                links: targetLinks
            });
            if (result?.moved || result?.merged) {
                movedAny = true;
                movedIds.push(String(result.targetId || id));
                if (result.merged) mergedIds.push(String(result.targetId || ''));
                if (Array.isArray(result.removedIds)) removedIds.push(...result.removedIds);
            }
            return;
        }

        link.workspace = targetWorkspace;
        link.category = newCategory;
        window.EveBookmarkFolders?.clearLinkFolderAssignment?.(link);
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
        movedIds.push(String(link.id));
        movedAny = true;
    });

    if (movedAny) {
        setDropTargetLinks(targetLinks);
        if (typeof saveData === 'function') {
            saveData({
                forceRender: true,
                source: 'bookmark-dropped-to-category',
                meta: {
                    workspaceId: targetWorkspace,
                    categoryName: newCategory,
                    linkIds: movedIds.length ? movedIds : dragIds,
                    mergedLinkIds: mergedIds.filter(Boolean),
                    removedLinkIds: removedIds
                }
            });
        }
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
