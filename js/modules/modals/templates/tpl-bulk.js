// --- MODAL TEMPLATES: BULK ---
window.modalTemplate += `
<div class="modal-overlay" id="bulkModal">
    <div class="modal">
        <h2>Bulk Import</h2>
        <div style="display:flex; gap:14px; margin-bottom:10px; align-items:center;">
            <label style="display:flex; align-items:center; gap:6px; font-size:0.9rem;">
                <input type="radio" name="bulkMode" id="bulkModeUrl" value="url" checked>
                <span>URLs</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.9rem;">
                <input type="radio" name="bulkMode" id="bulkModeName" value="name">
                <span>Names Only</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.9rem;">
                <input type="radio" name="bulkMode" id="bulkModeFile" value="file">
                <span>Files (Smart Extract)</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.9rem;">
                <input type="radio" name="bulkMode" id="bulkModeFolder" value="folder">
                <span>Folders</span>
            </label>
        </div>
        <textarea id="bulkText" style="min-height:150px;" placeholder="One URL per line..."></textarea>
        <div id="bulkTextTools" style="display:flex; gap:10px; margin-top:10px; align-items:center;">
            <button id="bulkAutoLineBreakBtn" type="button" onclick="autoFormatBulkText()" style="display:none;">Auto Line Break URLs</button>
            <div id="bulkTextToolsHint" style="font-size:0.78rem; opacity:0.72; display:none;">Splits pasted URL blobs into one URL per line.</div>
        </div>

        <div id="bulkFileDropZone" style="display:none; min-height:150px; background:#111; border:2px dashed #444; border-radius:6px; flex-direction:column; align-items:center; justify-content:center; color:#aaa; cursor:pointer; position:relative; text-align:center; padding: 20px; transition: border-color 0.2s, background-color 0.2s;">
            <div style="font-size:2.5rem; margin-bottom:10px; pointer-events:none;">📄</div>
            <div id="bulkFileDropText" style="pointer-events:none; font-size:0.95rem;">Click to select or drag & drop .txt files here</div>
            <input type="file" id="bulkFileInput" multiple accept=".txt" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;">
        </div>

        <div id="bulkFolderDropZone" style="display:none; min-height:150px; background:#111; border:2px dashed #444; border-radius:6px; flex-direction:column; align-items:center; justify-content:center; color:#aaa; cursor:pointer; position:relative; text-align:center; padding: 20px; transition: border-color 0.2s, background-color 0.2s;">
            <div style="font-size:2.5rem; margin-bottom:10px; pointer-events:none;">📁</div>
            <div id="bulkFolderDropText" style="pointer-events:none; font-size:0.95rem;">Click to select a folder</div>
            <input type="file" id="bulkFolderInput" webkitdirectory directory multiple style="display:none;">
        </div>

        <div id="bulkModeHint" style="font-size:0.85rem; opacity:0.75; margin:6px 0 10px;">
            URL mode: each line should be a URL.
        </div>

        <div style="position:relative; margin-top:10px;">
            <input type="text" id="bulkCategory" placeholder="Select or type a card name" autocomplete="off"
                onfocus="showCategoryQuickPicker('bulkCategoryQuickPicker', 'bulkCategory')"
                onclick="showCategoryQuickPicker('bulkCategoryQuickPicker', 'bulkCategory')"
                oninput="filterCategoryQuickPicker(this.value, 'bulkCategoryQuickPicker', 'bulkCategory')"
                onblur="handleCategoryQuickPickerBlur('bulkCategoryQuickPicker')">
            <div id="bulkCategoryQuickPicker" style="display:none; position:absolute; left:0; right:0; bottom:100%; margin-bottom:4px; max-height:180px; overflow-y:auto; border:1px solid #444; border-radius:8px; background:var(--sidebar-bg, #141414); z-index:3205; box-shadow:0 -8px 24px rgba(0,0,0,0.35);"></div>
        </div>

        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="btn-primary" onclick="processBulk()">Import</button>
            <button onclick="clearBulkInput()">Clear</button>
            <button onclick="closeModals()">Cancel</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="bulkTitleModal">
    <div class="modal" style="max-width:600px; height:80vh; display:flex; flex-direction:column;">
        <h2 id="bulkTitleModalTitle">Auto-Title Links</h2>
        <p id="bulkTitleModalHint" style="font-size:0.85rem; opacity:0.75; margin:0 0 10px; display:none;"></p>
        <div style="flex:1; overflow-y:auto; border:1px solid #444; background:#111; margin-bottom:15px;"
            id="bulkTitleList"></div>
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button onclick="toggleAllBulkTitle(true)" style="font-size:0.8rem; padding:5px 10px;">Select
                All</button>
            <button onclick="toggleAllBulkTitle(false)" style="font-size:0.8rem; padding:5px 10px;">Deselect
                All</button>
            <button onclick="selectUntitledBulkTitle()" style="font-size:0.8rem; padding:5px 10px;">Select Untitled</button>
            <button onclick="selectNoCoverBulkTitle()" style="font-size:0.8rem; padding:5px 10px;">Select No-Cover</button>
        </div>
        <div style="display:flex; gap:10px;">
            <button class="btn-primary" onclick="runBulkTitleUpdate()" id="btnRunBulkTitle">Start Update</button>
            <button onclick="runBulkTitleUpdateHeadless()" id="btnRunBulkTitleLightpanda">Use Headless Scrapers</button>
            <button onclick="closeModals()">Close</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="bulkLibraryAutoModal">
    <div class="modal" style="max-width:700px; height:84vh; display:flex; flex-direction:column;">
        <h2 id="bulkLibraryAutoModalTitle">Auto-Add Library Entries</h2>
        <p id="bulkLibraryAutoModalHint" style="font-size:0.85rem; opacity:0.75; margin:0 0 10px;">
            Strict mode: sources are accepted only when API title/synonym matches the bookmark title exactly (case-sensitive).
        </p>
        <div style="flex:1; overflow-y:auto; border:1px solid #444; background:#111; margin-bottom:15px;" id="bulkLibraryAutoList"></div>
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button onclick="toggleAllBulkLibraryAuto(true)" style="font-size:0.8rem; padding:5px 10px;">Select All</button>
            <button onclick="toggleAllBulkLibraryAuto(false)" style="font-size:0.8rem; padding:5px 10px;">Deselect All</button>
        </div>
        <div style="display:flex; gap:10px;">
            <button class="btn-primary" onclick="runBulkLibraryAutoUpdate()" id="btnRunBulkLibraryAuto">Start Update</button>
            <button onclick="closeModals()">Close</button>
        </div>
    </div>
</div>
`;
