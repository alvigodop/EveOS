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

    const helpers = window.EveWorkspaceHelpers;

    // --- Drag-and-drop helpers ---
    function isDescendantOf(dragId, targetId) {
        if (!helpers) return false;
        const target = helpers.findById(config.workspaces, targetId);
        if (!target) return false;
        return helpers.getDescendantIds(target).includes(dragId);
    }

    function moveWorkspaceToParent(dragId, targetParentId) {
        if (dragId === targetParentId) return;
        if (isDescendantOf(targetParentId, dragId)) return; // prevent circular
        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return;
        // Remove from current position
        config.workspaces = helpers.removeById(config.workspaces, dragId);
        // Add to target's subTabs
        helpers.addSubTab(config.workspaces, targetParentId, dragNode);
        saveConfig();
        renderSidebar();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function promoteToRoot(dragId) {
        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return;
        const depth = helpers.getDepth(config.workspaces, dragId);
        if (depth === 0) return; // already root
        config.workspaces = helpers.removeById(config.workspaces, dragId);
        config.workspaces.push(dragNode);
        saveConfig();
        renderSidebar();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

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

        // --- Drag source ---
        item.draggable = true;
        item.dataset.wsId = ws.id;
        item.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', ws.id);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('ws-dragging');
            // Mark sidebar as in-drag so we can style globally
            sb.classList.add('ws-drag-active');
        };
        item.ondragend = () => {
            item.classList.remove('ws-dragging');
            sb.classList.remove('ws-drag-active');
            // Clean up any lingering indicators
            sb.querySelectorAll('.ws-drop-target').forEach(el => el.classList.remove('ws-drop-target'));
        };

        // --- Drop target ---
        item.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = (e) => {
            e.preventDefault();
            const dragId = e.dataTransfer.types.includes('text/plain') ? true : false;
            if (dragId) item.classList.add('ws-drop-target');
        };
        item.ondragleave = () => {
            item.classList.remove('ws-drop-target');
        };
        item.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('ws-drop-target');
            const dragId = e.dataTransfer.getData('text/plain');
            if (!dragId || dragId === ws.id) return;
            moveWorkspaceToParent(dragId, ws.id);
        };

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

    // --- Add button + root drop zone ---
    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+ <span class="ws-label">Add / Drop</span>';
    addBtn.onclick = () => openWorkspaceModal(null);

    // Root promote drop zone — drop a sub-tab here to make it a root tab
    addBtn.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    addBtn.ondragenter = (e) => {
        e.preventDefault();
        addBtn.classList.add('ws-drop-target');
    };
    addBtn.ondragleave = () => {
        addBtn.classList.remove('ws-drop-target');
    };
    addBtn.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addBtn.classList.remove('ws-drop-target');
        const dragId = e.dataTransfer.getData('text/plain');
        if (!dragId) return;
        promoteToRoot(dragId);
    };

    sb.appendChild(addBtn);
}

