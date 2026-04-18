function getSidebarGroupsApi() {
    return window.EveSidebarGroups || null;
}

function populateWorkspaceGroupSelect(selectedGroupId) {
    const select = document.getElementById('wsGroupId');
    if (!select) return;

    const groupsApi = getSidebarGroupsApi();
    if (!groupsApi) {
        select.innerHTML = '<option value="">No Group</option>';
        return;
    }

    groupsApi.ensureConfigDefaults(config);
    const groups = groupsApi.getGroups(config);
    const activeGroupId = String(selectedGroupId || '').trim();

    select.innerHTML = '<option value="">No Group</option>';
    groups.forEach(function (group) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        option.selected = group.id === activeGroupId;
        select.appendChild(option);
    });
    select.value = activeGroupId;
}

function setWorkspaceGroupRowVisible(isVisible, selectedGroupId) {
    const row = document.getElementById('wsGroupRow');
    const select = document.getElementById('wsGroupId');
    if (!row || !select) return;

    const groupsApi = getSidebarGroupsApi();
    const hasGroups = groupsApi ? groupsApi.getGroups(config).length > 0 : false;
    const shouldShow = !!isVisible && (hasGroups || !!String(selectedGroupId || '').trim());

    row.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) {
        populateWorkspaceGroupSelect(selectedGroupId);
    } else {
        select.value = '';
    }
}

window.openWorkspaceModal = function (id, options) {
    const modal = document.getElementById('wsModal');
    if (!modal) return;

    const opts = options && typeof options === 'object' ? options : {};
    const helpers = window.EveWorkspaceHelpers;
    const parentIdInput = document.getElementById('wsParentId');

    if (id) {
        const ws = helpers
            ? helpers.findById(config.workspaces, id)
            : config.workspaces.find(function (workspace) { return workspace.id === id; });
        if (!ws) return;

        const parent = helpers && typeof helpers.findParent === 'function'
            ? helpers.findParent(config.workspaces, id)
            : null;
        const isRootWorkspace = !parent;

        document.getElementById('wsName').value = ws.name || '';
        document.getElementById('wsIcon').value = ws.icon || '\u{1F4C1}';
        document.getElementById('wsEditId').value = id;
        if (parentIdInput) parentIdInput.value = '';
        setWorkspaceGroupRowVisible(isRootWorkspace, ws.groupId || '');
    } else {
        document.getElementById('wsName').value = '';
        document.getElementById('wsIcon').value = '\u{1F4C1}';
        document.getElementById('wsEditId').value = '';
        if (parentIdInput) parentIdInput.value = opts.parentId || '';
        setWorkspaceGroupRowVisible(!opts.parentId, opts.groupId || '');
    }

    modal.style.display = 'flex';
};

window.saveWorkspace = function () {
    const id = document.getElementById('wsEditId').value;
    const name = document.getElementById('wsName').value.trim();
    const icon = document.getElementById('wsIcon').value || '\u{1F4C1}';
    const parentIdInput = document.getElementById('wsParentId');
    const parentId = parentIdInput ? parentIdInput.value : '';
    const groupSelect = document.getElementById('wsGroupId');
    const rawGroupId = groupSelect ? String(groupSelect.value || '').trim() : '';
    const helpers = window.EveWorkspaceHelpers;
    const groupsApi = getSidebarGroupsApi();

    if (!name) return alert('Name required');

    const resolvedGroupId = groupsApi && rawGroupId && groupsApi.findGroupById(rawGroupId, config)
        ? rawGroupId
        : '';

    if (id) {
        const ws = helpers
            ? helpers.findById(config.workspaces, id)
            : config.workspaces.find(function (workspace) { return workspace.id === id; });
        if (ws) {
            const previousGroupId = groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
                ? groupsApi.getWorkspaceGroupId(id, config)
                : String(ws.groupId || '').trim();
            ws.name = name;
            ws.icon = icon;

            const isRootWorkspace = !(helpers && typeof helpers.findParent === 'function' && helpers.findParent(config.workspaces, id));
            if (isRootWorkspace) {
                if (resolvedGroupId && groupsApi && typeof groupsApi.canGroupWorkspaceInGroup === 'function'
                    && !groupsApi.canGroupWorkspaceInGroup(id, resolvedGroupId, config)) {
                    return alert('This group is nested inside that tab branch, so assigning the tab to it would create a recursive sidebar layout.');
                }
                if (resolvedGroupId) ws.groupId = resolvedGroupId;
                else delete ws.groupId;
                if (groupsApi && typeof groupsApi.syncWorkspaceOrderEntry === 'function') {
                    groupsApi.syncWorkspaceOrderEntry(id, previousGroupId, resolvedGroupId, config);
                }
            } else {
                delete ws.groupId;
                if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
                    groupsApi.removeManualOrderEntry('workspace', id, config);
                }
            }
        }
    } else {
        const newId = 'ws_' + Date.now();
        const newTab = { id: newId, name: name, icon: icon, subTabs: [] };

        if (parentId && helpers) {
            const added = helpers.addSubTab(config.workspaces, parentId, newTab);
            if (!added) {
                if (resolvedGroupId) newTab.groupId = resolvedGroupId;
                config.workspaces.push(newTab);
            }
        } else {
            if (resolvedGroupId) newTab.groupId = resolvedGroupId;
            config.workspaces.push(newTab);
        }
        if (!parentId && groupsApi && typeof groupsApi.syncWorkspaceOrderEntry === 'function') {
            groupsApi.syncWorkspaceOrderEntry(newId, '', resolvedGroupId, config);
        }
        switchWorkspace(newId);
    }

    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    closeModals();
};

window.openSidebarGroupModal = function (groupId) {
    const modal = document.getElementById('sidebarGroupModal');
    if (!modal) return;

    const groupsApi = getSidebarGroupsApi();
    if (!groupsApi) return;
    groupsApi.ensureConfigDefaults(config);

    const existing = groupId ? groupsApi.findGroupById(groupId, config) : null;
    document.getElementById('sidebarGroupModalTitle').textContent = existing ? 'Edit Sidebar Group' : 'Create Sidebar Group';
    document.getElementById('sgEditId').value = existing ? existing.id : '';
    document.getElementById('sgName').value = existing ? (existing.name || '') : '';
    document.getElementById('sgColor').value = existing ? (existing.color || '#00d4ff') : '#00d4ff';
    modal.style.display = 'flex';
};

window.saveSidebarGroup = async function () {
    const groupsApi = getSidebarGroupsApi();
    if (!groupsApi) return;

    const editId = String(document.getElementById('sgEditId').value || '').trim();
    const name = document.getElementById('sgName').value.trim();
    const color = document.getElementById('sgColor').value || '#00d4ff';

    if (!name) return alert('Group name required');

    groupsApi.ensureConfigDefaults(config);
    if (editId) {
        groupsApi.updateGroup(editId, { name: name, color: color }, config);
    } else {
        groupsApi.createGroup({ name: name, color: color }, config);
    }

    let persisted = true;
    if (typeof saveConfig === 'function') {
        persisted = await Promise.resolve(saveConfig({ immediate: true }));
    }
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof closeAllMenus === 'function') closeAllMenus();
    if (persisted === false) {
        if (typeof showToast === 'function') {
            showToast('Sidebar group updated, but config persistence failed', 'error');
        }
    } else if (typeof showToast === 'function') {
        showToast(editId ? 'Sidebar group updated' : 'Sidebar group created', 'success');
    }
    closeModals();
};
