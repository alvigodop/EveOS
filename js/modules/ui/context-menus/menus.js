window.initContextMenus = function () {
    if (!document.getElementById('link-context-menu')) {
        document.body.insertAdjacentHTML('beforeend', window.ContextMenus.template);
    }
};

// Global State for Context Menus
window.ctxLinkId = null;
window.ctxCatName = null;
window.ctxWsId = null;
window.ctxSidebarGroupId = '';
window.ctxFolderId = null;

window.closeAllMenus = function () {
    document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
};

const ICON_LIBRARY_HTML = '&#128218;';

function placeContextMenu(menuElement, event) {
    if (!menuElement || !event) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 6;

    const baseX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const baseY = Number.isFinite(event.clientY) ? event.clientY : 0;

    menuElement.style.left = '0px';
    menuElement.style.top = '0px';
    menuElement.style.visibility = 'hidden';
    menuElement.style.display = 'block';

    const rect = menuElement.getBoundingClientRect();
    const menuWidth = rect.width || 180;
    const menuHeight = rect.height || 220;

    let x = baseX + gap;
    let y = baseY + gap;

    if (x + menuWidth > viewportWidth - 8) x = Math.max(8, viewportWidth - menuWidth - 8);
    if (y + menuHeight > viewportHeight - 8) y = Math.max(8, viewportHeight - menuHeight - 8);

    menuElement.style.left = `${x}px`;
    menuElement.style.top = `${y}px`;
    menuElement.style.visibility = 'visible';
}

window.showFolderContextMenu = function (e, categoryName, folderId, workspaceId) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    window.ctxCatName = categoryName;
    window.ctxFolderId = folderId;
    window.ctxWsId = workspaceId || window.ctxWsId || ((window.config && window.config.activeWorkspace) || 'main');

    const m = document.getElementById('folder-context-menu');
    if (!m) return;

    const statsFoldersEl = document.getElementById('ctx-folder-stats-folders');
    const statsItemsEl = document.getElementById('ctx-folder-stats-items');
    
    if (statsFoldersEl && statsItemsEl) {
        // Show placeholder immediately, compute stats after menu paints
        statsFoldersEl.textContent = 'Overall Folders: …';
        statsItemsEl.textContent = 'Overall Items: …';

        // setTimeout(50) instead of rAF — ensures menu paints BEFORE stats compute
        setTimeout(function () {
            let totalItems = 0;
            let totalFolders = 0;

            // Fast path: use cached viewModel from the last dashboard render
            var cachedVM = window.EveFolderViewV2 && window.EveFolderViewV2.getCachedViewModel
                ? window.EveFolderViewV2.getCachedViewModel(window.ctxWsId, window.ctxCatName)
                : null;

            if (cachedVM && cachedVM.childrenMap && cachedVM.folderLinks) {
                // Count from cached viewModel — no link scanning needed
                (function recurseCount(fId) {
                    var items = cachedVM.folderLinks.get(fId) || [];
                    totalItems += items.length;
                    var children = cachedVM.childrenMap.get(fId) || [];
                    totalFolders += children.length;
                    children.forEach(function (child) { recurseCount(child.id); });
                })(folderId);
            } else if (window.EveBookmarkFolders) {
                // Slow fallback: build viewModel (with skipGhosts)
                var folderScopeShared = window.EveFolderViewV2 && window.EveFolderViewV2._shared ? window.EveFolderViewV2._shared : {};
                var folderLinks = typeof folderScopeShared.getCategoryLinks === 'function'
                    ? folderScopeShared.getCategoryLinks(window.ctxWsId, window.ctxCatName)
                    : (window.getModalLinks ? window.getModalLinks().filter(function (l) { return l.workspace === window.ctxWsId && l.category === window.ctxCatName; }) : []);
                var viewModel = window.EveBookmarkFolders.buildFolderView(window.ctxWsId, window.ctxCatName, folderLinks, { skipGhosts: true });
                (function recurseCount(fId) {
                    var items = viewModel.folderLinks.get(fId) || [];
                    totalItems += items.length;
                    var children = viewModel.childrenMap.get(fId) || [];
                    totalFolders += children.length;
                    children.forEach(function (child) { recurseCount(child.id); });
                })(folderId);
            }

            statsFoldersEl.textContent = 'Overall Folders: ' + totalFolders;
            statsItemsEl.textContent = 'Overall Items: ' + totalItems;
        }, 50);
    }

    placeContextMenu(m, e);
};

