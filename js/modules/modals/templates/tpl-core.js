// --- MODAL TEMPLATES: CORE ---
window.modalTemplate = `
<!-- MODALS -->
<div class="modal-overlay" id="addModal">
    <div class="modal">
        <h2 id="modalTitle">Add Link</h2>
        <input type="hidden" id="editId">
        <div style="display:flex; gap:5px;">
            <input type="text" id="newUrl" placeholder="URL (https://...)" style="flex:1;">
            <button onclick="fetchTitle(this)" title="Auto-Fetch Title">🪄</button>
        </div>
        <div style="display:flex; gap:5px;">
            <input type="text" id="newTitle" placeholder="Title" style="flex:1;">
            <button onclick="searchLinkName()" title="Search by Name">🔍</button>
        </div>
        <div id="edit-link-search-results" style="display:none; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.3); margin-bottom: 10px; padding: 5px; border-radius: 4px;"></div>
        
        <div style="margin-bottom: 10px;">
            <label style="font-size:0.9rem; color:var(--text-muted); display:block; margin-bottom:5px;">Attached Sources</label>
            <div id="link-sources-container" style="display:flex; flex-direction:column; gap:5px; max-height: 150px; overflow-y: auto;"></div>
        </div>

        <input type="text" id="newCategory" placeholder="Category (e.g., Work, Social)" list="availableCategories">
        <datalist id="availableCategories"></datalist>
        <div style="display:flex; gap:10px;">
            <select id="newPriority">
                <option value="">No Priority</option>
                <option value="high">High (Red)</option>
                <option value="med">Medium (Blue)</option>
                <option value="low">Low (Green)</option>
            </select>
            <div style="display:flex; gap:5px; flex:1;">
                <input type="text" id="newIcon" placeholder="Icon" style="text-align:center; width:100%;">
                <button onclick="openEmojiPicker('newIcon')">😊</button>
            </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button class="btn-primary" onclick="saveLink()">Save</button>
            <button onclick="closeModals()">Cancel</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="wsModal">
    <div class="modal">
        <h2>Workspace</h2>
        <input type="hidden" id="wsEditId">
        <input type="text" id="wsName" placeholder="Workspace Name">
        <div style="display:flex; gap:5px;">
            <input type="text" id="wsIcon" placeholder="Icon" style="text-align:center; flex:1;">
            <button onclick="openEmojiPicker('wsIcon')">😊</button>
        </div>
        <button class="btn-primary" onclick="saveWorkspace()">Save</button>
        <button onclick="closeModals()">Cancel</button>
    </div>
</div>

<div class="modal-overlay" id="renameModal">
    <div class="modal">
        <h2>Rename</h2><input type="hidden" id="oldCatName"><input type="text" id="renameInput"
            onkeypress="handleRenameEnter(event)">
        <div style="display:flex; gap:10px; margin-top:10px;"><button class="btn-primary"
                onclick="confirmRename()">Save</button><button onclick="closeModals()">Cancel</button></div>
    </div>
</div>
`;
