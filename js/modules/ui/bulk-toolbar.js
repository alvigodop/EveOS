// --- BULK TOOLBAR MODULE ---

// HTML Template
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

// Inject HTML
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

// Logic
let bulkMode = false;
let selectedIds = new Set();

function toBulkId(value) {
    return String(value);
}

function toggleBulkMode() {
    bulkMode = !bulkMode;
    selectedIds.clear();
    document.body.classList.toggle('bulk-active', bulkMode);
    if (!bulkMode) {
        closeBulkMoveModal();
        closeBulkTabModal();
    }
    updateBulkUI();
}

function toggleSelect(id, e) {
    e.stopPropagation();
    const selectedId = toBulkId(id);
    if (selectedIds.has(selectedId)) selectedIds.delete(selectedId);
    else selectedIds.add(selectedId);
    updateBulkUI();
}

function updateBulkUI() {
    const el = document.getElementById('bulk-count');
    if (el) el.innerText = `${selectedIds.size} Selected`;
}

function getAllCategoryNames(workspaceId) {
    const scopedWorkspaceId = String(workspaceId || '').trim();
    const scopedLinks = scopedWorkspaceId
        ? links.filter(link => String(link.workspace || '').trim() === scopedWorkspaceId)
        : links;

    const names = [...new Set(
        scopedLinks
            .map(link => String(link.category || 'Unsorted').trim())
            .filter(Boolean)
    )];

    if (!names.includes('Unsorted')) names.push('Unsorted');
    return names.sort((a, b) => a.localeCompare(b));
}

function getVisibleDashboardCategoryNames() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return [];

    const names = [...new Set(
        Array.from(grid.querySelectorAll('.category-card .category-title'))
            .map(node => String(node.textContent || '').trim())
            .filter(Boolean)
    )];

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
    const selectedLinks = links.filter(link => selectedIds.has(toBulkId(link.id)));
    if (!selectedLinks.length) return 'Unsorted';
    return String(selectedLinks[0].category || 'Unsorted').trim() || 'Unsorted';
}

function getSelectedWorkspaceForMove() {
    const activeWorkspaceId = String(config?.activeWorkspace || '').trim();
    if (activeWorkspaceId) return activeWorkspaceId;
    const selectedLink = links.find(link => selectedIds.has(toBulkId(link.id)));
    return String(selectedLink?.workspace || '').trim();
}

function renderBulkMoveCategoryOptions() {
    const select = document.getElementById('bulk-move-existing-select');
    if (!select) return;
    const names = (() => {
        const visibleNames = getVisibleDashboardCategoryNames();
        if (visibleNames.length > 0) return visibleNames;
        return getAllCategoryNames(getSelectedWorkspaceForMove());
    })();
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
        if (!selectedIds.has(toBulkId(link.id))) return;
        link.category = categoryName;
        if (typeof syncLinked === 'function') {
            syncLinked(link.id);
        }
    });
    return true;
}

function getWorkspaceList() {
    const list = Array.isArray(config?.workspaces) ? config.workspaces : [];
    return list
        .map(workspace => ({
            id: String(workspace?.id || ''),
            name: String(workspace?.name || '').trim() || 'Unnamed',
            icon: String(workspace?.icon || '').trim()
        }))
        .filter(workspace => workspace.id);
}

function getSelectedWorkspaceId() {
    const selectedLink = links.find(link => selectedIds.has(toBulkId(link.id)));
    if (selectedLink?.workspace) return String(selectedLink.workspace);
    return String(config?.activeWorkspace || getWorkspaceList()[0]?.id || '');
}

function renderBulkTabOptions() {
    const select = document.getElementById('bulk-tab-existing-select');
    if (!select) return;

    const workspaces = getWorkspaceList();
    const currentWorkspaceId = getSelectedWorkspaceId();
    select.innerHTML = workspaces.map(workspace => {
        const selected = workspace.id === currentWorkspaceId ? ' selected' : '';
        const safeId = escapeBulkMoveHtml(workspace.id);
        const safeLabel = escapeBulkMoveHtml(`${workspace.icon ? `${workspace.icon} ` : ''}${workspace.name}`);
        return `<option value="${safeId}"${selected}>${safeLabel}</option>`;
    }).join('');
}

