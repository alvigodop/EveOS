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
    let dragState = { type: '', id: '' };

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
        saveConfig({ immediate: true });
        renderSidebar();
        if (shouldRenderDashboard && typeof renderDashboard === 'function') renderDashboard();
    }

    function clearDragTargets() {
        sb.querySelectorAll('.ws-drop-target').forEach(function (element) {
            element.classList.remove('ws-drop-target');
        });
    }

    function setDragState(type, id) {
        dragState = {
            type: String(type || '').trim(),
            id: String(id || '').trim()
        };
        sb.classList.add('ws-drag-active');
    }

    function clearDragState() {
        dragState = { type: '', id: '' };
        sb.classList.remove('ws-drag-active');
        clearDragTargets();
    }

    function getDraggedWorkspaceId() {
        return dragState.type === 'workspace' ? String(dragState.id || '').trim() : '';
    }

    function getDraggedGroupId() {
        return dragState.type === 'group' ? String(dragState.id || '').trim() : '';
    }

    function isManualSidebarOrder() {
        return !!(groupsApi && typeof groupsApi.getSidebarOrderMode === 'function'
            && groupsApi.getSidebarOrderMode(config) === 'manual');
    }

    function getFocusedGroupId() {
        return groupsApi && typeof groupsApi.getFocusedGroupId === 'function'
            ? groupsApi.getFocusedGroupId(config)
            : '';
    }

    function isWorkspaceEffectivelyInactive(ws) {
        if (!ws) return true;
        if (groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function') {
            return groupsApi.isWorkspaceEffectivelyInactive(ws, config);
        }
        return !!ws.inactive;
    }

    function shouldRenderWorkspace(ws) {
        return !!ws && (!isWorkspaceEffectivelyInactive(ws) || !!config.showInactiveTabs);
    }

    function getRenderableWorkspaces(workspaces) {
        return Array.isArray(workspaces)
            ? workspaces.filter(function (workspace) { return shouldRenderWorkspace(workspace); })
            : [];
    }

    function isGroupEffectivelyInactive(groupId) {
        return !!(groupsApi && typeof groupsApi.isGroupEffectivelyInactive === 'function'
            && groupsApi.isGroupEffectivelyInactive(groupId, config));
    }

    function shouldRenderGroup(group, workspaces) {
        if (!group) return false;
        if (config.showInactiveTabs) return true;
        if (isGroupEffectivelyInactive(group.id)) return false;
        return getRenderableWorkspaces(workspaces).length > 0;
    }

    function findFirstWorkspaceId(workspaces) {
        const list = Array.isArray(workspaces) ? workspaces : [];
        let firstId = '';

        if (helpers && typeof helpers.walk === 'function') {
            helpers.walk(list, function (workspace) {
                if (!firstId && workspace && workspace.id) {
                    firstId = String(workspace.id);
                }
            });
            return firstId;
        }

        (function walk(nodes) {
            if (firstId || !Array.isArray(nodes)) return;
            nodes.forEach(function (workspace) {
                if (firstId || !workspace) return;
                firstId = String(workspace.id || '').trim();
                if (!firstId && Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                    walk(workspace.subTabs);
                }
            });
        })(list);

        return firstId;
    }

    const focusedGroupId = getFocusedGroupId();
    if (focusedGroupId && groupsApi && typeof groupsApi.isWorkspaceInFocusedGroup === 'function'
        && !groupsApi.isWorkspaceInFocusedGroup(String(config.activeWorkspace || '').trim(), config)) {
        const focusedRoots = groupsApi.getGroupRoots(focusedGroupId, config);
        const fallbackWorkspaceId = findFirstWorkspaceId(focusedRoots);
        if (fallbackWorkspaceId) {
            config.activeWorkspace = fallbackWorkspaceId;
            saveConfig({ immediate: true });
        } else if (typeof groupsApi.setFocusedGroup === 'function') {
            groupsApi.setFocusedGroup('', config);
            saveConfig({ immediate: true });
        }
    }

    function isDescendantOf(targetId, maybeDescendantId) {
        if (!helpers) return false;
        const target = helpers.findById(config.workspaces, targetId);
        if (!target) return false;
        return helpers.getDescendantIds(target).includes(String(maybeDescendantId || '').trim());
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
        if (!helpers || typeof helpers.moveToPosition !== 'function') return;
        if (dragId === targetParentId) return;
        if (isDescendantOf(dragId, targetParentId)) return;

        const parent = helpers.findById(config.workspaces, targetParentId);
        if (!parent) return;
        const targetIndex = Array.isArray(parent.subTabs) ? parent.subTabs.length : 0;
        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, targetParentId, targetIndex);
        const movedNode = helpers.findById(config.workspaces, dragId);
        if (movedNode) delete movedNode.groupId;
        if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
            groupsApi.removeManualOrderEntry('workspace', dragId, config);
        }
        saveAndRefresh(true);
    }

    function promoteToRoot(dragId) {
        if (!helpers || typeof helpers.moveToPosition !== 'function') return;
        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return;

        const depth = helpers.getDepth(config.workspaces, dragId);
        if (depth === 0) {
            const previousGroupId = groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
                ? groupsApi.getWorkspaceGroupId(dragId, config)
                : String(dragNode.groupId || '').trim();
            if (!previousGroupId) return;
            delete dragNode.groupId;
            if (groupsApi && typeof groupsApi.syncWorkspaceOrderEntry === 'function') {
                groupsApi.syncWorkspaceOrderEntry(dragId, previousGroupId, '', config);
            }
            saveAndRefresh(false);
            return;
        }

        const rootCount = Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', rootCount);
        const movedNode = helpers.findById(config.workspaces, dragId);
        if (movedNode) delete movedNode.groupId;
        if (groupsApi && typeof groupsApi.syncWorkspaceOrderEntry === 'function') {
            groupsApi.syncWorkspaceOrderEntry(dragId, '', '', config);
        }
        saveAndRefresh(true);
    }

    function canDropWorkspaceIntoGroup(groupId) {
        const dragId = getDraggedWorkspaceId();
        if (!dragId || !groupsApi) return false;
        const targetGroupId = String(groupId || '').trim();
        if (!targetGroupId) return true;
        return !!groupsApi.findGroupById(targetGroupId, config);
    }

    function moveWorkspaceIntoGroup(dragId, groupId, beforeWorkspaceId) {
        if (!helpers || !groupsApi || typeof helpers.moveToPosition !== 'function') return false;
        const targetGroupId = String(groupId || '').trim();
        if (!targetGroupId || !groupsApi.findGroupById(targetGroupId, config)) return false;

        let targetIndex = Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        if (beforeWorkspaceId) {
            const beforeContext = helpers.findSiblingContext(config.workspaces, beforeWorkspaceId);
            if (beforeContext && !beforeContext.parentId) {
                targetIndex = beforeContext.index;
            }
        } else {
            const roots = groupsApi.getRootWorkspaces(config);
            const lastIndex = roots.reduce(function (acc, workspace, index) {
                return groupsApi.getWorkspaceGroupId(workspace, config) === targetGroupId ? index : acc;
            }, -1);
            targetIndex = lastIndex === -1 ? roots.length : lastIndex + 1;
        }

        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', targetIndex);
        const movedNode = helpers.findById(config.workspaces, dragId);
        if (!movedNode) return false;
        movedNode.groupId = targetGroupId;
        if (typeof groupsApi.removeManualOrderEntry === 'function') {
            groupsApi.removeManualOrderEntry('workspace', dragId, config);
        }
        return true;
    }

    function attachGroupDropTarget(element, groupId) {
        if (!element || !groupsApi) return;

        element.ondragover = function (e) {
            if (!canDropWorkspaceIntoGroup(groupId)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        element.ondragenter = function (e) {
            if (!canDropWorkspaceIntoGroup(groupId)) return;
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
            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || !canDropWorkspaceIntoGroup(groupId)) return;
            const moved = moveWorkspaceIntoGroup(dragId, groupId, '');
            if (!moved) return;
            saveAndRefresh(true);
        };
    }

    function getTopLevelEntries(includeHidden) {
        let entries;
        if (groupsApi && typeof groupsApi.getOrderedRootEntries === 'function') {
            entries = groupsApi.getOrderedRootEntries(config, { includeHidden: !!includeHidden });
        } else {
            entries = (Array.isArray(config.workspaces) ? config.workspaces : []).map(function (workspace) {
                return { kind: 'workspace', id: String(workspace.id), workspace: workspace };
            });
        }

        return entries.filter(function (entry) {
            if (!entry) return false;
            if (entry.kind === 'group') return shouldRenderGroup(entry.group, entry.workspaces);
            return shouldRenderWorkspace(entry.workspace);
        });
    }

    function getRootWorkspaceInsertIndex(beforeWorkspaceId) {
        if (!helpers) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        if (!beforeWorkspaceId) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        const siblingContext = helpers.findSiblingContext(config.workspaces, beforeWorkspaceId);
        if (!siblingContext || siblingContext.parentId) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        return siblingContext.index;
    }

    function resolveTopLevelInsertIndex(beforeEntry, orderedEntries, entryIndex) {
        if (!beforeEntry) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        if (beforeEntry.kind === 'workspace') {
            return getRootWorkspaceInsertIndex(beforeEntry.id);
        }
        if (beforeEntry.kind === 'group' && Array.isArray(beforeEntry.workspaces) && beforeEntry.workspaces.length > 0) {
            return getRootWorkspaceInsertIndex(beforeEntry.workspaces[0].id);
        }
        for (let i = entryIndex + 1; i < orderedEntries.length; i += 1) {
            const nextEntry = orderedEntries[i];
            if (!nextEntry) continue;
            if (nextEntry.kind === 'workspace') return getRootWorkspaceInsertIndex(nextEntry.id);
            if (nextEntry.kind === 'group' && Array.isArray(nextEntry.workspaces) && nextEntry.workspaces.length > 0) {
                return getRootWorkspaceInsertIndex(nextEntry.workspaces[0].id);
            }
        }
        return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
    }

    function buildTopLevelOrderSlot(beforeEntry, orderedEntries, entryIndex) {
        const slot = document.createElement('div');
        slot.className = 'ws-order-slot ws-order-slot--top';

        function canAcceptDrop() {
            if (!isManualSidebarOrder()) return false;
            return !!(getDraggedWorkspaceId() || getDraggedGroupId());
        }

        slot.ondragover = function (e) {
            if (!canAcceptDrop()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        slot.ondragenter = function (e) {
            if (!canAcceptDrop()) return;
            e.preventDefault();
            slot.classList.add('ws-drop-target');
        };
        slot.ondragleave = function (e) {
            if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
            slot.classList.remove('ws-drop-target');
        };
        slot.ondrop = function (e) {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.remove('ws-drop-target');

            const dragGroupId = getDraggedGroupId();
            if (dragGroupId && groupsApi && typeof groupsApi.placeManualOrderEntry === 'function') {
                groupsApi.placeManualOrderEntry(
                    'group',
                    dragGroupId,
                    beforeEntry ? beforeEntry.kind : '',
                    beforeEntry ? beforeEntry.id : '',
                    config
                );
                saveAndRefresh(false);
                return;
            }

            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || !helpers || typeof helpers.moveToPosition !== 'function') return;

            const targetIndex = resolveTopLevelInsertIndex(beforeEntry, orderedEntries, entryIndex);
            config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', targetIndex);
            const movedNode = helpers.findById(config.workspaces, dragId);
            if (!movedNode) return;
            delete movedNode.groupId;
            if (groupsApi && typeof groupsApi.placeManualOrderEntry === 'function') {
                groupsApi.placeManualOrderEntry(
                    'workspace',
                    dragId,
                    beforeEntry ? beforeEntry.kind : '',
                    beforeEntry ? beforeEntry.id : '',
                    config
                );
            }
            saveAndRefresh(true);
        };

        return slot;
    }

    function buildTopLevelOrderBlock(entry, orderedEntries, entryIndex) {
        const block = document.createElement('div');
        block.className = 'ws-top-order-block';
        block.appendChild(buildTopLevelOrderSlot(entry, orderedEntries, entryIndex));

        if (entry.kind === 'group') {
            const section = buildGroupSection(entry.group, entry.workspaces);
            if (!section) return null;
            block.appendChild(section);
        } else if (entry.workspace) {
            if (!shouldRenderWorkspace(entry.workspace)) return null;
            renderWorkspaceItem(entry.workspace, block, 0, { manualSlots: true });
        } else {
            return null;
        }

        return block;
    }

    function buildWorkspaceOrderSlot(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const slot = document.createElement('div');
        slot.className = 'ws-order-slot';
        if (typeof opts.depth === 'number' && opts.depth > 0) {
            slot.classList.add('ws-order-slot--nested');
            slot.style.setProperty('--ws-depth', opts.depth);
        }

        function canAcceptDrop() {
            const dragId = getDraggedWorkspaceId();
            if (!dragId || !helpers || typeof helpers.moveToPosition !== 'function') return false;
            if (opts.parentId && (dragId === opts.parentId || isDescendantOf(dragId, opts.parentId))) return false;
            return true;
        }

        slot.ondragover = function (e) {
            if (!canAcceptDrop()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        slot.ondragenter = function (e) {
            if (!canAcceptDrop()) return;
            e.preventDefault();
            slot.classList.add('ws-drop-target');
        };
        slot.ondragleave = function (e) {
            if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
            slot.classList.remove('ws-drop-target');
        };
        slot.ondrop = function (e) {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.remove('ws-drop-target');
            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || !canAcceptDrop()) return;

            if (opts.parentId) {
                const parent = helpers.findById(config.workspaces, opts.parentId);
                const beforeContext = opts.beforeWorkspaceId
                    ? helpers.findSiblingContext(config.workspaces, opts.beforeWorkspaceId)
                    : null;
                const targetIndex = beforeContext
                    ? beforeContext.index
                    : (Array.isArray(parent && parent.subTabs) ? parent.subTabs.length : 0);
                config.workspaces = helpers.moveToPosition(config.workspaces, dragId, opts.parentId, targetIndex);
                const movedNode = helpers.findById(config.workspaces, dragId);
                if (movedNode) delete movedNode.groupId;
                if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
                    groupsApi.removeManualOrderEntry('workspace', dragId, config);
                }
                saveAndRefresh(true);
                return;
            }

            if (opts.groupId) {
                const moved = moveWorkspaceIntoGroup(dragId, opts.groupId, opts.beforeWorkspaceId || '');
                if (moved) saveAndRefresh(true);
            }
        };

        return slot;
    }

    function renderWorkspaceCollection(workspaces, container, options) {
        const list = getRenderableWorkspaces(workspaces);
        const opts = options && typeof options === 'object' ? options : {};

        list.forEach(function (workspace) {
            if (opts.manualSlots) {
                container.appendChild(buildWorkspaceOrderSlot({
                    parentId: opts.parentId || '',
                    groupId: opts.groupId || '',
                    depth: typeof opts.depth === 'number' ? opts.depth : 0,
                    beforeWorkspaceId: workspace.id
                }));
            }
            renderWorkspaceItem(workspace, container, typeof opts.depth === 'number' ? opts.depth : 0, opts);
        });

        if (opts.manualSlots) {
            container.appendChild(buildWorkspaceOrderSlot({
                parentId: opts.parentId || '',
                groupId: opts.groupId || '',
                depth: typeof opts.depth === 'number' ? opts.depth : 0,
                beforeWorkspaceId: ''
            }));
        }
    }

    function renderWorkspaceItem(ws, container, depth, options) {
        const currentDepth = typeof depth === 'number' ? depth : 0;
        const renderOptions = options && typeof options === 'object' ? options : {};
        const hasChildren = Array.isArray(ws.subTabs) && ws.subTabs.length > 0;
        const isCollapsed = (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(String).includes(String(ws.id));
        const isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id;
        const isInactive = isWorkspaceEffectivelyInactive(ws);

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
                setDragState('workspace', ws.id);
                e.dataTransfer.setData('text/plain', ws.id);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('ws-dragging');
            };
            item.ondragend = function () {
                item.classList.remove('ws-dragging');
                clearDragState();
            };
        }

        item.ondragover = function (e) {
            if (isInactive) return;
            if (!getDraggedWorkspaceId()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = function (e) {
            if (isInactive) return;
            if (!getDraggedWorkspaceId()) return;
            e.preventDefault();
            item.classList.add('ws-drop-target');
        };
        item.ondragleave = function () {
            item.classList.remove('ws-drop-target');
        };
        item.ondrop = function (e) {
            if (isInactive) return;
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('ws-drop-target');
            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
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
            renderWorkspaceCollection(ws.subTabs, container, {
                parentId: ws.id,
                groupId: '',
                depth: currentDepth + 1,
                manualSlots: !!renderOptions.manualSlots
            });
        }
    }

    function buildGroupSection(group, workspaces) {
        const groupId = group ? String(group.id || '').trim() : '';
        const groupColor = group ? (group.color || '#00d4ff') : '#7a7f91';
        const currentFocusedGroupId = getFocusedGroupId();
        const isFocusedGroup = !!currentFocusedGroupId && currentFocusedGroupId === groupId;
        const isInactiveGroup = isGroupEffectivelyInactive(groupId);
        const visibleWorkspaces = getRenderableWorkspaces(workspaces);
        const isCollapsed = !!(group && group.collapsed);
        const manualMode = isManualSidebarOrder();
        if (isInactiveGroup && !config.showInactiveTabs) return null;
        if (!config.showInactiveTabs && visibleWorkspaces.length === 0 && Array.isArray(workspaces) && workspaces.length > 0) return null;
        const section = document.createElement('div');
        section.className = 'ws-group-section';
        section.style.setProperty('--ws-group-color', groupColor);
        if (group && group.hidden) section.classList.add('ws-group-section--hidden');
        if (isCollapsed) section.classList.add('ws-group-section--collapsed');
        if (isFocusedGroup) section.classList.add('ws-group-section--focused');
        if (isInactiveGroup) section.classList.add('ws-group-section--inactive');

        const header = document.createElement('div');
        header.className = 'ws-group-header';
        header.title = group.hidden ? group.name + ' (Hidden)' : group.name;
        if (isFocusedGroup) header.title += ' (Focused)';
        else if (isInactiveGroup) header.title += ' (Inactive)';

        header.onclick = function () {
            if (isInactiveGroup) return;
            groupsApi.setGroupCollapsed(groupId, undefined, config);
            saveAndRefresh(false);
        };

        header.oncontextmenu = function (e) {
            if (isInactiveGroup) return;
            if (typeof showSidebarGroupContext === 'function') {
                showSidebarGroupContext(e, groupId);
            }
        };
        header.draggable = manualMode && !isInactiveGroup;
        if (manualMode && !isInactiveGroup) {
            header.ondragstart = function (e) {
                setDragState('group', groupId);
                e.dataTransfer.setData('text/plain', groupId);
                e.dataTransfer.effectAllowed = 'move';
                header.classList.add('ws-group-header--dragging');
            };
            header.ondragend = function () {
                header.classList.remove('ws-group-header--dragging');
                clearDragState();
            };
        }

        const toggle = document.createElement('span');
        toggle.className = 'ws-group-toggle';
        toggle.textContent = isCollapsed ? '\u25B6' : '\u25BC';
        header.appendChild(toggle);

        const swatch = document.createElement('span');
        swatch.className = 'ws-group-swatch';
        swatch.textContent = String(group.name || '?').slice(0, 1).toUpperCase();
        header.appendChild(swatch);

        const title = document.createElement('span');
        title.className = 'ws-group-title';
        title.textContent = group.name;
        header.appendChild(title);

        const count = document.createElement('span');
        count.className = 'ws-group-count';
        count.textContent = String((Array.isArray(workspaces) ? workspaces.length : 0) || 0);
        header.appendChild(count);

        if (isFocusedGroup) {
            const focusedBadge = document.createElement('span');
            focusedBadge.className = 'ws-group-focus-badge';
            focusedBadge.textContent = 'Focused';
            header.appendChild(focusedBadge);
        }

        if (group.hidden) {
            const hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-group-hidden-badge';
            hiddenBadge.textContent = 'Hidden';
            header.appendChild(hiddenBadge);
        }

        if (!isInactiveGroup) attachGroupDropTarget(header, groupId);
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'ws-group-body';
        if (isCollapsed) body.style.display = 'none';
        if (!isInactiveGroup) attachGroupDropTarget(body, groupId);

        if (!isCollapsed) {
            if (visibleWorkspaces.length > 0) {
                renderWorkspaceCollection(visibleWorkspaces, body, {
                    parentId: '',
                    groupId: groupId,
                    depth: 0,
                    manualSlots: manualMode
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'ws-group-empty';
                empty.textContent = 'No tabs in this group';
                body.appendChild(empty);
            }
        }

        section.appendChild(body);
        return section;
    }

    const orderedEntries = getTopLevelEntries(false);
    if (isManualSidebarOrder()) {
        const treeHost = document.createElement('div');
        treeHost.className = 'ws-tree-host';
        orderedEntries.forEach(function (entry, index) {
            const block = buildTopLevelOrderBlock(entry, orderedEntries, index);
            if (block) treeHost.appendChild(block);
        });
        const tailBlock = document.createElement('div');
        tailBlock.className = 'ws-top-order-block ws-top-order-block--tail';
        tailBlock.appendChild(buildTopLevelOrderSlot(null, orderedEntries, orderedEntries.length));
        treeHost.appendChild(tailBlock);
        sb.appendChild(treeHost);
    } else {
        orderedEntries.forEach(function (entry) {
            if (entry.kind === 'group') {
                const section = buildGroupSection(entry.group, entry.workspaces);
                if (section) sb.appendChild(section);
            } else if (entry.workspace && shouldRenderWorkspace(entry.workspace)) {
                renderWorkspaceItem(entry.workspace, sb, 0, { manualSlots: false });
            }
        });
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
        const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
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
