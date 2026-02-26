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
        <div style="margin:10px 0; border:1px solid #333; border-radius:8px; padding:10px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                <label style="display:flex; gap:8px; align-items:center; margin:0;">
                    <input type="checkbox" id="linkLibraryToggle">
                    <span>Add To Library</span>
                </label>
                <button type="button" id="linkLibraryCollapseBtn" onclick="toggleLibraryFieldsCollapse()" style="display:none; padding:4px 8px; font-size:0.75rem;">Collapse</button>
            </div>
            <div id="linkLibraryFields" style="display:none;">
                <div style="display:flex; gap:12px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
                    <label style="display:flex; gap:6px; align-items:center; font-size:0.85rem;">
                        <input type="checkbox" id="libTypeGraphic">
                        <span>Graphic Novels</span>
                    </label>
                    <label style="display:flex; gap:6px; align-items:center; font-size:0.85rem;">
                        <input type="checkbox" id="libTypeFilms">
                        <span>Films</span>
                    </label>
                    <label style="display:flex; gap:6px; align-items:center; font-size:0.85rem;">
                        <input type="checkbox" id="libTypeNovels">
                        <span>Novels</span>
                    </label>
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" id="libAuthor" placeholder="Author" style="flex:1;">
                    <input type="text" id="libGenre" placeholder="Genre" style="flex:1;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <select id="libStatus" style="flex:1;">
                        <option value="">Status</option>
                    </select>
                    <select id="libRating" style="flex:1;">
                        <option value="">Rating</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                    </select>
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <div id="libGraphicChapterWrap" style="display:flex; flex-direction:column; gap:3px; flex:1;">
                        <label for="libGraphicChapter" style="font-size:0.75rem; opacity:0.8;">Graphic Chapter</label>
                        <input type="number" id="libGraphicChapter" min="0" placeholder="0" style="width:100%; max-width:120px; padding:4px 6px;">
                    </div>
                    <div id="libNovelChapterWrap" style="display:flex; flex-direction:column; gap:3px; flex:1;">
                        <label for="libNovelChapter" style="font-size:0.75rem; opacity:0.8;">Novel Chapter</label>
                        <input type="number" id="libNovelChapter" min="0" placeholder="0" style="width:100%; max-width:120px; padding:4px 6px;">
                    </div>
                    <div id="libSeasonWrap" style="display:flex; flex-direction:column; gap:3px; flex:1;">
                        <label for="libSeason" style="font-size:0.75rem; opacity:0.8;">Season</label>
                        <input type="number" id="libSeason" min="0" placeholder="0" style="width:100%; max-width:120px; padding:4px 6px;">
                    </div>
                    <div id="libEpisodeWrap" style="display:flex; flex-direction:column; gap:3px; flex:1;">
                        <label for="libEpisode" style="font-size:0.75rem; opacity:0.8;">Episode</label>
                        <input type="number" id="libEpisode" min="0" placeholder="0" style="width:100%; max-width:120px; padding:4px 6px;">
                    </div>
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" id="libLanguage" placeholder="Language" style="flex:1;">
                    <input type="text" id="libTags" placeholder="Tags (comma separated)" style="flex:1;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="url" id="libSourceUrl" placeholder="Source URL (syncs with bookmark URL)" style="flex:1;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="url" id="libImageUrl" placeholder="Image URL (optional)" style="flex:1;">
                </div>
                <div style="display:flex; gap:14px; margin:6px 0 8px; font-size:0.78rem; opacity:0.72;">
                    <span id="libDateAddedMeta">Added: -</span>
                    <span id="libLastEditedMeta">Last Edited: -</span>
                </div>
                <textarea id="libSummary" placeholder="Library summary/notes" rows="2" style="width:100%;"></textarea>
            </div>
        </div>
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
