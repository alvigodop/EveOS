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
                <button onclick="switchCategoryTab('folders')" style="width:100%;">Manage Bookmark Folders</button>
                <button onclick="closeModals(); ctxCatFocus()" style="width:100%;">Focus Mode</button>
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
                    <button onclick="promptCreateBookmarkFolder(window.currentCategoryCtx, '')" style="flex:1 1 180px;">Create Root Folder</button>
                    <button onclick="closeModals(); openAddModal(window.currentCategoryCtx)" style="flex:1 1 180px;">Add Root Bookmark</button>
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
`;
