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

// Inject HTML
function initBulkToolbar() {
    if (!document.getElementById('bulk-toolbar')) {
        document.body.insertAdjacentHTML('beforeend', bulkToolbarTemplate);
    }
}

// Logic
let bulkMode = false;
let selectedIds = new Set();

function toggleBulkMode() {
    bulkMode = !bulkMode;
    selectedIds.clear();
    document.body.classList.toggle('bulk-active', bulkMode);
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

async function bulkDelete() {
    if (await showConfirm(`Delete ${selectedIds.size}?`)) {
        links = links.filter(l => !selectedIds.has(l.id));
        toggleBulkMode();
        saveData();
    }
}

async function bulkMove() {
    const n = await showPrompt("New Category:");
    if (n) {
        links.forEach(l => {
            if (selectedIds.has(l.id)) l.category = n;
        });
        toggleBulkMode();
        saveData();
    }
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
