window.tempSources = []; // Store sources temporarily while editing

window.openAddModal = function () {
    refreshCategoryDatalist();
    document.getElementById('modalTitle').innerText = "Add Link";
    document.getElementById('editId').value = "";
    document.getElementById('newTitle').value = "";
    document.getElementById('newUrl').value = "";
    document.getElementById('newCategory').value = "";
    document.getElementById('newPriority').value = "";
    document.getElementById('newIcon').value = "";

    // Reset Sources
    window.tempSources = [];
    renderSourcesList();
    document.getElementById('edit-link-search-results').style.display = 'none';

    document.getElementById('addModal').style.display = 'flex';
    document.getElementById('newTitle').focus();
};

window.openEdit = function (id) {
    const l = links.find(x => x.id === id);
    if (!l) return;
    refreshCategoryDatalist();
    document.getElementById('modalTitle').innerText = "Edit Link";
    document.getElementById('editId').value = l.id;
    document.getElementById('newTitle').value = l.title;
    document.getElementById('newUrl').value = l.url;
    document.getElementById('newCategory').value = l.category;
    document.getElementById('newPriority').value = l.priority || "";
    document.getElementById('newIcon').value = l.icon || "";

    // Load Sources
    window.tempSources = l.sources ? [...l.sources] : [];
    renderSourcesList();
    document.getElementById('edit-link-search-results').style.display = 'none';

    document.getElementById('addModal').style.display = 'flex';
};

window.saveLink = function () {
    const id = document.getElementById('editId').value;
    const title = document.getElementById('newTitle').value.trim();
    const url = normalizeUrl(document.getElementById('newUrl').value);
    const cat = document.getElementById('newCategory').value.trim() || "Unsorted";
    const prio = document.getElementById('newPriority').value;
    const icon = document.getElementById('newIcon').value.trim();

    if (!title || !url) return showToast("Missing Info", "warning");

    const editId = document.getElementById('editId').value;
    if (editId) {
        // Edit existing
        const idx = links.findIndex(l => l.id == editId);
        if (idx > -1) {
            links[idx].title = title;
            links[idx].url = url;
            links[idx].category = cat;
            links[idx].priority = prio;
            if (icon) links[idx].icon = icon;
            links[idx].sources = [...window.tempSources]; // Save sources
        }
    } else {
        // Add new
        const newId = Date.now();
        links.push({
            id: newId,
            title,
            url,
            category: cat,
            icon: icon || '🔗',
            done: false,
            pinned: false,
            priority: prio,
            workspace: config.activeWorkspace,
            sources: [...window.tempSources] // Save sources
        });
    }
    saveData();
    closeModals();
    showToast("Link Saved", "success");
};

window.handleEnter = function (e) { if (e.key === 'Enter') saveLink(); };

// --- Sources Logic ---


