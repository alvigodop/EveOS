window.initContextMenus = function () {
    if (!document.getElementById('link-context-menu')) {
        document.body.insertAdjacentHTML('beforeend', window.ContextMenus.template);
    }
};

// Global State for Context Menus
window.ctxLinkId = null;
window.ctxCatName = null;
window.ctxWsId = null;

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
    const doneAction = m.querySelector('#ctx-toggle-done-action');
    const link = links.find(item => String(item?.id ?? '') === normalizedId) || null;
    const linked = !!window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId?.(normalizedId);
    if (action) {
        action.innerHTML = linked
            ? `${ICON_LIBRARY_HTML} Remove From Library`
            : `${ICON_LIBRARY_HTML} Add To Library`;
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
    const m = document.getElementById('cat-context-menu');
    if (!m) return;

    const safeName = String(name || '').replace(/'/g, "\\'");
    m.innerHTML = `
        <div class="ctx-item" onclick="openCategorySettings('${safeName}', 'search')">&#128269; Search & Settings</div>
        <div class="ctx-item" onclick="openRenameModal('${safeName}')">&#9998; Rename</div>
        <div class="ctx-item" onclick="openBulkTitleModal('${safeName}')">&#129668; Auto-Title Links</div>
        <div class="ctx-item" onclick="ctxCatFocus()">&#127919; Focus</div>
        <div class="ctx-item" onclick="ctxCatToggleTask()">&#128221; Task Mode</div>
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

    placeContextMenu(m, e);
};

// Initialize
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.initContextMenus();
} else {
    document.addEventListener('DOMContentLoaded', window.initContextMenus);
}
