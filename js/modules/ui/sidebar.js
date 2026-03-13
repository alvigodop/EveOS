// --- SIDEBAR UI ---

function renderSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = '';

    const unidexBtn = document.createElement('div');
    unidexBtn.className = `ws-item ws-unidex ${config.viewMode === 'unidex' ? 'active' : ''}`;
    unidexBtn.innerHTML = `🧭 <span class="ws-label">Unidex Layer</span>`;
    unidexBtn.title = 'Open Unidex View';
    unidexBtn.oncontextmenu = (e) => {
        if (typeof showUnidexContextMenu === 'function') showUnidexContextMenu(e);
    };
    unidexBtn.onclick = () => {
        if (typeof openUnidexView === 'function') {
            openUnidexView();
        } else {
            config.viewMode = 'unidex';
            if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
                window.UnidexView.resetSelection();
            }
            saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    };
    sb.appendChild(unidexBtn);

    const divider = document.createElement('div');
    divider.className = 'ws-divider';
    sb.appendChild(divider);

    config.workspaces.forEach(ws => {
        const item = document.createElement('div');
        const isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id;
        item.className = `ws-item ${isWorkspaceActive ? 'active' : ''}`;
        item.innerHTML = `${ws.icon} <span class="ws-label">${ws.name}</span>`;
        item.onclick = () => {
            if (config.viewMode === 'unidex') {
                if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
                    window.UnidexView.resetSelection();
                }
                config.viewMode = 'grid';
                saveConfig();
            }
            switchWorkspace(ws.id);
        };
        item.oncontextmenu = (e) => showWsContext(e, ws.id);
        sb.appendChild(item);
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+';
    addBtn.onclick = () => openWorkspaceModal(null);
    sb.appendChild(addBtn);
}
