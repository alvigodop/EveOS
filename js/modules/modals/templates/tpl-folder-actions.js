// --- MODAL TEMPLATES: FOLDER ACTIONS ---
window.modalTemplate += `
<div class="modal-overlay" id="folderOperationsModal">
    <div class="modal" style="max-width: 600px; width: 90%;">
        <h2 id="folderOperationsTitle">Folder Operations</h2>
        <div id="folderOperationsContent" style="display:flex; flex-direction:column; gap:10px;">
            <!-- Content will be injected here -->
        </div>
        <div class="modal-actions" style="margin-top:20px;">
            <button onclick="document.getElementById('folderOperationsModal').style.display='none'" class="btn-cancel">Close</button>
        </div>
    </div>
</div>
`;