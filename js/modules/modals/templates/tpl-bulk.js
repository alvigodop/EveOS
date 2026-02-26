// --- MODAL TEMPLATES: BULK ---
window.modalTemplate += `
<div class="modal-overlay" id="bulkModal">
    <div class="modal">
        <h2>Bulk Import</h2>
        <textarea id="bulkText" style="min-height:150px;" placeholder="URL list..."></textarea>
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
`;