function setBulkTabMode(mode) {
    const isNewMode = mode === 'new';
    const select = document.getElementById('bulk-tab-existing-select');
    const input = document.getElementById('bulk-tab-new-name-input');
    const existingRadio = document.querySelector('input[name="bulkTabMode"][value="existing"]');
    const newRadio = document.querySelector('input[name="bulkTabMode"][value="new"]');

    if (existingRadio) existingRadio.checked = !isNewMode;
    if (newRadio) newRadio.checked = isNewMode;
    if (select) select.disabled = isNewMode;
    if (input) {
        input.disabled = !isNewMode;
        if (isNewMode) input.focus();
    }
}

function openBulkTabModal() {
    const overlay = document.getElementById('bulk-tab-modal-overlay');
    if (!overlay) return;
    renderBulkTabOptions();
    setBulkTabMode('existing');
    const input = document.getElementById('bulk-tab-new-name-input');
    if (input) input.value = '';
    overlay.style.display = 'flex';
}

function closeBulkTabModal() {
    const overlay = document.getElementById('bulk-tab-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function resolveBulkWorkspaceTarget() {
    const mode = document.querySelector('input[name="bulkTabMode"]:checked')?.value || 'existing';
    if (mode === 'new') {
        const name = String(document.getElementById('bulk-tab-new-name-input')?.value || '').trim();
        if (!name) return null;

        const existingByName = getWorkspaceList().find(workspace => workspace.name.toLowerCase() === name.toLowerCase());
        if (existingByName) return { workspaceId: existingByName.id, workspaceName: existingByName.name };

        const workspaceId = `ws_${Date.now()}`;
        const newWorkspace = { id: workspaceId, name, icon: '📁' };
        if (!Array.isArray(config.workspaces)) config.workspaces = [];
        config.workspaces.push(newWorkspace);
        saveConfig();
        if (typeof renderSidebar === 'function') renderSidebar();
        return { workspaceId, workspaceName: name };
    }

    const workspaceId = String(document.getElementById('bulk-tab-existing-select')?.value || '').trim();
    const workspace = getWorkspaceList().find(item => item.id === workspaceId);
    if (!workspaceId || !workspace) return null;
    return { workspaceId, workspaceName: workspace.name };
}

function applyBulkWorkspaceMove(workspaceId) {
    const targetWorkspaceId = String(workspaceId || '').trim();
    if (!targetWorkspaceId) return false;

    const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;
    links.forEach(link => {
        if (!selectedIds.has(toBulkId(link.id))) return;
        link.workspace = targetWorkspaceId;
        if (typeof syncLinked === 'function') {
            syncLinked(link.id);
        }
    });
    return true;
}

async function bulkDelete() {
    if (await showConfirm(`Delete ${selectedIds.size}?`)) {
        links = links.filter(l => !selectedIds.has(toBulkId(l.id)));
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
    if (selectedIds.size === 0) {
        showToast("Select at least one bookmark first.", "warning");
        return;
    }
    openBulkTabModal();
}

function confirmBulkTabMove() {
    const movedCount = selectedIds.size;
    const target = resolveBulkWorkspaceTarget();
    if (!target?.workspaceId) {
        showToast("Select a tab or enter a new tab name.", "warning");
        return;
    }

    if (!applyBulkWorkspaceMove(target.workspaceId)) {
        showToast("Unable to move bookmarks to tab.", "error");
        return;
    }

    closeBulkTabModal();
    toggleBulkMode();
    saveData();
    showToast(`Moved ${movedCount} bookmark(s) to tab "${target.workspaceName}"`, "success");
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
window.setBulkTabMode = setBulkTabMode;
window.closeBulkTabModal = closeBulkTabModal;
window.confirmBulkTabMove = confirmBulkTabMove;

document.addEventListener('mousedown', (event) => {
    const moveOverlay = document.getElementById('bulk-move-modal-overlay');
    if (moveOverlay && moveOverlay.style.display === 'flex' && event.target === moveOverlay) {
        closeBulkMoveModal();
        return;
    }

    const tabOverlay = document.getElementById('bulk-tab-modal-overlay');
    if (tabOverlay && tabOverlay.style.display === 'flex' && event.target === tabOverlay) {
        closeBulkTabModal();
    }
});
