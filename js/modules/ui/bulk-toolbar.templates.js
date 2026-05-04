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
    <button onclick="bulkMerge()" title="Merge selected bookmarks sharing the same title into one">Merge</button>
    <button onclick="toggleBulkMode()" title="Cancel Select Mode (Alt+B or Esc)">Cancel</button>
</div>
`;

    function sectionHeader(radioHtml) {
        return (
            `<div class="bulk-section-header">`
            + `<label class="bulk-move-radio">${radioHtml}</label>`
            + `<button type="button" class="bulk-section-toggle" aria-label="Toggle section" onclick="toggleBulkSection(this)">`
            + `<span class="bulk-section-chevron" aria-hidden="true">&#9662;</span>`
            + `</button>`
            + `</div>`
        );
    }

    const bulkMoveModalTemplate = `
<div id="bulk-move-modal-overlay" style="display:none;">
    <div id="bulk-move-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-move-modal-title">
        <h3 id="bulk-move-modal-title">Move Selected Bookmarks</h3>
        <p class="bulk-move-subtitle">Choose an existing card or create a new one for selected bookmarks.</p>
        <div class="bulk-move-summary" id="bulk-move-selection-summary">No bookmarks selected.</div>

        <div class="bulk-move-section" data-bulk-section-group="bulkMoveMode" data-bulk-section-mode="existing">
            ${sectionHeader('<input type="radio" name="bulkMoveMode" value="existing" checked onchange="setBulkMoveMode(\'existing\')"><span>Move to existing card</span>')}
            <div class="bulk-section-body">
                <input type="search" id="bulk-move-card-filter" class="bulk-target-filter" placeholder="Filter destination cards" oninput="renderBulkMoveCategoryOptions()">
                <div id="bulk-move-existing-list" class="bulk-target-list" role="listbox" aria-label="Destination card" data-selected=""></div>
            </div>
        </div>

        <div class="bulk-move-section" data-bulk-section-group="bulkMoveMode" data-bulk-section-mode="new">
            ${sectionHeader('<input type="radio" name="bulkMoveMode" value="new" onchange="setBulkMoveMode(\'new\')"><span>Create new card from selected</span>')}
            <div class="bulk-section-body">
                <input type="text" id="bulk-move-new-input" placeholder="New card name" disabled>
            </div>
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

        <div class="bulk-move-section" data-bulk-section-group="bulkTabMode" data-bulk-section-mode="existing">
            ${sectionHeader('<input type="radio" name="bulkTabMode" value="existing" checked onchange="setBulkTabMode(\'existing\')"><span>Move to existing tab</span>')}
            <div class="bulk-section-body">
                <input type="search" id="bulk-tab-workspace-filter" class="bulk-target-filter" placeholder="Filter destination tabs" oninput="renderBulkTabOptions()">
                <div id="bulk-tab-existing-list" class="bulk-target-list" role="listbox" aria-label="Destination tab" data-selected=""></div>
            </div>
        </div>

        <div class="bulk-move-section" data-bulk-section-group="bulkTabMode" data-bulk-section-mode="new">
            ${sectionHeader('<input type="radio" name="bulkTabMode" value="new" onchange="setBulkTabMode(\'new\')"><span>Create new tab and move selected</span>')}
            <div class="bulk-section-body">
                <input type="text" id="bulk-tab-new-name-input" placeholder="New tab name" disabled>
            </div>
        </div>

        <div class="bulk-move-section" data-bulk-section-group="bulkTabCardMode" data-bulk-section-mode="existing">
            ${sectionHeader('<input type="radio" name="bulkTabCardMode" value="existing" checked onchange="setBulkTabCardMode(\'existing\')"><span>Move into existing card in destination tab</span>')}
            <div class="bulk-section-body">
                <input type="search" id="bulk-tab-card-filter" class="bulk-target-filter" placeholder="Filter destination cards" oninput="renderBulkTabCardOptions()">
                <div id="bulk-tab-card-existing-list" class="bulk-target-list" role="listbox" aria-label="Destination card in tab" data-selected=""></div>
            </div>
        </div>

        <div class="bulk-move-section" data-bulk-section-group="bulkTabCardMode" data-bulk-section-mode="new">
            ${sectionHeader('<input type="radio" name="bulkTabCardMode" value="new" onchange="setBulkTabCardMode(\'new\')"><span>Create new card in destination tab</span>')}
            <div class="bulk-section-body">
                <input type="text" id="bulk-tab-card-new-input" placeholder="New card name" disabled>
            </div>
        </div>

        <div class="bulk-move-actions">
            <button type="button" class="btn-primary" onclick="confirmBulkTabMove()">Apply Tab Move</button>
            <button type="button" onclick="closeBulkTabModal()">Cancel</button>
        </div>
    </div>
</div>
`;

    const bulkMergeModalTemplate = `
<div id="bulk-merge-modal-overlay" style="display:none;">
    <div id="bulk-merge-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-merge-modal-title">
        <h3 id="bulk-merge-modal-title">Merge Selected Bookmarks</h3>
        <p class="bulk-move-subtitle">Pick how to fold the selected bookmarks together.</p>
        <div class="bulk-move-summary" id="bulk-merge-selection-summary">No bookmarks selected.</div>

        <div class="bulk-move-section" data-bulk-section-group="bulkMergeMode" data-bulk-section-mode="title">
            ${sectionHeader('<input type="radio" name="bulkMergeMode" value="title" checked onchange="setBulkMergeMode(\'title\')"><span>Group bookmarks with matching titles</span>')}
            <div class="bulk-section-body">
                <p class="bulk-move-subtitle bulk-merge-mode-hint" data-merge-mode="title">
                    Selected bookmarks are grouped by title; each group collapses into one main bookmark.
                </p>
            </div>
        </div>

        <div class="bulk-move-section" data-bulk-section-group="bulkMergeMode" data-bulk-section-mode="all">
            ${sectionHeader('<input type="radio" name="bulkMergeMode" value="all" onchange="setBulkMergeMode(\'all\')"><span>Merge all selected as one bookmark (different titles allowed)</span>')}
            <div class="bulk-section-body">
                <p class="bulk-move-subtitle bulk-merge-mode-hint" data-merge-mode="all">
                    Use this when titles differ but the bookmarks point to the same thing
                    (e.g. <em>Monarch</em> and <em>Monarch: The Monster Legacy</em>). Pick which one is the main bookmark below.
                </p>
                <div id="bulk-merge-base-picker" class="bulk-merge-base-picker" hidden></div>
            </div>
        </div>

        <div class="bulk-move-actions">
            <button type="button" class="btn-primary" onclick="confirmBulkMerge()">Merge</button>
            <button type="button" onclick="closeBulkMergeModal()">Cancel</button>
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
        if (!document.getElementById('bulk-merge-modal-overlay')) {
            document.body.insertAdjacentHTML('beforeend', bulkMergeModalTemplate);
        }
    }

    Object.assign(ns, {
        initBulkToolbar
    });
    ns.templatesReady = true;
})();
