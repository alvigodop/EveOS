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
                if (!firstId && workspace && workspace.id) firstId = String(workspace.id);
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

    function getRawParentEntries(parentWorkspaceId, includeHidden) {
        const targetParentId = String(parentWorkspaceId || '').trim();
        let entries;

        if (groupsApi && typeof groupsApi.getOrderedEntries === 'function') {
            entries = groupsApi.getOrderedEntries(targetParentId, config, { includeHidden: !!includeHidden });
        } else if (!targetParentId) {
            entries = (Array.isArray(config.workspaces) ? config.workspaces : []).map(function (workspace) {
                return { kind: 'workspace', id: String(workspace.id), workspace: workspace };
            });
        } else {
            const parentWorkspace = helpers && typeof helpers.findById === 'function'
                ? helpers.findById(config.workspaces, targetParentId)
                : null;
            entries = (Array.isArray(parentWorkspace && parentWorkspace.subTabs) ? parentWorkspace.subTabs : []).map(function (workspace) {
                return { kind: 'workspace', id: String(workspace.id), workspace: workspace };
            });
        }

        return Array.isArray(entries) ? entries.filter(Boolean) : [];
    }

    function getVisibleParentEntries(parentWorkspaceId) {
        return getRawParentEntries(parentWorkspaceId, false).filter(function (entry) {
            if (!entry) return false;
            if (entry.kind === 'group') return shouldRenderGroup(entry.group, entry.workspaces);
            return shouldRenderWorkspace(entry.workspace);
        });
    }

    function getSiblingListLength(parentWorkspaceId) {
        const targetParentId = String(parentWorkspaceId || '').trim();
        if (!helpers) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        if (!targetParentId) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        const parentWorkspace = helpers.findById(config.workspaces, targetParentId);
        return Array.isArray(parentWorkspace && parentWorkspace.subTabs) ? parentWorkspace.subTabs.length : 0;
    }

    function resolveWorkspaceInsertIndex(parentWorkspaceId, beforeEntry, orderedEntries, entryIndex) {
        const targetParentId = String(parentWorkspaceId || '').trim();

        function getWorkspaceIndex(workspaceId) {
            if (!helpers || !workspaceId) return getSiblingListLength(targetParentId);
            const siblingContext = helpers.findSiblingContext(config.workspaces, workspaceId);
            if (!siblingContext) return getSiblingListLength(targetParentId);
            if (String(siblingContext.parentId || '').trim() !== targetParentId) return getSiblingListLength(targetParentId);
            return siblingContext.index;
        }

        if (!beforeEntry) return getSiblingListLength(targetParentId);
        if (beforeEntry.kind === 'workspace') return getWorkspaceIndex(beforeEntry.id);

        for (let i = entryIndex; i < orderedEntries.length; i += 1) {
            const nextEntry = orderedEntries[i];
            if (!nextEntry || nextEntry.kind !== 'workspace') continue;
            return getWorkspaceIndex(nextEntry.id);
        }

        return getSiblingListLength(targetParentId);
    }

    function promoteToRoot(dragId, beforeEntry, orderedEntries, entryIndex) {
        if (!helpers || typeof helpers.moveToPosition !== 'function') return false;
        const dragNode = helpers.findById(config.workspaces, dragId);
        if (!dragNode) return false;

        // Already an ungrouped root workspace — nothing to promote
        const currentGroupId = groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
            ? groupsApi.getWorkspaceGroupId(dragId, config)
            : String(dragNode.groupId || '').trim();
        if (!currentGroupId && groupsApi && groupsApi.isRootWorkspace(dragId, config)) return true;

        const targetIndex = resolveWorkspaceInsertIndex('', beforeEntry, orderedEntries || [], typeof entryIndex === 'number' ? entryIndex : 0);
        const previousWorkspaces = config.workspaces;
        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', targetIndex);

        const movedNode = helpers.findById(config.workspaces, dragId);
        if (!movedNode) {
            // Restore original array on failure to prevent data loss
            config.workspaces = previousWorkspaces;
            return false;
        }

        const previousGroupId = currentGroupId;
        delete movedNode.groupId;

        if (groupsApi && typeof groupsApi.placeManualOrderEntry === 'function') {
            groupsApi.placeManualOrderEntry(
                'workspace',
                dragId,
                beforeEntry ? beforeEntry.kind : '',
                beforeEntry ? beforeEntry.id : '',
                config,
                ''
            );
        } else if (groupsApi && typeof groupsApi.syncWorkspaceOrderEntry === 'function') {
            groupsApi.syncWorkspaceOrderEntry(dragId, previousGroupId, '', config);
        }

        return true;
    }

    function moveWorkspaceToParentContext(dragId, parentWorkspaceId, beforeEntry, orderedEntries, entryIndex) {
        if (!helpers || typeof helpers.moveToPosition !== 'function') return false;

        const targetParentId = String(parentWorkspaceId || '').trim();
        if (targetParentId) {
            if (dragId === targetParentId) return false;
            if (isDescendantOf(dragId, targetParentId)) return false;
        }

        if (!targetParentId) return promoteToRoot(dragId, beforeEntry, orderedEntries, entryIndex);

        const targetIndex = resolveWorkspaceInsertIndex(targetParentId, beforeEntry, orderedEntries || [], typeof entryIndex === 'number' ? entryIndex : 0);
        const previousWorkspaces = config.workspaces;
        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, targetParentId, targetIndex);

        const movedNode = helpers.findById(config.workspaces, dragId);
        if (!movedNode) {
            // Restore original array on failure to prevent data loss
            config.workspaces = previousWorkspaces;
            return false;
        }
        delete movedNode.groupId;

        if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
            groupsApi.removeManualOrderEntry('workspace', dragId, config);
        }
        return true;
    }

    function canDropWorkspaceIntoGroup(groupId) {
        const dragId = getDraggedWorkspaceId();
        const targetGroupId = String(groupId || '').trim();
        if (!dragId || !targetGroupId || !groupsApi) return false;
        if (!groupsApi.findGroupById(targetGroupId, config)) return false;
        if (typeof groupsApi.canGroupWorkspaceInGroup === 'function' && groupsApi.isRootWorkspace(dragId, config)) {
            return groupsApi.canGroupWorkspaceInGroup(dragId, targetGroupId, config);
        }
        return !!groupsApi.findGroupById(targetGroupId, config);
    }

    function moveWorkspaceIntoGroup(dragId, groupId, beforeWorkspaceId) {
        if (!helpers || !groupsApi || typeof helpers.moveToPosition !== 'function') return false;
        const targetGroupId = String(groupId || '').trim();
        if (!targetGroupId || !groupsApi.findGroupById(targetGroupId, config)) return false;

        // Skip if the workspace is already a root member of this group
        const existingGroupId = groupsApi.getWorkspaceGroupId(dragId, config);
        if (existingGroupId === targetGroupId && groupsApi.isRootWorkspace(dragId, config)) return true;

        if (groupsApi.isRootWorkspace(dragId, config)
            && typeof groupsApi.canGroupWorkspaceInGroup === 'function'
            && !groupsApi.canGroupWorkspaceInGroup(dragId, targetGroupId, config)) {
            return false;
        }

        let targetIndex = Array.isArray(config.workspaces) ? config.workspaces.length : 0;
        if (beforeWorkspaceId) {
            const beforeContext = helpers.findSiblingContext(config.workspaces, beforeWorkspaceId);
            if (beforeContext && !beforeContext.parentId) targetIndex = beforeContext.index;
        } else {
            const roots = groupsApi.getRootWorkspaces(config);
            const lastIndex = roots.reduce(function (acc, workspace, index) {
                return groupsApi.getWorkspaceGroupId(workspace, config) === targetGroupId ? index : acc;
            }, -1);
            targetIndex = lastIndex === -1 ? roots.length : lastIndex + 1;
        }

        const previousWorkspaces = config.workspaces;
        config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', targetIndex);
        const movedNode = helpers.findById(config.workspaces, dragId);
        if (!movedNode) {
            // Restore original array on failure to prevent data loss
            config.workspaces = previousWorkspaces;
            return false;
        }
        movedNode.groupId = targetGroupId;
        if (typeof groupsApi.removeManualOrderEntry === 'function') {
            groupsApi.removeManualOrderEntry('workspace', dragId, config);
        }
        return true;
    }

    function canDropGroupIntoWorkspace(workspaceId) {
        const dragGroupId = getDraggedGroupId();
        if (!dragGroupId || !groupsApi || !isManualSidebarOrder()) return false;
        return typeof groupsApi.canPlaceGroupUnderWorkspace === 'function'
            ? groupsApi.canPlaceGroupUnderWorkspace(dragGroupId, workspaceId, config)
            : false;
    }

    function moveGroupToParentContext(groupId, parentWorkspaceId, beforeEntry) {
        if (!groupsApi || typeof groupsApi.setGroupParentWorkspaceId !== 'function') return false;
        const targetParentId = String(parentWorkspaceId || '').trim();
        const moved = groupsApi.setGroupParentWorkspaceId(groupId, targetParentId, config);
        if (!moved) return false;
        if (typeof groupsApi.placeManualOrderEntry === 'function') {
            groupsApi.placeManualOrderEntry(
                'group',
                groupId,
                beforeEntry ? beforeEntry.kind : '',
                beforeEntry ? beforeEntry.id : '',
                config,
                targetParentId
            );
        }
        return true;
    }

    function attachGroupMemberDropTarget(element, groupId) {
        if (!element) return;

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
            if (moveWorkspaceIntoGroup(dragId, groupId, '')) saveAndRefresh(true);
        };
    }

    function buildGroupMemberOrderSlot(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const slot = document.createElement('div');
        slot.className = 'ws-order-slot';
        if (typeof opts.depth === 'number' && opts.depth > 0) {
            slot.classList.add('ws-order-slot--nested');
            slot.style.setProperty('--ws-depth', opts.depth);
        }

        function canAcceptDrop() {
            return !!getDraggedWorkspaceId() && canDropWorkspaceIntoGroup(opts.groupId);
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
            if (moveWorkspaceIntoGroup(dragId, opts.groupId, opts.beforeWorkspaceId || '')) saveAndRefresh(true);
        };

        return slot;
    }

    function buildEntryOrderSlot(options) {
        const opts = options && typeof options === 'object' ? options : {};
        const slot = document.createElement('div');
        slot.className = 'ws-order-slot';
        if (opts.topLevel) {
            slot.classList.add('ws-order-slot--top');
        } else if (typeof opts.depth === 'number' && opts.depth > 0) {
            slot.classList.add('ws-order-slot--nested');
            slot.style.setProperty('--ws-depth', opts.depth);
        }

        function canAcceptDrop() {
            if (!isManualSidebarOrder()) return false;

            const dragGroupId = getDraggedGroupId();
            if (dragGroupId) {
                if (!groupsApi || typeof groupsApi.canPlaceGroupUnderWorkspace !== 'function') return false;
                return groupsApi.canPlaceGroupUnderWorkspace(dragGroupId, opts.parentWorkspaceId || '', config);
            }

            const dragId = getDraggedWorkspaceId();
            if (!dragId || !helpers || typeof helpers.moveToPosition !== 'function') return false;
            if (opts.parentWorkspaceId && (dragId === opts.parentWorkspaceId || isDescendantOf(dragId, opts.parentWorkspaceId))) {
                return false;
            }
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

            const dragGroupId = getDraggedGroupId();
            if (dragGroupId) {
                if (moveGroupToParentContext(dragGroupId, opts.parentWorkspaceId || '', opts.beforeEntry || null)) {
                    saveAndRefresh(false);
                }
                return;
            }

            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || !canAcceptDrop()) return;
            if (moveWorkspaceToParentContext(dragId, opts.parentWorkspaceId || '', opts.beforeEntry || null, opts.orderedEntries || [], opts.entryIndex || 0)) {
                saveAndRefresh(true);
            }
        };

        return slot;
    }

    function renderEntry(entry, container, depth, options) {
        if (!entry) return;
        if (entry.kind === 'group') {
            const section = buildGroupSection(entry.group, entry.workspaces, {
                depth: depth,
                manualSlots: !!(options && options.manualSlots),
                parentWorkspaceId: entry.parentWorkspaceId || ''
            });
            if (section) container.appendChild(section);
            return;
        }

        if (entry.workspace && shouldRenderWorkspace(entry.workspace)) {
            renderWorkspaceItem(entry.workspace, container, depth, options);
        }
    }

    function buildTopLevelOrderBlock(entry, orderedEntries, entryIndex) {
        const block = document.createElement('div');
        block.className = 'ws-top-order-block';
        block.appendChild(buildEntryOrderSlot({
            parentWorkspaceId: '',
            beforeEntry: entry,
            orderedEntries: orderedEntries,
            entryIndex: entryIndex,
            depth: 0,
            topLevel: true
        }));
        renderEntry(entry, block, 0, { manualSlots: true });
        return block;
    }

    function renderParentEntries(parentWorkspaceId, container, depth, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const orderedEntries = getVisibleParentEntries(parentWorkspaceId);

        if (opts.rootBlocks) {
            orderedEntries.forEach(function (entry, index) {
                const block = buildTopLevelOrderBlock(entry, orderedEntries, index);
                if (block) container.appendChild(block);
            });
            const tailBlock = document.createElement('div');
            tailBlock.className = 'ws-top-order-block ws-top-order-block--tail';
            tailBlock.appendChild(buildEntryOrderSlot({
                parentWorkspaceId: '',
                beforeEntry: null,
                orderedEntries: orderedEntries,
                entryIndex: orderedEntries.length,
                depth: 0,
                topLevel: true
            }));
            container.appendChild(tailBlock);
            return;
        }

        orderedEntries.forEach(function (entry, index) {
            if (opts.manualSlots) {
                container.appendChild(buildEntryOrderSlot({
                    parentWorkspaceId: parentWorkspaceId || '',
                    beforeEntry: entry,
                    orderedEntries: orderedEntries,
                    entryIndex: index,
                    depth: depth
                }));
            }
            renderEntry(entry, container, depth, opts);
        });

        if (opts.manualSlots) {
            container.appendChild(buildEntryOrderSlot({
                parentWorkspaceId: parentWorkspaceId || '',
                beforeEntry: null,
                orderedEntries: orderedEntries,
                entryIndex: orderedEntries.length,
                depth: depth
            }));
        }
    }

    function renderGroupMembers(workspaces, container, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const visibleWorkspaces = getRenderableWorkspaces(workspaces);

        visibleWorkspaces.forEach(function (workspace) {
            if (opts.manualSlots) {
                container.appendChild(buildGroupMemberOrderSlot({
                    groupId: opts.groupId,
                    depth: opts.depth,
                    beforeWorkspaceId: workspace.id
                }));
            }
            renderWorkspaceItem(workspace, container, opts.depth, {
                manualSlots: !!opts.manualSlots,
                groupPreview: true,
                groupColor: opts.groupColor,
                groupPreviewBaseDepth: opts.depth
            });
        });

        if (opts.manualSlots) {
            container.appendChild(buildGroupMemberOrderSlot({
                groupId: opts.groupId,
                depth: opts.depth,
                beforeWorkspaceId: ''
            }));
        }
    }

    function buildGroupSection(group, workspaces, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const currentDepth = typeof opts.depth === 'number' ? opts.depth : 0;
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

        const wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper ws-group-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }

        const section = document.createElement('div');
        section.className = 'ws-group-section';
        section.style.setProperty('--ws-group-color', groupColor);
        if (currentDepth > 0) section.classList.add('ws-group-section--nested');
        if (group && group.hidden) section.classList.add('ws-group-section--hidden');
        if (isCollapsed) section.classList.add('ws-group-section--collapsed');
        if (isFocusedGroup) section.classList.add('ws-group-section--focused');
        if (isInactiveGroup) section.classList.add('ws-group-section--inactive');
        if (groupId && String(config.groupOverviewId || '').trim() === groupId) {
            section.classList.add('ws-group-section--overview');
        }

        const header = document.createElement('div');
        header.className = 'ws-group-header';
        header.title = group.hidden ? group.name + ' (Hidden)' : group.name;
        if (isFocusedGroup) header.title += ' (Focused)';
        else if (isInactiveGroup) header.title += ' (Inactive)';

        function toggleGroup(e) {
            if (e) e.stopPropagation();
            if (isInactiveGroup) return;
            groupsApi.setGroupCollapsed(groupId, undefined, config);
            saveAndRefresh(false);
        }

        header.onclick = toggleGroup;
        header.oncontextmenu = function (e) {
            if (isInactiveGroup) return;
            if (typeof showSidebarGroupContext === 'function') showSidebarGroupContext(e, groupId);
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

        const popoutPayload = {
            icon: String(group.name || '?').slice(0, 1).toUpperCase(),
            name: group.name,
            popoutHint: 'Group'
        };
        header.addEventListener('mouseenter', function (e) { showWsPopout(e, popoutPayload); });
        header.addEventListener('mouseleave', hideWsPopout);

        const toggle = document.createElement('span');
        toggle.className = 'ws-group-toggle';
        toggle.textContent = isCollapsed ? '\u25B6' : '\u25BC';
        toggle.onclick = toggleGroup;
        header.appendChild(toggle);

        const swatch = document.createElement('span');
        swatch.className = 'ws-group-swatch';
        swatch.textContent = String(group.name || '?').slice(0, 1).toUpperCase();
        header.appendChild(swatch);

        const title = document.createElement('span');
        title.className = 'ws-group-title';
        title.textContent = group.name;
        title.onclick = toggleGroup;
        title.addEventListener('mouseenter', function (e) { showWsPopout(e, popoutPayload); });
        title.addEventListener('mouseleave', hideWsPopout);
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

        if (!isInactiveGroup) attachGroupMemberDropTarget(header, groupId);
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'ws-group-body';
        if (isCollapsed) body.style.display = 'none';
        if (!isInactiveGroup) attachGroupMemberDropTarget(body, groupId);

        if (!isInactiveGroup) {
            body.onclick = function (e) {
                if (e.target.closest('.ws-item') || e.target.closest('.ws-order-slot') || e.target.closest('.ws-group-empty')) return;
                e.stopPropagation();

                var current = String(config.groupOverviewId || '').trim();
                var next = current === groupId ? '' : groupId;
                config.groupOverviewId = next;
                saveAndRefresh(true);

                if (typeof window.showToast === 'function') {
                    var groupLabel = group.name || 'Group';
                    window.showToast(
                        next ? 'Group overview: ' + groupLabel : 'Exited group overview',
                        'info'
                    );
                }
            };
        }

        if (!isCollapsed) {
            if (visibleWorkspaces.length > 0) {
                renderGroupMembers(visibleWorkspaces, body, {
                    groupId: groupId,
                    depth: currentDepth + 1,
                    manualSlots: manualMode,
                    groupColor: groupColor
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'ws-group-empty';
                empty.textContent = 'No tabs in this group';
                body.appendChild(empty);
            }
        }

        section.appendChild(body);
        wrapper.appendChild(section);
        return wrapper;
    }

    function renderWorkspaceItem(ws, container, depth, options) {
        const currentDepth = typeof depth === 'number' ? depth : 0;
        const renderOptions = options && typeof options === 'object' ? options : {};
        const childEntries = getVisibleParentEntries(ws.id);
        const childEntriesAll = getRawParentEntries(ws.id, true);
        const hasChildren = childEntriesAll.length > 0;
        const isCollapsed = (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(String).includes(String(ws.id));
        const isGroupOverviewActive = !!String(config.groupOverviewId || '').trim();
        const isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id && !isGroupOverviewActive;
        const isInactive = isWorkspaceEffectivelyInactive(ws);

        if (isInactive && !config.showInactiveTabs) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }
        if (renderOptions.groupPreview && currentDepth === renderOptions.groupPreviewBaseDepth) {
            wrapper.classList.add('ws-group-member-wrapper');
            wrapper.style.setProperty('--ws-group-color', renderOptions.groupColor || '#00d4ff');
        }

        const item = document.createElement('div');
        item.className = 'ws-item ' + (isWorkspaceActive ? 'active' : '');
        if (currentDepth > 0) item.classList.add('ws-sub-item');
        if (isInactive) item.classList.add('ws-inactive');
        if (renderOptions.groupPreview && currentDepth === renderOptions.groupPreviewBaseDepth) {
            item.classList.add('ws-group-member-item');
            item.style.setProperty('--ws-group-color', renderOptions.groupColor || '#00d4ff');
        }

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
            if (!getDraggedWorkspaceId() && !canDropGroupIntoWorkspace(ws.id)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = function (e) {
            if (isInactive) return;
            if (!getDraggedWorkspaceId() && !canDropGroupIntoWorkspace(ws.id)) return;
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

            const dragGroupId = getDraggedGroupId();
            if (dragGroupId) {
                if (moveGroupToParentContext(dragGroupId, ws.id, null)) saveAndRefresh(false);
                return;
            }

            const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || dragId === String(ws.id)) return;
            if (moveWorkspaceToParentContext(dragId, ws.id, null, childEntries, childEntries.length)) saveAndRefresh(true);
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
        item.addEventListener('mouseenter', function (e) { showWsPopout(e, ws); });
        item.addEventListener('mouseleave', hideWsPopout);

        wrapper.appendChild(item);
        container.appendChild(wrapper);

        if (hasChildren && !isCollapsed) {
            renderParentEntries(ws.id, container, currentDepth + 1, {
                manualSlots: !!renderOptions.manualSlots
            });
        }
    }

    const orderedEntries = getVisibleParentEntries('');
    if (isManualSidebarOrder()) {
        const treeHost = document.createElement('div');
        treeHost.className = 'ws-tree-host';
        renderParentEntries('', treeHost, 0, {
            manualSlots: true,
            rootBlocks: true
        });
        sb.appendChild(treeHost);
    } else {
        orderedEntries.forEach(function (entry) {
            renderEntry(entry, sb, 0, { manualSlots: false });
        });
    }

    const addBtn = document.createElement('div');
    addBtn.className = 'ws-item ws-add';
    addBtn.innerHTML = '+ <span class="ws-label">Add / Drop</span>';
    addBtn.onclick = function () {
        openWorkspaceModal(null);
    };
    addBtn.ondragover = function (e) {
        if (!getDraggedWorkspaceId() && !getDraggedGroupId()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    addBtn.ondragenter = function (e) {
        if (!getDraggedWorkspaceId() && !getDraggedGroupId()) return;
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

        const dragGroupId = getDraggedGroupId();
        if (dragGroupId) {
            if (moveGroupToParentContext(dragGroupId, '', null)) saveAndRefresh(false);
            return;
        }

        const dragId = String(getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
        if (!dragId) return;
        if (promoteToRoot(dragId, null, [], 0)) saveAndRefresh(true);
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
        const popoutIcon = ws && ws.icon ? ws.icon : '\u{1F4C1}';
        const popoutName = ws && ws.name ? ws.name : 'Untitled';
        const popoutHint = ws && ws.popoutHint ? ws.popoutHint : 'Peek';

        popoutEl.innerHTML = ''
            + '<span class="popout-icon">' + popoutIcon + '</span>'
            + '<span class="popout-name">' + popoutName + '</span>'
            + '<span class="popout-hint">' + popoutHint + '</span>';

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
