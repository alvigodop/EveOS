window.ContextMenus = window.ContextMenus || {};

window.ContextMenus.template = `
<div id="cat-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxCatSubScan()">&#128269; Sub-Scan (Duplicates)</div>
</div>
<div id="workspace-context-menu" class="context-menu">
    <div class="ctx-item" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openWorkspaceMap((window.config && window.config.activeWorkspace) || 'main');">&#127756; Constellation Map</div>
</div>
<div id="unidex-context-menu" class="context-menu">
    <div class="ctx-item" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openAllMap();">&#127756; Constellation Map (All Tabs)</div>
</div>
<div id="sidebar-context-menu" class="context-menu">
    <div class="ctx-item" onclick="openWorkspaceModal(ctxWsId)">&#9998; Edit</div>
    <div class="ctx-item" id="ctx-ws-edit-group" onclick="ctxWsEditGroup()">&#128450; Move To Group</div>
    <div class="ctx-item" id="ctx-ws-clear-group" onclick="ctxWsClearGroup()">&#128228; Remove From Group</div>
    <div class="ctx-item" onclick="ctxWsAddSubTab()">&#10133; Add Sub-Tab</div>
    <div class="ctx-item" onclick="ctxWsCreateShortcut()">&#128279; Create Shortcut</div>
    <div class="ctx-item" id="ctx-ws-hide-subtabs" onclick="ctxWsToggleHideSubTabs()">&#128065; Hide Sub-Tab Content</div>
    <div class="ctx-item" id="ctx-ws-hidden-in-parent" onclick="ctxWsToggleHiddenInParent()">&#128064; Hide in Parent View</div>
    <div class="ctx-item" id="ctx-ws-toggle-inactive" onclick="ctxWsToggleInactive()">&#128683; Make Inactive</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--danger" onclick="ctxWsDelete()">&#128465; Delete</div>
</div>
<div id="sidebar-group-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxSidebarGroupCreateWorkspace()">&#10133; New Tab In Group</div>
    <div class="ctx-item" id="ctx-sidebar-group-edit" onclick="ctxSidebarGroupEdit()">&#9998; Edit Group</div>
    <div class="ctx-item" id="ctx-sidebar-group-focus" onclick="ctxSidebarGroupToggleFocus()">&#127919; Focus Group</div>
    <div class="ctx-item" id="ctx-sidebar-group-toggle-collapsed" onclick="ctxSidebarGroupToggleCollapsed()">&#9660; Collapse Group</div>
    <div class="ctx-item" onclick="ctxSidebarGroupCollapseTabs()">&#9660; Collapse Tabs In Group</div>
    <div class="ctx-item" onclick="ctxSidebarGroupExpandTabs()">&#9650; Expand Tabs In Group</div>
    <div class="ctx-item" id="ctx-sidebar-group-toggle-hidden" onclick="ctxSidebarGroupToggleHidden()">&#128065; Hide Group</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--danger" id="ctx-sidebar-group-delete" onclick="ctxSidebarGroupDelete()">&#128465; Delete Group</div>
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
    <div class="ctx-item" onclick="ctxNeuralEcho()">&#8987; Neural Echo (Wayback)</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--danger" onclick="ctxDelete()">&#128465; Delete</div>
</div>
<div id="folder-context-menu" class="context-menu">
    <div class="ctx-item" onclick="ctxFolderAdd()">&#10133; Add Bookmark</div>
    <div class="ctx-item" onclick="ctxFolderSubfolder()">&#128193; New Subfolder</div>
    <div class="ctx-item" onclick="ctxFolderRename()">&#9998; Rename</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="ctxFolderMap()">&#127756; Constellation Map</div>
    <div class="ctx-item" onclick="ctxFolderAutoTitle()">&#127991; Auto-Title Links</div>
    <div class="ctx-item" onclick="ctxFolderAutoLibrary()">&#128214; Auto-Add Library Entries</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="ctxFolderSubScan()">&#128269; Sub-Scan (Duplicates)</div>
    <div class="ctx-item" onclick="ctxFolderExport()">&#128190; Export Directory</div>
    <div class="ctx-item" onclick="ctxFolderBulkPatch()">&#9881; Bulk Patch</div>
    <div class="ctx-divider"></div>
    <div class="ctx-meta" id="ctx-folder-stats-folders">Folders: 0</div>
    <div class="ctx-meta" id="ctx-folder-stats-items">Items: 0</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item ctx-item--danger" onclick="ctxFolderDelete()">&#128465; Delete</div>
</div>
`;
