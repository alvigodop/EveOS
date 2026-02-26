window.openWorkspaceModal = function (id) {
    const modal = document.getElementById('wsModal');
    if (!modal) return;
    if (id) {
        const ws = config.workspaces.find(w => w.id === id);
        document.getElementById('wsName').value = ws.name;
        document.getElementById('wsIcon').value = ws.icon;
        document.getElementById('wsEditId').value = id;
    } else {
        document.getElementById('wsName').value = "";
        document.getElementById('wsIcon').value = "📁";
        document.getElementById('wsEditId').value = "";
    }
    modal.style.display = 'flex';
};

window.saveWorkspace = function () {
    const id = document.getElementById('wsEditId').value;
    const name = document.getElementById('wsName').value;
    const icon = document.getElementById('wsIcon').value;

    if (!name) return alert("Name required");

    if (id) {
        const ws = config.workspaces.find(w => w.id === id);
        ws.name = name;
        ws.icon = icon;
    } else {
        const newId = 'ws_' + Date.now();
        config.workspaces.push({ id: newId, name, icon });
        switchWorkspace(newId);
    }
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    closeModals();
};
