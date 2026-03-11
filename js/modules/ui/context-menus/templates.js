window.ContextMenus = window.ContextMenus || {};

window.ContextMenus.template = `
<div id="cat-context-menu" class="context-menu"></div>
<div id="sidebar-context-menu" class="context-menu">
    <div class="ctx-item" onclick="openWorkspaceModal(ctxWsId)">&#9998; Edit</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" style="color:var(--danger)" onclick="ctxWsDelete()">&#128465; Delete</div>
</div>
<div id="link-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxEdit()">&#9998; Edit</div>
    <div class="ctx-item" id="ctx-library-action" onclick="ctxToggleLibraryLink()">&#128218; Add To Library</div>
    <div class="ctx-item" id="ctx-pin-action" onclick="ctxTogglePin()">&#128204; Pin</div>
    <div class="ctx-item" id="ctx-pin-scope-tab" onclick="ctxSetPinScope('tab')" style="display:none;">&#128204; Pin Scope: This Tab</div>
    <div class="ctx-item" id="ctx-pin-scope-card" onclick="ctxSetPinScope('card')" style="display:none;">&#128204; Pin Scope: This Card</div>
    <div class="ctx-item" id="ctx-pin-scope-folder" onclick="ctxSetPinScope('folder')" style="display:none;">&#128204; Pin Scope: This Folder</div>
    <div class="ctx-item" id="ctx-toggle-done-action" onclick="ctxToggleDone()">&#10004; Toggle Done</div>
    <div class="ctx-item" onclick="ctxLaunch()">&#128640; Launch</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" style="color:var(--danger)" onclick="ctxDelete()">&#128465; Delete</div>
</div>
<div id="folder-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxFolderAdd()">&#10133; Add Bookmark</div>
    <div class="ctx-item" onclick="ctxFolderSubfolder()">&#128193; New Subfolder</div>
    <div class="ctx-item" onclick="ctxFolderRename()">&#9998; Rename</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" style="color:var(--danger)" onclick="ctxFolderDelete()">&#128465; Delete</div>
</div>
`;
