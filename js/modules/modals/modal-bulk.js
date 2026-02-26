// --- BULK IMPORT ---

function openBulkModal() {
    refreshCategoryDatalist();
    document.getElementById('bulkModal').style.display = 'flex';
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

    if (!text) return showToast("No URLs found", "warning");

    const lines = text.split('\n');
    let count = 0;
    lines.forEach(line => {
        const url = line.trim();
        if (url) {
            links.push({
                id: Date.now() + Math.random(),
                title: url,
                url: normalizeUrl(url),
                category: targetCategory,
                workspace: config.activeWorkspace,
                icon: '🔗',
                done: false,
                pinned: false
            });
            count++;
        }
    });

    saveData();
    closeModals();
    showToast(`Imported ${count} links to "${targetCategory}"`, "success");
}
