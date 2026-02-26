// --- SIDEBAR UI ---

function renderSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = '';
    config.workspaces.forEach(ws => {
        const item = document.createElement('div');
        item.className = `ws-item ${config.activeWorkspace === ws.id ? 'active' : ''}`;
        item.innerHTML = `${ws.icon} <span class="ws-label">${ws.name}</span>`;
        item.onclick = () => switchWorkspace(ws.id);
        item.oncontextmenu = (e) => showWsContext(e, ws.id);
        sb.appendChild(item);
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+';
    addBtn.onclick = () => openWorkspaceModal(null);
    sb.appendChild(addBtn);
}