window.showLinkContextMenu = function (e, id) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    const normalizedId = String(id ?? '');
    if (!normalizedId) return;
    ctxLinkId = normalizedId;

    const m = document.getElementById('link-context-menu');
    if (!m) return;

    const action = m.querySelector('#ctx-library-action');
    const pinAction = m.querySelector('#ctx-pin-action');
    const pinScopeTab = m.querySelector('#ctx-pin-scope-tab');
    const pinScopeCard = m.querySelector('#ctx-pin-scope-card');
    const pinScopeFolder = m.querySelector('#ctx-pin-scope-folder');
    const doneAction = m.querySelector('#ctx-toggle-done-action');
    const link = window.EveContextMenuActions?.getCtxLink?.()
        || (typeof links !== 'undefined' && Array.isArray(links)
            ? links.find(function (item) { return String(item?.id ?? '') === normalizedId; }) || null
            : null);
    const linked = !!window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId?.(normalizedId);
    const pinApi = window.EveQuickPins;
    const isPinned = !!pinApi?.isBookmarkPinned?.(normalizedId);
    const selectedScope = pinApi?.getBookmarkScopeType?.(normalizedId) || 'tab';
    const scopeOptions = pinApi?.getBookmarkScopeOptions?.(link) || [];
    const allowedScopes = new Set(scopeOptions.map((option) => option.value));
    if (action) {
        action.innerHTML = linked
            ? `${ICON_LIBRARY_HTML} Remove From Library`
            : `${ICON_LIBRARY_HTML} Add To Library`;
    }
    if (pinAction) {
        const defaultScope = pinApi?.resolveDefaultBookmarkScopeType?.(link) || 'tab';
        const scopeLabel = defaultScope === 'folder' ? 'Pin To Folder' : (defaultScope === 'card' ? 'Pin To Card' : 'Pin To Tab');
        pinAction.innerHTML = isPinned ? '&#128204; Unpin' : `&#128204; ${scopeLabel}`;
    }
    if (pinScopeTab) {
        pinScopeTab.style.display = isPinned && allowedScopes.has('tab') ? '' : 'none';
        pinScopeTab.innerHTML = `${selectedScope === 'tab' ? '&#10003; ' : ''}&#128204; Pin Scope: This Tab`;
    }
    if (pinScopeCard) {
        pinScopeCard.style.display = isPinned && allowedScopes.has('card') ? '' : 'none';
        pinScopeCard.innerHTML = `${selectedScope === 'card' ? '&#10003; ' : ''}&#128204; Pin Scope: This Card`;
    }
    if (pinScopeFolder) {
        pinScopeFolder.style.display = isPinned && allowedScopes.has('folder') ? '' : 'none';
        pinScopeFolder.innerHTML = `${selectedScope === 'folder' ? '&#10003; ' : ''}&#128204; Pin Scope: This Folder`;
    }
    if (doneAction) {
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(link)
            : true;
        doneAction.style.display = isTaskEnabled ? '' : 'none';
        doneAction.innerHTML = `&#10004; ${link?.done ? 'Mark Pending' : 'Mark Done'}`;
    }

    placeContextMenu(m, e);
};

