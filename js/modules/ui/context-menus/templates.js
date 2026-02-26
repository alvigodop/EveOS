window.ContextMenus = window.ContextMenus || {};

window.ContextMenus.template = `
<div id="cat-context-menu" class="context-menu"></div>
<div id="sidebar-context-menu" class="context-menu">
    <div class="ctx-item" onclick="openWorkspaceModal(ctxWsId)">✎ Edit</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" style="color:var(--danger)" onclick="ctxWsDelete()">🗑 Delete</div>
</div>
<div id="link-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxEdit()">✎ Edit</div>
    <div class="ctx-item" onclick="ctxTogglePin()">📌 Pin/Unpin</div>
    <div class="ctx-item" onclick="ctxToggleDone()">✔ Toggle Done</div>
    <div class="ctx-item" onclick="ctxLaunch()">🚀 Launch</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" style="color:var(--danger)" onclick="ctxDelete()">🗑 Delete</div>
</div>
`;
