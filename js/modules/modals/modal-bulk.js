// --- BULK IMPORT ---

function getBulkMode() {
    return document.getElementById('bulkModeName')?.checked ? 'name' : 'url';
}

function updateBulkModeUi() {
    const mode = getBulkMode();
    const text = document.getElementById('bulkText');
    const hint = document.getElementById('bulkModeHint');
    if (!text || !hint) return;

    if (mode === 'name') {
        text.placeholder = "One name per line...";
        hint.textContent = "Names-only mode: each line becomes a bookmark title and URL is a Google search link.";
    } else {
        text.placeholder = "One URL per line...";
        hint.textContent = "URL mode: each line should be a URL.";
    }
}

function initBulkModeUi() {
    const url = document.getElementById('bulkModeUrl');
    const name = document.getElementById('bulkModeName');
    if (url) url.onchange = updateBulkModeUi;
    if (name) name.onchange = updateBulkModeUi;
    updateBulkModeUi();
}

function openBulkModal() {
    refreshCategoryDatalist();
    document.getElementById('bulkModal').style.display = 'flex';
    initBulkModeUi();
    document.getElementById('bulkText').focus();
}

function clearBulkInput() {
    document.getElementById('bulkText').value = '';
    document.getElementById('bulkText').focus();
}

function processBulk() {
    const text = document.getElementById('bulkText').value;
    const catInput = document.getElementById('bulkCategory');
    const targetCategory = (catInput && catInput.value.trim()) ? catInput.value.trim() : "Unsorted";
    const mode = getBulkMode();

    if (!text) return showToast("No entries found", "warning");

    const lines = text.split('\n');
    let count = 0;

    lines.forEach(line => {
        const raw = line.trim();
        if (!raw) return;

        if (mode === 'name') {
            const title = raw;
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
            links.push({
                id: Date.now() + Math.random(),
                title,
                url: searchUrl,
                category: targetCategory,
                workspace: config.activeWorkspace,
                icon: '',
                done: false,
                pinned: false
            });
        } else {
            const url = raw;
            links.push({
                id: Date.now() + Math.random(),
                title: url,
                url: normalizeUrl(url),
                category: targetCategory,
                workspace: config.activeWorkspace,
                icon: '',
                done: false,
                pinned: false
            });
        }

        count++;
    });

    saveData();
    closeModals();
    const label = mode === 'name' ? 'names' : 'links';
    showToast(`Imported ${count} ${label} to "${targetCategory}"`, "success");
}

