window.openRenameModal = function (oldName) {
    document.getElementById('oldCatName').value = oldName;
    document.getElementById('renameInput').value = oldName;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
};

window.confirmRename = function () {
    const o = document.getElementById('oldCatName').value;
    const name = document.getElementById('renameInput').value.trim();
    if (!name) return showToast("Name required", "warning");
    if (name && name !== o) {
        links.forEach(l => {
            if (l.category !== o) return;
            l.category = name;
            window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(l.id);
        });
        const idx = config.categoryOrder.indexOf(o);
        if (idx > -1) config.categoryOrder[idx] = name;
        if (config.hideStats.includes(o)) {
            config.hideStats = config.hideStats.filter(c => c !== o);
            config.hideStats.push(name);
        }
        saveConfig();
        saveData();
    }
    closeModals();
};

window.handleRenameEnter = function (e) { if (e.key === 'Enter') confirmRename(); };
