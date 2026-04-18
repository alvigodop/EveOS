// --- SIDEBAR UI ---

window.toggleSidebarVisibility = function () {
    config.sidebarHidden = !config.sidebarHidden;
    saveConfig();
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('hidden-completely', !!config.sidebarHidden);
    if (typeof renderSidebar === 'function') renderSidebar();
};

function renderSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;

    const helpers = window.EveWorkspaceHelpers;
    const groupsApi = window.EveSidebarGroups || null;
    let dragWorkspaceId = '';

    if (groupsApi && typeof groupsApi.ensureConfigDefaults === 'function') {
        groupsApi.ensureConfigDefaults(config);
    }

    sb.innerHTML = '';
    sb.classList.toggle('ultra-collapsed', !!config.ultraCollapseSidebar);
    sb.classList.toggle('hidden-completely', !!config.sidebarHidden);

    const unidexBtn = document.createElement('div');
    unidexBtn.className = 'ws-item ws-unidex ' + (config.viewMode === 'unidex' ? 'active' : '');
    unidexBtn.innerHTML = '\u{1F9ED} <span class="ws-label">Unidex Layer</span>';
    unidexBtn.title = 'Open Unidex View';
    unidexBtn.oncontextmenu = function (e) {
        if (typeof showUnidexContextMenu === 'function') showUnidexContextMenu(e);
    };
    unidexBtn.onclick = function () {
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

    if (!Array.isArray(config.collapsedTabs)) {
        config.collapsedTabs = Array.isArray(config.collapsed) ? config.collapsed.slice() : [];
    }

    function saveAndRefresh(shouldRenderDashboard) {
        saveConfig();
        renderSidebar();
        if (shouldRenderDashboard && typeof renderDashboard === 'function') renderDashboard();
    }

    function isDescendantOf(dragId, targetId) {
        if (!helpers) return false;
        const target = helpers.findById(config.workspaces, targetId);
        if (!target) return false;
        return helpers.getDescendantIds(target).includes(dragId);
    }

    function isRootWorkspaceId(workspaceId) {
        const targetId = String(workspaceId || '').trim();
        if (!targetId) return false;
        if (groupsApi && typeof groupsApi.isRootWorkspace === 'function') {
            return groupsApi.isRootWorkspace(targetId, config);
        }
        return helpers ? helpers.getDepth(config.workspaces, targetId) === 0 : false;
    }

    function moveWorkspaceToParent(dragId, targetParentId) {
        if (!helpers) return;
        if (dragId === targetParentId) return;
        if (isDescendantOf(targetParentId, dragId)) return;

        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return;

        config.workspaces = helpers.removeById(config.workspaces, dragId);
        delete dragNode.groupId;
        helpers.addSubTab(config.workspaces, targetParentId, dragNode);
        saveAndRefresh(true);
    }

    function promoteToRoot(dragId) {
        if (!helpers) return;
        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return;

        const depth = helpers.getDepth(config.workspaces, dragId);
        if (depth === 0) {
            if (!String(dragNode.groupId || '').trim()) return;
            delete dragNode.groupId;
            saveAndRefresh(false);
            return;
        }

        config.workspaces = helpers.removeById(config.workspaces, dragId);
        delete dragNode.groupId;
        config.workspaces.push(dragNode);
        saveAndRefresh(true);
    }

    function canDropRootIntoGroup(groupId) {
        const dragId = String(dragWorkspaceId || '').trim();
        if (!dragId || !groupsApi || !isRootWorkspaceId(dragId)) return false;
        const targetGroupId = String(groupId || '').trim();
        if (!targetGroupId) return true;
        return !!groupsApi.findGroupById(targetGroupId, config);
    }

    function attachGroupDropTarget(element, groupId) {
        if (!element || !groupsApi) return;

        element.ondragover = function (e) {
            if (!canDropRootIntoGroup(groupId)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        element.ondragenter = function (e) {
            if (!canDropRootIntoGroup(groupId)) return;
            e.preventDefault();
            element.classList.add('ws-drop-target');
        };
        element.ondragleave = function (e) {
            if (e.relatedTarget && element.contains(e.relatedTarget)) return;
            element.classList.remove('ws-drop-target');
        };
        element.ondrop = function (e) {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('ws-drop-target');
            const dragId = String(dragWorkspaceId || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || !canDropRootIntoGroup(groupId)) return;
            const moved = groupsApi.moveRootWorkspaceToGroup(dragId, groupId, config);
            if (!moved) return;
            saveAndRefresh(false);
        };
    }

    function renderWorkspaceItem(ws, container, depth) {
        const currentDepth = typeof depth === 'number' ? depth : 0;
        const hasChildren = Array.isArray(ws.subTabs) && ws.subTabs.length > 0;
        const isCollapsed = (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(String).includes(String(ws.id));
        const isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id;
        const isInactive = !!ws.inactive;

        if (isInactive && !config.showInactiveTabs) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }

        const item = document.createElement('div');
        item.className = 'ws-item ' + (isWorkspaceActive ? 'active' : '');
        if (currentDepth > 0) item.classList.add('ws-sub-item');
        if (isInactive) item.classList.add('ws-inactive');

        item.draggable = !isInactive;
        item.dataset.wsId = ws.id;
        if (!isInactive) {
            item.ondragstart = function (e) {
                dragWorkspaceId = String(ws.id);
                e.dataTransfer.setData('text/plain', ws.id);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('ws-dragging');
                sb.classList.add('ws-drag-active');
            };
            item.ondragend = function () {
                dragWorkspaceId = '';
                item.classList.remove('ws-dragging');
                sb.classList.remove('ws-drag-active');
                sb.querySelectorAll('.ws-drop-target').forEach(function (element) {
                    element.classList.remove('ws-drop-target');
                });
            };
        }

        item.ondragover = function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = function (e) {
            e.preventDefault();
            if (dragWorkspaceId) item.classList.add('ws-drop-target');
        };
        item.ondragleave = function () {
            item.classList.remove('ws-drop-target');
        };
        item.ondrop = function (e) {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('ws-drop-target');
            const dragId = String(dragWorkspaceId || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || dragId === String(ws.id)) return;
            moveWorkspaceToParent(dragId, ws.id);
        };

        if (hasChildren) {
            const toggle = document.createElement('span');
            toggle.className = 'ws-toggle';
            toggle.textContent = isCollapsed ? '\u25B6' : '\u25BC';
            toggle.onclick = function (e) {
                e.stopPropagation();
                if (config.collapsedTabs.includes(ws.id)) {
                    config.collapsedTabs = config.collapsedTabs.filter(function (id) { return id !== ws.id; });
                } else {
                    config.collapsedTabs.push(ws.id);
                }
                saveConfig();
                renderSidebar();
            };
            item.appendChild(toggle);
        } else if (currentDepth > 0) {
            const spacer = document.createElement('span');
            spacer.className = 'ws-spacer';
            item.appendChild(spacer);
        }

        const iconSpan = document.createElement('span');
        iconSpan.className = 'ws-icon';
        iconSpan.textContent = ws.icon || '\u{1F4C1}';
        item.appendChild(iconSpan);

        const label = document.createElement('span');
        label.className = 'ws-label';
        label.textContent = ws.name;
        item.appendChild(label);

        if (ws.hiddenInParent && currentDepth > 0) {
            item.classList.add('ws-hidden-in-parent');
            const hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-hidden-badge';
            hiddenBadge.textContent = 'Hidden';
            hiddenBadge.title = 'Hidden from parent tab view';
            item.appendChild(hiddenBadge);
        }

        if (!isInactive) {
            item.onclick = function () {
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
        }

        item.oncontextmenu = function (e) {
            if (typeof showWsContext === 'function') showWsContext(e, ws.id);
        };

        item.title = isInactive ? (ws.name + ' (Inactive)') : ws.name;
        if (!isInactive) {
            item.addEventListener('mouseenter', function (e) { showWsPopout(e, ws); });
            item.addEventListener('mouseleave', hideWsPopout);
        }

        wrapper.appendChild(item);
        container.appendChild(wrapper);

        if (hasChildren && !isCollapsed) {
            ws.subTabs.forEach(function (child) {
                renderWorkspaceItem(child, container, currentDepth + 1);
            });
        }
    }

    function renderWorkspaceList(workspaces, container) {
        (Array.isArray(workspaces) ? workspaces : []).forEach(function (workspace) {
            renderWorkspaceItem(workspace, container, 0);
        });
    }

    function buildGroupSection(group, workspaces) {
        const groupId = group ? String(group.id || '').trim() : '';
        const isUngrouped = !groupId;
        const isCollapsed = !!(group && group.collapsed);
        const section = document.createElement('div');
        section.className = 'ws-group-section';
        if (group && group.hidden) section.classList.add('ws-group-section--hidden');
        if (isCollapsed) section.classList.add('ws-group-section--collapsed');
        if (isUngrouped) section.classList.add('ws-group-section--ungrouped');

        const header = document.createElement('div');
        header.className = 'ws-group-header';
        header.title = group
            ? (group.hidden ? group.name + ' (Hidden)' : group.name)
            : 'Ungrouped Tabs';

        if (group) {
            header.onclick = function () {
                groupsApi.setGroupCollapsed(groupId, undefined, config);
                saveAndRefresh(false);
            };
        }

        header.oncontextmenu = function (e) {
            if (typeof showSidebarGroupContext === 'function') {
                showSidebarGroupContext(e, groupId);
            }
        };

        const toggle = document.createElement('span');
        toggle.className = 'ws-group-toggle';
        toggle.textContent = isUngrouped ? '\u2022' : (isCollapsed ? '\u25B6' : '\u25BC');
        header.appendChild(toggle);

        const swatch = document.createElement('span');
        swatch.className = 'ws-group-swatch';
        swatch.style.setProperty('--ws-group-color', group ? (group.color || '#00d4ff') : '#7a7f91');
        swatch.textContent = group ? String(group.name || '?').slice(0, 1).toUpperCase() : 'U';
        header.appendChild(swatch);

        const title = document.createElement('span');
        title.className = 'ws-group-title';
        title.textContent = group ? group.name : 'Ungrouped';
        header.appendChild(title);

        const count = document.createElement('span');
        count.className = 'ws-group-count';
        count.textContent = String((Array.isArray(workspaces) ? workspaces.length : 0) || 0);
        header.appendChild(count);

        if (group && group.hidden) {
            const hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-group-hidden-badge';
            hiddenBadge.textContent = 'Hidden';
            header.appendChild(hiddenBadge);
        }

        attachGroupDropTarget(header, groupId);
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'ws-group-body';
        if (isCollapsed) body.style.display = 'none';
        attachGroupDropTarget(body, groupId);

        if (!isCollapsed) {
            if (Array.isArray(workspaces) && workspaces.length > 0) {
                renderWorkspaceList(workspaces, body);
            } else if (group) {
                const empty = document.createElement('div');
                empty.className = 'ws-group-empty';
                empty.textContent = 'No tabs in this group';
                body.appendChild(empty);
            }
        }

        section.appendChild(body);
        return section;
    }

    const buckets = groupsApi
        ? groupsApi.getVisibleBuckets(config)
        : {
            hasGroups: false,
            visibleGroups: [],
            ungroupedWorkspaces: []
        };

    if (buckets.hasGroups) {
        buckets.visibleGroups.forEach(function (bucket) {
            sb.appendChild(buildGroupSection(bucket.group, bucket.workspaces));
        });
        if (Array.isArray(buckets.ungroupedWorkspaces) && buckets.ungroupedWorkspaces.length > 0) {
            sb.appendChild(buildGroupSection(null, buckets.ungroupedWorkspaces));
        }
    } else {
        renderWorkspaceList(config.workspaces, sb);
    }

    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+ <span class="ws-label">Add / Drop</span>';
    addBtn.onclick = function () {
        openWorkspaceModal(null);
    };
    addBtn.ondragover = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    addBtn.ondragenter = function (e) {
        e.preventDefault();
        addBtn.classList.add('ws-drop-target');
    };
    addBtn.ondragleave = function () {
        addBtn.classList.remove('ws-drop-target');
    };
    addBtn.ondrop = function (e) {
        e.preventDefault();
        e.stopPropagation();
        addBtn.classList.remove('ws-drop-target');
        const dragId = String(dragWorkspaceId || e.dataTransfer.getData('text/plain') || '').trim();
        if (!dragId) return;
        promoteToRoot(dragId);
    };

    sb.appendChild(addBtn);
}

window.renderSidebar = renderSidebar;

// --- Workspace Popout (Tooltip) ---
(function () {
    let popoutEl = null;
    let hideTimer = null;
    let displayTimer = null;

    function ensurePopout() {
        if (popoutEl) return;
        popoutEl = document.createElement('div');
        popoutEl.id = 'ws-popout';
        document.body.appendChild(popoutEl);
    }

    function clearTimers() {
        if (hideTimer) clearTimeout(hideTimer);
        if (displayTimer) clearTimeout(displayTimer);
        hideTimer = null;
        displayTimer = null;
    }

    window.showWsPopout = function (event, ws) {
        clearTimers();
        ensurePopout();
        const item = event.currentTarget;
        const rect = item.getBoundingClientRect();

        popoutEl.innerHTML = ''
            + '<span class="popout-icon">' + (ws.icon || '\u{1F4C1}') + '</span>'
            + '<span class="popout-name">' + ws.name + '</span>'
            + '<span class="popout-hint">Peek</span>';

        popoutEl.style.display = 'flex';

        const sidebar = document.getElementById('sidebar');
        const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : { right: 60 };

        popoutEl.style.top = (rect.top + (rect.height / 2) - 15) + 'px';
        popoutEl.style.left = (sidebarRect.right + 10) + 'px';

        requestAnimationFrame(function () {
            popoutEl.classList.add('active');
        });
    };

    window.hideWsPopout = function (immediate) {
        if (!popoutEl) return;
        clearTimers();

        const doHide = function () {
            popoutEl.classList.remove('active');
            displayTimer = setTimeout(function () {
                if (!popoutEl.classList.contains('active')) {
                    popoutEl.style.display = 'none';
                }
            }, 150);
        };

        if (immediate) {
            doHide();
        } else {
            hideTimer = setTimeout(doHide, 150);
        }
    };

    function setupEmergencyBrakes() {
        ['#main-content', '.top-bar', '.header', '#sidebar'].forEach(function (selector) {
            const element = document.querySelector(selector);
            if (!element) return;

            if (selector !== '#sidebar') {
                element.addEventListener('mouseenter', function () { window.hideWsPopout(true); });
            } else {
                element.addEventListener('mouseleave', function () { window.hideWsPopout(true); });
            }
        });

        window.addEventListener('blur', function () { window.hideWsPopout(true); });
        document.addEventListener('click', function (event) {
            if (!event.target.closest('.ws-item')) window.hideWsPopout(true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEmergencyBrakes);
    } else {
        setupEmergencyBrakes();
    }
})();