window.showCategoryContextMenu = function (e, name, workspaceId) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    ctxCatName = name;
    ctxWsId = String(workspaceId || (window.config && window.config.activeWorkspace) || window.ctxWsId || 'main');
    const m = document.getElementById('cat-context-menu');
    if (!m) return;

    const detachedMenuHtml = window.EveDetachedDashboardCard?.buildDetachedContextMenuHtml?.(name, ctxWsId) || '';
    if (detachedMenuHtml) {
        m.innerHTML = detachedMenuHtml;
        placeContextMenu(m, e);
        return;
    }

    const safeName = String(name || '').replace(/'/g, "\\'");
    const customOrderApi = window.EveCustomOrder;
    const coWsId = String((window.config && window.config.activeWorkspace) || 'main');
    const coEnabled = customOrderApi ? customOrderApi.isEnabled(coWsId, name) : false;
    const coSortMode = customOrderApi ? customOrderApi.getSortMode(coWsId, name) : 'none';
    const coToggleLabel = coEnabled ? '&#128202; Custom Numbering ✓' : '&#128202; Custom Numbering';
    const coSortLabel = coSortMode === 'asc' ? '&#128260; Sort: Ascending' : (coSortMode === 'desc' ? '&#128261; Sort: Descending' : '&#128256; Sort: None');
    const tvApi = window.EveTrueValue;
    const tvEnabled = tvApi ? tvApi.isEnabled(coWsId, name) : false;
    const tvToggleLabel = tvEnabled ? '📐 True Value Sort ✓' : '📐 True Value Sort';

    const safeHtmlName = String(name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const safeHtmlWs = String(coWsId || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    m.innerHTML = `
        <div class="ctx-item" data-ws="${safeHtmlWs}" data-cat="${safeHtmlName}" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(this.dataset.ws, this.dataset.cat)">&#127756; Constellation Map</div>
        <div class="ctx-item" data-cat="${safeHtmlName}" onclick="openCategorySettings(this.dataset.cat, 'search')">&#128269; Search & Settings</div>
        <div class="ctx-item" data-cat="${safeHtmlName}" onclick="openRenameModal(this.dataset.cat)">&#9998; Rename</div>
        <div class="ctx-item" data-cat="${safeHtmlName}" onclick="openBulkTitleModal(this.dataset.cat)">&#129668; Auto-Title Links</div>
        <div class="ctx-item" onclick="ctxCatFocus()">&#127919; Focus</div>
        <div class="ctx-item" onclick="ctxCatToggleTask()">&#128221; Task Mode</div>
        <div class="ctx-item" onclick="ctxCatToggleCustomOrder()">${coToggleLabel}</div>
        <div class="ctx-item" onclick="ctxCatCycleSortOrder()">${coSortLabel}</div>
        <div class="ctx-item" onclick="ctxCatToggleTrueValue()">${tvToggleLabel}</div>
        <div class="ctx-item" onclick="ctxCatSubScan()">&#128269; Sub-Scan (Duplicates)</div>
        <div class="ctx-item" data-cat="${safeHtmlName}" onclick="deleteCategory(this.dataset.cat)" style="color:var(--danger)">&#128465; Delete</div>
    `;

    placeContextMenu(m, e);
};

window.showWsContext = function (e, id) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    ctxWsId = id;
    const m = document.getElementById('sidebar-context-menu');
    if (!m) return;

    const helpers = window.EveWorkspaceHelpers;
    const groupsApi = window.EveSidebarGroups || null;
    const groupCount = groupsApi && typeof groupsApi.getGroups === 'function'
        ? groupsApi.getGroups(config).length
        : 0;
    const ws = helpers
        ? helpers.findById(config.workspaces || [], id)
        : (config.workspaces || []).find(function (w) { return w.id === id; });
    const isRootWorkspace = helpers ? !helpers.findParent(config.workspaces || [], id) : true;
    const currentGroupId = isRootWorkspace && groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
        ? groupsApi.getWorkspaceGroupId(id, config)
        : '';

    // Update hideSubTabs toggle label dynamically
    const hideToggle = document.getElementById('ctx-ws-hide-subtabs');
    if (hideToggle) {
        const hasSubTabs = ws && Array.isArray(ws.subTabs) && ws.subTabs.length > 0;
        if (hasSubTabs) {
            hideToggle.style.display = '';
            hideToggle.innerHTML = ws.hideSubTabs
                ? '&#128065; Show Sub-Tab Content'
                : '&#128065; Hide Sub-Tab Content';
        } else {
            hideToggle.style.display = 'none';
        }
    }

    // Update hiddenInParent toggle — only for sub-tabs (items with a parent)
    const hiddenInParentToggle = document.getElementById('ctx-ws-hidden-in-parent');
    if (hiddenInParentToggle) {
        const isSubTab = helpers ? !!helpers.findParent(config.workspaces || [], id) : false;
        if (isSubTab && ws) {
            hiddenInParentToggle.style.display = '';
            hiddenInParentToggle.innerHTML = ws.hiddenInParent
                ? '&#128064; Show in Parent View'
                : '&#128064; Hide in Parent View';
        } else {
            hiddenInParentToggle.style.display = 'none';
        }
    }
    // Update inactive toggle — show for all tabs
    const inactiveToggle = document.getElementById('ctx-ws-toggle-inactive');
    if (inactiveToggle && ws) {
        inactiveToggle.innerHTML = ws.inactive
            ? '&#9989; Reactivate Tab'
            : '&#128683; Make Inactive';
    }

    const editGroupAction = document.getElementById('ctx-ws-edit-group');
    if (editGroupAction) {
        editGroupAction.style.display = isRootWorkspace && groupCount > 0 ? '' : 'none';
        editGroupAction.innerHTML = currentGroupId
            ? '&#128450; Change Group'
            : '&#128450; Move To Group';
    }

    const clearGroupAction = document.getElementById('ctx-ws-clear-group');
    if (clearGroupAction) {
        clearGroupAction.style.display = isRootWorkspace && currentGroupId ? '' : 'none';
    }

    placeContextMenu(m, e);
};

window.showSidebarGroupContext = function (e, groupId) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    window.ctxSidebarGroupId = String(groupId || '').trim();

    const m = document.getElementById('sidebar-group-context-menu');
    if (!m) return;

    const groupsApi = window.EveSidebarGroups || null;
    const group = groupsApi && window.ctxSidebarGroupId
        ? groupsApi.findGroupById(window.ctxSidebarGroupId, config)
        : null;
    const isUngrouped = !window.ctxSidebarGroupId;

    const editAction = document.getElementById('ctx-sidebar-group-edit');
    if (editAction) editAction.style.display = isUngrouped ? 'none' : '';

    const focusAction = document.getElementById('ctx-sidebar-group-focus');
    if (focusAction) {
        focusAction.style.display = isUngrouped ? 'none' : '';
        if (group && groupsApi && typeof groupsApi.getFocusedGroupId === 'function') {
            focusAction.innerHTML = groupsApi.getFocusedGroupId(config) === String(group.id)
                ? '&#10006; Clear Group Focus'
                : '&#127919; Focus Group';
        }
    }

    const toggleCollapsedAction = document.getElementById('ctx-sidebar-group-toggle-collapsed');
    if (toggleCollapsedAction) {
        toggleCollapsedAction.style.display = isUngrouped ? 'none' : '';
        if (group) {
            toggleCollapsedAction.innerHTML = group.collapsed
                ? '&#9650; Expand Group'
                : '&#9660; Collapse Group';
        }
    }

    const toggleHiddenAction = document.getElementById('ctx-sidebar-group-toggle-hidden');
    if (toggleHiddenAction) {
        toggleHiddenAction.style.display = isUngrouped ? 'none' : '';
        if (group) {
            toggleHiddenAction.innerHTML = group.hidden
                ? '&#128065; Show Group'
                : '&#128065; Hide Group';
        }
    }

    const deleteAction = document.getElementById('ctx-sidebar-group-delete');
    if (deleteAction) deleteAction.style.display = isUngrouped ? 'none' : '';

    placeContextMenu(m, e);
};

window.showUnidexContextMenu = function (e) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    const m = document.getElementById('unidex-context-menu');
    if (!m) return;

    placeContextMenu(m, e);
};

// Initialize
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.initContextMenus();
} else {
    document.addEventListener('DOMContentLoaded', window.initContextMenus);
}
