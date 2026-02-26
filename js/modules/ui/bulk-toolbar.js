// --- BULK TOOLBAR MODULE ---

// HTML Template
const bulkToolbarTemplate = `
<div id="bulk-toolbar">
    <span id="bulk-count" style="color:white; font-weight:bold;">0 Selected</span>
    <button onclick="bulkDelete()" class="btn-danger">Delete</button>
    <button onclick="bulkMove()">Move</button>
    <button onclick="bulkWorkspace()">Workspace</button>
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

// Inject HTML
function initBulkToolbar() {
    if (!document.getElementById('bulk-toolbar')) {
        document.body.insertAdjacentHTML('beforeend', bulkToolbarTemplate);
    }
    if (!document.getElementById('bulk-move-modal-overlay')) {
        document.body.insertAdjacentHTML('beforeend', bulkMoveModalTemplate);
    }
}

// Logic
let bulkMode = false;
let selectedIds = new Set();

function toggleBulkMode() {
    bulkMode = !bulkMode;
    selectedIds.clear();
    document.body.classList.toggle('bulk-active', bulkMode);
    if (!bulkMode) closeBulkMoveModal();
    updateBulkUI();
}

function toggleSelect(id, e) {
    e.stopPropagation();
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateBulkUI();
}

function updateBulkUI() {
    const el = document.getElementById('bulk-count');
    if (el) el.innerText = `${selectedIds.size} Selected`;
}

function getAllCategoryNames() {
    const names = [...new Set(
        links
            .map(link => String(link.category || 'Unsorted').trim())
            .filter(Boolean)
    )];

    if (!names.includes('Unsorted')) names.push('Unsorted');
    return names.sort((a, b) => a.localeCompare(b));
}

function escapeBulkMoveHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSelectedCategoryName() {
    const selectedLinks = links.filter(link => selectedIds.has(link.id));
    if (!selectedLinks.length) return 'Unsorted';
    return String(selectedLinks[0].category || 'Unsorted').trim() || 'Unsorted';
}

function renderBulkMoveCategoryOptions() {
    const select = document.getElementById('bulk-move-existing-select');
    if (!select) return;
    const names = getAllCategoryNames();
    const currentCategory = getSelectedCategoryName();
    select.innerHTML = names.map(name => {
        const selected = name === currentCategory ? ' selected' : '';
        const safeName = escapeBulkMoveHtml(name);
        return `<option value="${safeName}"${selected}>${safeName}</option>`;
    }).join('');
}

function setBulkMoveMode(mode) {
    const isNewMode = mode === 'new';
    const select = document.getElementById('bulk-move-existing-select');
    const input = document.getElementById('bulk-move-new-input');
    const existingRadio = document.querySelector('input[name="bulkMoveMode"][value="existing"]');
    const newRadio = document.querySelector('input[name="bulkMoveMode"][value="new"]');

    if (existingRadio) existingRadio.checked = !isNewMode;
    if (newRadio) newRadio.checked = isNewMode;
    if (select) select.disabled = isNewMode;
    if (input) {
        input.disabled = !isNewMode;
        if (isNewMode) input.focus();
    }
}

function openBulkMoveModal() {
    const overlay = document.getElementById('bulk-move-modal-overlay');
    if (!overlay) return;
    renderBulkMoveCategoryOptions();
    setBulkMoveMode('existing');
    const input = document.getElementById('bulk-move-new-input');
    if (input) input.value = '';
    overlay.style.display = 'flex';
}

function closeBulkMoveModal() {
    const overlay = document.getElementById('bulk-move-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function resolveBulkMoveCategory() {
    const mode = document.querySelector('input[name="bulkMoveMode"]:checked')?.value || 'existing';
    if (mode === 'new') {
        return String(document.getElementById('bulk-move-new-input')?.value || '').trim();
    }
    return String(document.getElementById('bulk-move-existing-select')?.value || '').trim();
}

function applyBulkCategoryMove(nextCategory) {
    const categoryName = String(nextCategory || '').trim();
    if (!categoryName) return false;

    const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
    links.forEach(link => {
        if (!selectedIds.has(link.id)) return;
        link.category = categoryName;
        if (typeof syncLinked === 'function') {
            syncLinked(link.id);
        }
    });
    return true;
}

async function bulkDelete() {
    if (await showConfirm(`Delete ${selectedIds.size}?`)) {
        links = links.filter(l => !selectedIds.has(l.id));
        toggleBulkMode();
        saveData();
    }
}

async function bulkMove() {
    if (selectedIds.size === 0) {
        showToast("Select at least one bookmark first.", "warning");
        return;
    }
    openBulkMoveModal();
}

function confirmBulkMove() {
    const nextCategory = resolveBulkMoveCategory();
    const movedCount = selectedIds.size;
    if (!nextCategory) {
        showToast("Enter or select a category.", "warning");
        return;
    }

    if (!applyBulkCategoryMove(nextCategory)) {
        showToast("Unable to move bookmarks.", "error");
        return;
    }

    closeBulkMoveModal();
    toggleBulkMode();
    saveData();
    showToast(`Moved ${movedCount} bookmark(s) to "${nextCategory}"`, "success");
}

async function bulkWorkspace() {
    let msg = "IDs:\n";
    config.workspaces.forEach(w => msg += `${w.id}: ${w.name}\n`);
    const id = await showPrompt(msg);
    if (id && config.workspaces.find(w => w.id === id)) {
        links.forEach(l => {
            if (selectedIds.has(l.id)) l.workspace = id;
        });
        toggleBulkMode();
        saveData();
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBulkToolbar);
} else {
    initBulkToolbar();
}

window.setBulkMoveMode = setBulkMoveMode;
window.closeBulkMoveModal = closeBulkMoveModal;
window.confirmBulkMove = confirmBulkMove;

document.addEventListener('mousedown', (event) => {
    const overlay = document.getElementById('bulk-move-modal-overlay');
    if (!overlay || overlay.style.display !== 'flex') return;
    if (event.target === overlay) closeBulkMoveModal();
});
