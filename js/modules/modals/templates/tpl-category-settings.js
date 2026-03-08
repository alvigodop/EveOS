// --- MODAL TEMPLATES: CATEGORY SETTINGS ---
window.modalTemplate = window.modalTemplate || '';

window.modalTemplate += `
<div class="modal-overlay" id="categorySettingsModal">
    <div class="modal" style="width: 500px; max-width: 90%;">
        <h2 id="catSettingsTitle">Category Settings</h2>

        <div class="modal-tabs">
            <button class="tab-btn active" onclick="switchCategoryTab('general')" id="tab-btn-general">General</button>
            <button class="tab-btn" onclick="switchCategoryTab('folders')" id="tab-btn-folders">Folders</button>
            <button class="tab-btn" onclick="switchCategoryTab('search')" id="tab-btn-search">Search</button>
            <button class="tab-btn" onclick="switchCategoryTab('scraper')" id="tab-btn-scraper">Scraper</button>
        </div>

        <div id="cat-tab-general" class="tab-content" style="display:block;">
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button onclick="closeModals(); openRenameModal(window.currentCategoryCtx)" style="width:100%;">Rename Category</button>
                <button onclick="closeModals(); openBulkTitleModal(window.currentCategoryCtx)" style="width:100%;">Auto-Title Links</button>
                <button onclick="closeModals(); openBulkLibraryAutoModal(window.currentCategoryCtx)" style="width:100%;">Auto-Add Library Entries</button>
                <div style="display:flex; flex-direction:column; gap:6px; padding:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03);">
                    <strong>Bookmark Click Behavior</strong>
                    <div style="font-size:0.82rem; opacity:0.76;">Override how bookmarks in this card react when clicked.</div>
                    <select id="categoryClickBehaviorSelect" onchange="saveCategoryClickBehaviorSetting(this.value)"></select>
                    <div id="categoryClickBehaviorHint" style="font-size:0.78rem; opacity:0.72;"></div>
                </div>
                <details class="settings-disclosure">
                    <summary class="settings-disclosure-summary">Card Actions</summary>
                    <div class="settings-disclosure-body" style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button onclick="closeModals(); openAddModal(window.currentCategoryCtx)" style="flex:1 1 180px;">➕ Add Bookmark</button>
                        <button onclick="closeModals(); toggleCategoryLibrary(window.currentCategoryCtx)" style="flex:1 1 180px;">📚 Open Library</button>
                        <button onclick="switchCategoryTab('folders')" style="flex:1 1 180px;">🗂 Manage Bookmark Folders</button>
                        <button onclick="closeModals(); ctxCatFocus()" style="flex:1 1 180px;">🎯 Focus Mode</button>
                        <button onclick="closeModals(); launchCategory(window.currentCategoryCtx)" style="flex:1 1 180px;">🚀 Launch</button>
                    </div>
                </details>
                <details class="settings-disclosure">
                    <summary class="settings-disclosure-summary">Header Quick Actions</summary>
                    <div class="settings-disclosure-body">
                    <div style="font-size:0.82rem; opacity:0.78; margin:0 0 10px 0;">Choose which quick-action icons stay visible on this card. Settings always stays visible.</div>
                    <div id="categoryHeaderButtonSettings" style="display:flex; flex-direction:column; gap:8px;"></div>
                    </div>
                </details>
                <button onclick="closeModals(); ctxCatToggleTask()" style="width:100%;">Toggle Task Mode</button>
                <div style="border-top:1px solid #444; margin-top:10px; padding-top:10px;">
                    <button onclick="deleteCategory(window.currentCategoryCtx)" class="btn-danger" style="width:100%;">Delete Category</button>
                </div>
            </div>
        </div>

        <div id="cat-tab-folders" class="tab-content" style="display:none;">
            <div style="display:flex; flex-direction:column; gap:12px;">
                <p style="opacity:0.75; font-size:0.9rem; margin:0;">Folders are bookmark organizers inside this card only. They are separate from tabs.</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button onclick="openFolderCreator(window.currentCategoryCtx, '')" style="flex:1 1 180px;">📁 New Folder</button>
                    <button onclick="closeModals(); openAddModal(window.currentCategoryCtx)" style="flex:1 1 180px;">➕ Add Root Bookmark</button>
                </div>
                <div id="category-folder-manager" style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto;"></div>
            </div>
        </div>

        <div id="cat-tab-search" class="tab-content" style="display:none;">
            <p style="opacity:0.7; font-size:0.9rem; margin-bottom:10px;">Search for Manga/Anime to add or view.</p>
            <div id="modal-api-search-container"></div>
            <div id="modal-api-results-container" style="margin-top:15px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.2);"></div>
        </div>

        <div id="cat-tab-scraper" class="tab-content" style="display:none;">
            <p style="opacity:0.7; font-size:0.9rem; margin-bottom:10px;">Search Wikipedia and Fandom wikis for articles.</p>
            <div id="modal-scraper-container"></div>
        </div>

        <button onclick="closeModals()" style="margin-top:15px; width:100%;">Close</button>
    </div>
</div>

<div class="modal-overlay" id="bookmarkFolderCreatorModal" style="z-index:3004;">
    <div class="modal" style="width:460px; max-width:92%;">
        <h2 id="bookmarkFolderCreatorTitle">New Bookmark Folder</h2>
        <div id="bookmarkFolderCreatorContext" style="font-size:0.84rem; opacity:0.74; margin-top:-6px;">Card: Unsorted | Parent: Root Level</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <label for="bookmarkFolderCreatorNameInput" style="font-size:0.82rem; opacity:0.84;">Folder Name</label>
            <input type="text" id="bookmarkFolderCreatorNameInput" placeholder="Folder name" onkeypress="handleCategoryFolderNameEnter(event)">
        </div>
        <div id="bookmarkFolderCreatorParentRow" style="display:flex; flex-direction:column; gap:8px;">
            <label for="bookmarkFolderCreatorParentSelect" style="font-size:0.82rem; opacity:0.84;">Parent Folder</label>
            <select id="bookmarkFolderCreatorParentSelect"></select>
        </div>
        <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn-primary" id="bookmarkFolderCreatorSubmitBtn" onclick="submitCategoryFolderCreate()">Create Folder</button>
            <button id="bookmarkFolderCreatorClearBtn" onclick="clearCategoryFolderCreateForm()">Clear</button>
            <button onclick="closeBookmarkFolderCreatorModal()">Cancel</button>
        </div>
    </div>
</div>
`;
