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
        <div style="display:flex; flex-direction:column; gap:5px; margin-top:8px;">
            <label for="newCoverImage" style="font-size:0.82rem; opacity:0.84;">Bookmark Cover Image URL</label>
            <input type="url" id="newCoverImage" placeholder="https://... (optional)">
        </div>
        <details class="settings-disclosure" style="margin-top:8px;">
            <summary class="settings-disclosure-summary settings-disclosure-summary--split">
                <span class="settings-disclosure-summary__label">&#128444; Additional Cover Images</span>
                <span id="newCoverImagesSummary" class="settings-disclosure-summary__meta">0 extra</span>
            </summary>
            <div class="settings-disclosure-body" style="display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:0.8rem; opacity:0.72;">Add one image at a time. If extras exist, EveOS will pick one of them at random on reload. If none exist, the main cover URL above stays as the permanent fallback. You can also lock one extra as the permanent image.</div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="url" id="newCoverImageCandidate" placeholder="https://...">
                    <button type="button" id="newCoverImageAddBtn" onclick="addBookmarkCoverImageCandidate()">Add</button>
                </div>
                <div id="newCoverImagesList" style="display:flex; flex-direction:column; gap:6px;"></div>
                <textarea id="newCoverImages" style="display:none;"></textarea>
                <input type="hidden" id="newFixedCoverImage">
            </div>
        </details>
        <div id="edit-link-search-results" style="display:none; min-height: 180px; max-height: 45vh; overflow-y: auto; background: rgba(0,0,0,0.3); margin-bottom: 10px; padding: 5px; border-radius: 4px;"></div>
        
        <div style="margin-bottom: 10px;">
            <label style="font-size:0.9rem; color:var(--text-muted); display:block; margin-bottom:5px;">Attached Sources</label>
            <div id="link-sources-container" style="display:flex; flex-direction:column; gap:5px; max-height: 150px; overflow-y: auto;"></div>
        </div>

        <div style="display:flex; flex-direction:column; gap:5px;">
            <label for="newCategory" style="font-size:0.82rem; opacity:0.84;">Card (Category)</label>
            <div style="position:relative;">
                <input type="text" id="newCategory" placeholder="Select or type a card name" autocomplete="off"
                    onfocus="showCategoryQuickPicker()" onclick="showCategoryQuickPicker()" oninput="filterCategoryQuickPicker(this.value)" onblur="handleCategoryQuickPickerBlur()">
                <div id="newCategoryQuickPicker" style="display:none; position:absolute; left:0; right:0; top:100%; margin-top:4px; max-height:180px; overflow-y:auto; border:1px solid #444; border-radius:8px; background:var(--sidebar-bg, #141414); z-index:3205; box-shadow:0 8px 24px rgba(0,0,0,0.35);"></div>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; margin-top:8px;">
            <label for="newFolderId" style="font-size:0.82rem; opacity:0.84;">Bookmark Folder</label>
            <select id="newFolderId">
                <option value="">Root / No Folder</option>
            </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; margin-top:8px;">
            <label for="newBookmarkIdentifiers" style="font-size:0.82rem; opacity:0.84;">Bookmark Identifiers</label>
            <div id="newBookmarkIdentifiers" class="bookmark-identifier-editor"></div>
            <div style="font-size:0.78rem; opacity:0.72;">Structured bookmark labels like Reading, Watching, or Research. Manage the available set from Settings.</div>
        </div>
        <datalist id="availableCategories"></datalist>
        <div style="margin:10px 0; border:1px solid #333; border-radius:8px; padding:10px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                <label style="display:flex; gap:8px; align-items:center; margin:0;">
                    <input type="checkbox" id="linkLibraryToggle">
                    <span>&#128218; Add To Library</span>
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
                    <input type="text" id="libAuthorAltNames" placeholder="Author Alt Names (comma separated)" style="flex:1;">
                </div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <input type="text" id="libArtist" placeholder="Artist" style="flex:1;">
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
                <div style="margin-bottom:8px; border:1px solid rgba(255,255,255,0.12); border-radius:6px; padding:8px;">
                    <div style="font-size:0.78rem; opacity:0.8; margin-bottom:6px;">API Ratings (0-10)</div>
                    <div style="display:flex; gap:5px; margin-bottom:5px;">
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingAniList" style="font-size:0.75rem; opacity:0.8;">AniList</label>
                            <input type="number" id="libApiRatingAniList" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingMAL" style="font-size:0.75rem; opacity:0.8;">MyAnimeList</label>
                            <input type="number" id="libApiRatingMAL" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingMangaDex" style="font-size:0.75rem; opacity:0.8;">MangaDex</label>
                            <input type="number" id="libApiRatingMangaDex" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; margin-bottom:5px;">
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingKitsu" style="font-size:0.75rem; opacity:0.8;">Kitsu</label>
                            <input type="number" id="libApiRatingKitsu" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingTVmaze" style="font-size:0.75rem; opacity:0.8;">TVmaze</label>
                            <input type="number" id="libApiRatingTVmaze" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingMU" style="font-size:0.75rem; opacity:0.8;">MangaUpdates</label>
                            <input type="number" id="libApiRatingMU" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingComicK" style="font-size:0.75rem; opacity:0.8;">ComicK</label>
                            <input type="number" id="libApiRatingComicK" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; margin-bottom:5px;">
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingOpenLibrary" style="font-size:0.75rem; opacity:0.8;">OpenLibrary</label>
                            <input type="number" id="libApiRatingOpenLibrary" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingWLN" style="font-size:0.75rem; opacity:0.8;">WlnUpdates</label>
                            <input type="number" id="libApiRatingWLN" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingiTunes" style="font-size:0.75rem; opacity:0.8;">iTunes</label>
                            <input type="number" id="libApiRatingiTunes" min="0" max="10" step="0.01" placeholder="-" style="width:100%; padding:4px 6px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingAverage" style="font-size:0.75rem; opacity:0.8;">API Average</label>
                            <input type="text" id="libApiRatingAverage" placeholder="-" readonly style="width:100%; opacity:0.85; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libApiRatingWeighted" style="font-size:0.75rem; opacity:0.8;">API Weighted</label>
                            <input type="text" id="libApiRatingWeighted" placeholder="-" readonly style="width:100%; opacity:0.85; padding:4px 6px;">
                        </div>
                        <div style="display:flex; flex-direction:column; gap:3px; flex:1;">
                            <label for="libUnifiedRating" style="font-size:0.75rem; opacity:0.8;">Unified</label>
                            <input type="text" id="libUnifiedRating" placeholder="-" readonly style="width:100%; opacity:0.85; padding:4px 6px;">
                        </div>
                    </div>
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
        <input type="hidden" id="wsParentId">
        <input type="text" id="wsName" placeholder="Workspace Name">
        <div style="display:flex; gap:5px;">
            <input type="text" id="wsIcon" placeholder="Icon" style="text-align:center; flex:1;">
            <button onclick="openEmojiPicker('wsIcon')">😊</button>
        </div>
        <div id="wsGroupRow" style="display:none; margin-top:10px;">
            <select id="wsGroupId" style="width:100%;">
                <option value="">Ungrouped</option>
            </select>
        </div>
        <button class="btn-primary" onclick="saveWorkspace()">Save</button>
        <button onclick="closeModals()">Cancel</button>
    </div>
</div>

<div class="modal-overlay" id="sidebarGroupModal">
    <div class="modal">
        <h2 id="sidebarGroupModalTitle">Sidebar Group</h2>
        <input type="hidden" id="sgEditId">
        <input type="text" id="sgName" placeholder="Group Name">
        <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
            <label for="sgColor" style="font-size:0.85rem; opacity:0.8;">Color</label>
            <input type="color" id="sgColor" value="#00d4ff" style="width:100%; min-height:40px;">
        </div>
        <button class="btn-primary" onclick="saveSidebarGroup()">Save</button>
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
