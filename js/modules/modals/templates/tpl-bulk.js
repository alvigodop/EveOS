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
        </div>
        <textarea id="bulkText" style="min-height:150px;" placeholder="One URL per line..."></textarea>
        <input type="file" id="bulkFileInput" multiple accept=".txt" style="display:none; min-height:150px; background:#1a1a1a; color:#fff; border:1px solid #444; width:100%; box-sizing:border-box; padding:20px;">
        <div id="bulkModeHint" style="font-size:0.85rem; opacity:0.75; margin:6px 0 10px;">
            URL mode: each line should be a URL.
        </div>
        <input type="text" id="bulkCategory" placeholder="Category" list="availableCategories">
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button class="btn-primary" onclick="processBulk()">Import</button>
            <button onclick="clearBulkInput()">Clear</button>
            <button onclick="closeModals()">Cancel</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="bulkTitleModal">
    <div class="modal" style="max-width:600px; height:80vh; display:flex; flex-direction:column;">
        <h2>Auto-Title Links</h2>
        <div style="flex:1; overflow-y:auto; border:1px solid #444; background:#111; margin-bottom:15px;"
            id="bulkTitleList"></div>
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button onclick="toggleAllBulkTitle(true)" style="font-size:0.8rem; padding:5px 10px;">Select
                All</button>
            <button onclick="toggleAllBulkTitle(false)" style="font-size:0.8rem; padding:5px 10px;">Deselect
                All</button>
        </div>
        <div style="display:flex; gap:10px;">
            <button class="btn-primary" onclick="runBulkTitleUpdate()" id="btnRunBulkTitle">Start Update</button>
            <button onclick="closeModals()">Close</button>
        </div>
    </div>
</div>

<div class="modal-overlay" id="bulkLibraryAutoModal">
    <div class="modal" style="max-width:700px; height:84vh; display:flex; flex-direction:column;">
        <h2>Auto-Add Library Entries</h2>
        <p style="font-size:0.85rem; opacity:0.75; margin:0 0 10px;">
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
