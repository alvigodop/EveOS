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

window.showLinkContextMenu = function (e, id) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();
    ctxLinkId = id;
    const m = document.getElementById('link-context-menu');
    if (m) {
        m.style.display = 'block';
        m.style.left = `${e.pageX}px`;
        m.style.top = `${e.pageY}px`;
    }
};

window.showCategoryContextMenu = function (e, name) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();
    ctxCatName = name;
    const m = document.getElementById('cat-context-menu');
    if (m) {
        m.style.display = 'block';
        m.style.left = `${e.pageX}px`;
        m.style.top = `${e.pageY}px`;
        const safeName = name.replace(/'/g, "\\'");
        m.innerHTML = `
            <div class="ctx-item" onclick="openCategorySettings('${safeName}', 'search')">🔍 Search & Settings</div>
            <div class="ctx-item" onclick="openRenameModal('${safeName}')">✎ Rename</div>
            <div class="ctx-item" onclick="openBulkTitleModal('${safeName}')">🪄 Auto-Title Links</div>
            <div class="ctx-item" onclick="ctxCatFocus()">🎯 Focus</div>
            <div class="ctx-item" onclick="ctxCatToggleTask()">📝 Task Mode</div>
            <div class="ctx-item" onclick="deleteCategory('${safeName}')" style="color:var(--danger)">🗑 Delete</div>
        `;
    }
};

window.showWsContext = function (e, id) {
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();
    ctxWsId = id;
    const m = document.getElementById('sidebar-context-menu');
    if (m) {
        m.style.display = 'block';
        m.style.left = `${e.pageX}px`;
        m.style.top = `${e.pageY}px`;
    }
};

// Initialize
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.initContextMenus();
} else {
    document.addEventListener('DOMContentLoaded', window.initContextMenus);
}
