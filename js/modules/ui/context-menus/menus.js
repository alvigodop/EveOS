window.initContextMenus = function () {
    if (!document.getElementById('link-context-menu')) {
        document.body.insertAdjacentHTML('beforeend', window.ContextMenus.template);
    }
};

// Global State for Context Menus
window.ctxLinkId = null;
window.ctxCatName = null;
window.ctxWsId = null;
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
    
    if (statsFoldersEl && statsItemsEl && window.EveBookmarkFolders) {
        const folderLinks = window.getModalLinks ? window.getModalLinks().filter(l => l.workspace === window.ctxWsId && l.category === window.ctxCatName) : [];
        const viewModel = window.EveBookmarkFolders.buildFolderView(window.ctxWsId, window.ctxCatName, folderLinks);
        
        let totalItems = 0;
        let totalFolders = 0;
        
        function recurseCount(fId) {
            const items = viewModel.folderLinks.get(fId) || [];
            totalItems += items.length;
            
            const children = viewModel.childrenMap.get(fId) || [];
            totalFolders += children.length;
            
            children.forEach(child => {
                recurseCount(child.id);
            });
        }
        
        recurseCount(folderId);
        
        statsFoldersEl.textContent = `Overall Folders: ${totalFolders}`;
        statsItemsEl.textContent = `Overall Items: ${totalItems}`;
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
    const link = links.find(item => String(item?.id ?? '') === normalizedId) || null;
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

window.showCategoryContextMenu = function (e, name) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();

    ctxCatName = name;
    ctxWsId = String((window.config && window.config.activeWorkspace) || window.ctxWsId || 'main');
    const m = document.getElementById('cat-context-menu');
    if (!m) return;

    const detachedMenuHtml = window.EveDetachedDashboardCard?.buildDetachedContextMenuHtml?.(name, ctxWsId) || '';
    if (detachedMenuHtml) {
        m.innerHTML = detachedMenuHtml;
        placeContextMenu(m, e);
        return;
    }

    const safeName = String(name || '').replace(/'/g, "\\'");
    m.innerHTML = `
        <div class="ctx-item" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(String((window.config && window.config.activeWorkspace) || 'main'), '${safeName}')">&#127756; Constellation Map</div>
        <div class="ctx-item" onclick="openCategorySettings('${safeName}', 'search')">&#128269; Search & Settings</div>
        <div class="ctx-item" onclick="openRenameModal('${safeName}')">&#9998; Rename</div>
        <div class="ctx-item" onclick="openBulkTitleModal('${safeName}')">&#129668; Auto-Title Links</div>
        <div class="ctx-item" onclick="ctxCatFocus()">&#127919; Focus</div>
        <div class="ctx-item" onclick="ctxCatToggleTask()">&#128221; Task Mode</div>
        <div class="ctx-item" onclick="ctxCatSubScan()">&#128269; Sub-Scan (Duplicates)</div>
        <div class="ctx-item" onclick="deleteCategory('${safeName}')" style="color:var(--danger)">&#128465; Delete</div>
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
    const ws = helpers
        ? helpers.findById(config.workspaces || [], id)
        : (config.workspaces || []).find(function (w) { return w.id === id; });

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
