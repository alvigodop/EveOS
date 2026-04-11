// --- SIDEBAR UI ---

function renderSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = '';

    // --- Unidex Button (preserved exactly) ---
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

    // --- Collapse state ---
    if (!Array.isArray(config.collapsedTabs)) config.collapsedTabs = [];

    // --- Recursive workspace tree rendering ---
    function renderWorkspaceItem(ws, container, depth) {
        const currentDepth = typeof depth === 'number' ? depth : 0;
        const hasChildren = Array.isArray(ws.subTabs) && ws.subTabs.length > 0;
        const isCollapsed = config.collapsedTabs.includes(ws.id);
        const isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id;

        const wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }

        const item = document.createElement('div');
        item.className = `ws-item ${isWorkspaceActive ? 'active' : ''}`;
        if (currentDepth > 0) item.classList.add('ws-sub-item');

        // Toggle arrow for items with children
        if (hasChildren) {
            const toggle = document.createElement('span');
            toggle.className = 'ws-toggle';
            toggle.textContent = isCollapsed ? '▶' : '▼';
            toggle.onclick = (e) => {
                e.stopPropagation();
                if (config.collapsedTabs.includes(ws.id)) {
                    config.collapsedTabs = config.collapsedTabs.filter(id => id !== ws.id);
                } else {
                    config.collapsedTabs.push(ws.id);
                }
                saveConfig();
                renderSidebar();
            };
            item.appendChild(toggle);
        } else if (currentDepth > 0) {
            // Spacer to align with sibling toggles
            const spacer = document.createElement('span');
            spacer.className = 'ws-spacer';
            item.appendChild(spacer);
        }

        // Icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'ws-icon';
        iconSpan.textContent = ws.icon || '📁';
        item.appendChild(iconSpan);

        // Label
        const label = document.createElement('span');
        label.className = 'ws-label';
        label.textContent = ws.name;
        item.appendChild(label);

        // Hidden-in-parent indicator
        if (ws.hiddenInParent && currentDepth > 0) {
            item.classList.add('ws-hidden-in-parent');
            const hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-hidden-badge';
            hiddenBadge.textContent = '👁‍🗨';
            hiddenBadge.title = 'Hidden from parent tab view';
            item.appendChild(hiddenBadge);
        }

        // Click handler (preserved original logic exactly)
        item.onclick = () => {
            const exitingUnidex = config.viewMode === 'unidex';
            if (exitingUnidex) {
                if (window.UnidexView && typeof window.UnidexView.resetSelection === 'function') {
                    window.UnidexView.resetSelection();
                }
                config.viewMode = 'grid';
                saveConfig();
            }
            switchWorkspace(ws.id, { forceRender: exitingUnidex });
        };

        // Context menu (preserved original)
        item.oncontextmenu = (e) => showWsContext(e, ws.id);

        wrapper.appendChild(item);
        container.appendChild(wrapper);

        // Render children recursively
        if (hasChildren && !isCollapsed) {
            ws.subTabs.forEach(child => renderWorkspaceItem(child, container, currentDepth + 1));
        }
    }

    config.workspaces.forEach(ws => renderWorkspaceItem(ws, sb, 0));

    // --- Add button (preserved) ---
    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+';
    addBtn.onclick = () => openWorkspaceModal(null);
    sb.appendChild(addBtn);
}
