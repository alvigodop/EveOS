// --- BULK TOOLBAR TEMPLATES ---
window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    if (ns.templatesReady) return;

    const bulkToolbarTemplate = `
<div id="bulk-toolbar">
    <span id="bulk-count">0 Selected</span>
    <button onclick="bulkPinSelected()">Pin</button>
    <button onclick="bulkUnpinSelected()">Unpin</button>
    <button onclick="bulkMarkDone()">Done</button>
    <button onclick="bulkMarkUndone()">Undone</button>
    <button onclick="bulkDelete()" class="btn-danger">Delete</button>
    <button onclick="bulkMove()">Move</button>
    <button onclick="bulkWorkspace()">Tab</button>
    <button onclick="toggleBulkMode()" title="Cancel Select Mode (Alt+B or Esc)">Cancel</button>
</div>
`;

    const bulkMoveModalTemplate = `
<div id="bulk-move-modal-overlay" style="display:none;">
    <div id="bulk-move-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-move-modal-title">
        <h3 id="bulk-move-modal-title">Move Selected Bookmarks</h3>
        <p class="bulk-move-subtitle">Choose an existing card or create a new one for selected bookmarks.</p>
        <div class="bulk-move-summary" id="bulk-move-selection-summary">No bookmarks selected.</div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkMoveMode" value="existing" checked onchange="setBulkMoveMode('existing')">
                <span>Move to existing card</span>
            </label>
            <input type="search" id="bulk-move-card-filter" class="bulk-target-filter" placeholder="Filter destination cards" oninput="renderBulkMoveCategoryOptions()">
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
        <p class="bulk-move-subtitle">Choose a destination tab, then choose the destination card inside that tab.</p>
        <div class="bulk-move-summary" id="bulk-tab-selection-summary">No bookmarks selected.</div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabMode" value="existing" checked onchange="setBulkTabMode('existing')">
                <span>Move to existing tab</span>
            </label>
            <input type="search" id="bulk-tab-workspace-filter" class="bulk-target-filter" placeholder="Filter destination tabs" oninput="renderBulkTabOptions()">
            <select id="bulk-tab-existing-select" onchange="renderBulkTabCardOptions()"></select>
        </div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabMode" value="new" onchange="setBulkTabMode('new')">
                <span>Create new tab and move selected</span>
            </label>
            <input type="text" id="bulk-tab-new-name-input" placeholder="New tab name" disabled>
        </div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabCardMode" value="existing" checked onchange="setBulkTabCardMode('existing')">
                <span>Move into existing card in destination tab</span>
            </label>
            <input type="search" id="bulk-tab-card-filter" class="bulk-target-filter" placeholder="Filter destination cards" oninput="renderBulkTabCardOptions()">
            <select id="bulk-tab-card-existing-select"></select>
        </div>

        <div class="bulk-move-section">
            <label class="bulk-move-radio">
                <input type="radio" name="bulkTabCardMode" value="new" onchange="setBulkTabCardMode('new')">
                <span>Create new card in destination tab</span>
            </label>
            <input type="text" id="bulk-tab-card-new-input" placeholder="New card name" disabled>
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
