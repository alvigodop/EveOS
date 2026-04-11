window.openWorkspaceModal = function (id, options) {
    const modal = document.getElementById('wsModal');
    if (!modal) return;
    const opts = options && typeof options === 'object' ? options : {};
    const parentIdInput = document.getElementById('wsParentId');

    if (id) {
        // Edit mode: find workspace recursively
        const helpers = window.EveWorkspaceHelpers;
        const ws = helpers
            ? helpers.findById(config.workspaces, id)
            : config.workspaces.find(w => w.id === id);
        if (!ws) return;
        document.getElementById('wsName').value = ws.name;
        document.getElementById('wsIcon').value = ws.icon;
        document.getElementById('wsEditId').value = id;
        if (parentIdInput) parentIdInput.value = '';
    } else {
        // Create mode
        document.getElementById('wsName').value = "";
        document.getElementById('wsIcon').value = "📁";
        document.getElementById('wsEditId').value = "";
        if (parentIdInput) parentIdInput.value = opts.parentId || '';
    }
    modal.style.display = 'flex';
};

window.saveWorkspace = function () {
    const id = document.getElementById('wsEditId').value;
    const name = document.getElementById('wsName').value;
    const icon = document.getElementById('wsIcon').value;
    const parentIdInput = document.getElementById('wsParentId');
    const parentId = parentIdInput ? parentIdInput.value : '';

    if (!name) return alert("Name required");

    const helpers = window.EveWorkspaceHelpers;

    if (id) {
        // Edit existing — recursive lookup
        const ws = helpers
            ? helpers.findById(config.workspaces, id)
            : config.workspaces.find(w => w.id === id);
        if (ws) {
            ws.name = name;
            ws.icon = icon;
        }
    } else {
        // Create new
        const newId = 'ws_' + Date.now();
        const newTab = { id: newId, name, icon, subTabs: [] };

        if (parentId && helpers) {
            // Create as sub-tab
            const added = helpers.addSubTab(config.workspaces, parentId, newTab);
            if (!added) {
                // Fallback: add to root if parent not found
                config.workspaces.push(newTab);
            }
        } else {
            config.workspaces.push(newTab);
        }
        switchWorkspace(newId);
    }
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    closeModals();
};
