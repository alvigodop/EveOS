// --- MODAL TEMPLATES: CATEGORY SETTINGS ---
window.modalTemplate = window.modalTemplate || '';

window.modalTemplate += `
<div class="modal-overlay" id="categorySettingsModal">
    <div class="modal" style="width: 500px; max-width: 90%;">
        <h2 id="catSettingsTitle">Category Settings</h2>

        <div class="modal-tabs">
            <button class="tab-btn active" onclick="switchCategoryTab('general')" id="tab-btn-general">General</button>
            <button class="tab-btn" onclick="switchCategoryTab('folders')" id="tab-btn-folders">Folders</button>
            <button class="tab-btn" onclick="switchCategoryTab('search')" id="tab-btn-search">Search Unidex</button>
            <button class="tab-btn" onclick="switchCategoryTab('scraper')" id="tab-btn-scraper">Scraper</button>
        </div>

        <div id="cat-tab-general" class="tab-content" style="display:block;">
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button onclick="closeModals(); openRenameModal(window.currentCategoryCtx)" style="width:100%;">&#9998; Rename Category</button>
                <button onclick="closeModals(); openBulkTitleModal(window.currentCategoryCtx)" style="width:100%;">&#127991; Auto-Title Links</button>
                <button onclick="closeModals(); openBulkLibraryAutoModal(window.currentCategoryCtx)" style="width:100%;">&#128214; Auto-Add Library Entries</button>
                <details class="settings-disclosure">
                    <summary class="settings-disclosure-summary">&#128433; Bookmark Click Behavior</summary>
                    <div class="settings-disclosure-body" style="display:flex; flex-direction:column; gap:6px;">
                        <div style="font-size:0.82rem; opacity:0.76;">Override how bookmarks in this card react when clicked.</div>
                        <select id="categoryClickBehaviorSelect" onchange="saveCategoryClickBehaviorSetting(this.value)"></select>
                        <div id="categoryClickBehaviorHint" style="font-size:0.78rem; opacity:0.72;"></div>
                    </div>
                </details>
                <details class="settings-disclosure">
                    <summary class="settings-disclosure-summary">&#128736; Card Actions</summary>
                    <div class="settings-disclosure-body" style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button onclick="closeModals(); openAddModal(window.currentCategoryCtx)" style="flex:1 1 180px;">&#10133; Add Bookmark</button>
                        <button id="categoryPinCardBtn" onclick="toggleCategoryCardPin()" style="flex:1 1 180px;">&#128204; Pin Card</button>
                        <button onclick="closeModals(); toggleCategoryLibrary(window.currentCategoryCtx)" style="flex:1 1 180px;">&#128218; Open Library</button>
                        <button onclick="closeModals(); if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(String(window.eveState?.config?.activeWorkspace || 'main'), window.currentCategoryCtx)" style="flex:1 1 180px;">&#127756; Constellation Map</button>
                        <button onclick="switchCategoryTab('folders')" style="flex:1 1 180px;">&#128450; Manage Bookmark Folders</button>
                        <button onclick="closeModals(); ctxCatFocus()" style="flex:1 1 180px;">&#127919; Focus Mode</button>
                        <button onclick="closeModals(); launchCategory(window.currentCategoryCtx)" style="flex:1 1 180px;">&#128640; Launch</button>
                        <div id="categoryPinCardScopeWrap" style="display:none; flex:1 1 100%; flex-direction:column; gap:6px; margin-top:4px;">
                            <label for="categoryPinCardScopeSelect" style="font-size:0.78rem; opacity:0.78;">Card Pin Visibility</label>
                            <select id="categoryPinCardScopeSelect" onchange="saveCategoryCardPinScope(this.value)"></select>
                            <div id="categoryPinCardScopeHint" style="font-size:0.76rem; opacity:0.68;"></div>
                        </div>
                    </div>
                </details>
                <details class="settings-disclosure">
                    <summary class="settings-disclosure-summary">&#9889; Header Quick Actions</summary>
                    <div class="settings-disclosure-body">
                    <div style="font-size:0.82rem; opacity:0.78; margin:0 0 10px 0;">Choose which quick-action icons stay visible on this card. Settings always stays visible.</div>
                    <div id="categoryHeaderButtonSettings" style="display:flex; flex-direction:column; gap:8px;"></div>
                    </div>
                </details>
                <button onclick="closeModals(); ctxCatToggleTask()" style="width:100%;">&#9989; Toggle Task Mode</button>
                <div style="border-top:1px solid #444; margin-top:10px; padding-top:10px;">
                    <button onclick="deleteCategory(window.currentCategoryCtx)" class="btn-danger" style="width:100%;">&#128465; Delete Category</button>
                </div>
            </div>
        </div>

        <div id="cat-tab-folders" class="tab-content" style="display:none;">
            <div style="display:flex; flex-direction:column; gap:12px;">
                <p style="opacity:0.75; font-size:0.9rem; margin:0;">Folders are bookmark organizers inside this card only. They are separate from tabs.</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button onclick="openFolderCreator(window.currentCategoryCtx, '')" style="flex:1 1 180px;">&#128193; New Folder</button>
                    <button onclick="closeModals(); openAddModal(window.currentCategoryCtx)" style="flex:1 1 180px;">&#10133; Add Root Bookmark</button>
                </div>
                <div id="category-folder-manager" style="display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto;"></div>
            </div>
        </div>

        <div id="cat-tab-search" class="tab-content" style="display:none;">
            <p style="opacity:0.7; font-size:0.9rem; margin-bottom:10px;">Search API providers and manage the same unified source graph shown in Scraper &gt; Unidex for this card only.</p>
            <div id="modal-api-search-container"></div>
            <div id="modal-api-results-container" style="margin-top:15px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.2);"></div>
        </div>

        <div id="cat-tab-scraper" class="tab-content" style="display:none;">
            <p style="opacity:0.7; font-size:0.9rem; margin-bottom:10px;">Use this card's isolated scraper workspace to search live sources, manage saved domains, and reuse provider cache without cross-card bleed.</p>
            <div id="modal-scraper-container"></div>
        </div>

        <button onclick="closeModals()" style="margin-top:15px; width:100%;">&#10005; Close</button>
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
            <button class="btn-primary" id="bookmarkFolderCreatorSubmitBtn" onclick="submitCategoryFolderCreate()">&#128193; Create Folder</button>
            <button id="bookmarkFolderCreatorClearBtn" onclick="clearCategoryFolderCreateForm()">&#8635; Clear</button>
            <button onclick="closeBookmarkFolderCreatorModal()">&#10005; Cancel</button>
        </div>
    </div>
</div>
`;
