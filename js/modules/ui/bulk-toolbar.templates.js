// --- BULK TOOLBAR TEMPLATES ---
window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.templatesReady) return;

    const bulkToolbarTemplate = `
<div id="bulk-toolbar">
    <span id="bulk-count" style="color:white; font-weight:bold;">0 Selected</span>
    <button onclick="bulkDelete()" class="btn-danger">Delete</button>
    <button onclick="bulkMove()">Move</button>
    <button onclick="bulkWorkspace()">Tab</button>
    <button onclick="toggleBulkMode()">Cancel</button>
</div>
`;

    const bulkMoveModalTemplate = `
<div id="bulk-move-modal-overlay" style="display:none;">
    <div id="bulk-move-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-move-modal-title">
        <h3 id="bulk-move-modal-title">Move Selected Bookmarks</h3>
        <p class="bulk-move-subtitle">Choose an existing card or create a new one for selected bookmarks.</p>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkMoveMode" value="existing" checked onchange="setBulkMoveMode('existing')">
                <span>Move to existing card</span>
            </label>
            <select id="bulk-move-existing-select"></select>
        </div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkMoveMode" value="new" onchange="setBulkMoveMode('new')">
                <span>Create new card from selected</span>
            </label>
            <input type="text" id="bulk-move-new-input" placeholder="New card name" disabled>
        </div>

        <div class="bulk-move-actions">
            <button type="button" class="btn-primary" onclick="confirmBulkMove()">Apply Move</button>
            <button type="button" onclick="closeBulkMoveModal()">Cancel</button>
        </div>
    </div>
</div>
`;

    const bulkTabModalTemplate = `
<div id="bulk-tab-modal-overlay" style="display:none;">
    <div id="bulk-tab-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-tab-modal-title">
        <h3 id="bulk-tab-modal-title">Move Selected Bookmarks</h3>
        <p class="bulk-move-subtitle">Choose an existing tab or create a new tab for selected bookmarks.</p>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabMode" value="existing" checked onchange="setBulkTabMode('existing')">
                <span>Move to existing tab</span>
            </label>
            <select id="bulk-tab-existing-select"></select>
        </div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabMode" value="new" onchange="setBulkTabMode('new')">
                <span>Create new tab and move selected</span>
            </label>
            <input type="text" id="bulk-tab-new-name-input" placeholder="New tab name" disabled>
        </div>

        <div class="bulk-move-actions">
            <button type="button" class="btn-primary" onclick="confirmBulkTabMove()">Apply Tab Move</button>
            <button type="button" onclick="closeBulkTabModal()">Cancel</button>
        </div>
    </div>
</div>
`;

    function initBulkToolbar() {
        if (!document.getElementById('bulk-toolbar')) {
            document.body.insertAdjacentHTML('beforeend', bulkToolbarTemplate);
        }
        if (!document.getElementById('bulk-move-modal-overlay')) {
            document.body.insertAdjacentHTML('beforeend', bulkMoveModalTemplate);
        }
        if (!document.getElementById('bulk-tab-modal-overlay')) {
            document.body.insertAdjacentHTML('beforeend', bulkTabModalTemplate);
        }
    }

    Object.assign(ns, {
        initBulkToolbar
    });
    ns.templatesReady = true;
})();
