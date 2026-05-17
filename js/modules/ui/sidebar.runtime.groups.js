window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.groupsReady || !rt.sharedReady) return;

    function renderGroupMembers(ctx, workspaces, container, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var visibleWorkspaces = opts.renderInactive
            ? (Array.isArray(workspaces) ? workspaces.filter(Boolean) : [])
            : ctx.getRenderableWorkspaces(workspaces);

        visibleWorkspaces.forEach(function (workspace) {
            if (opts.manualSlots) {
                container.appendChild(ctx.buildGroupMemberOrderSlot({
                    groupId: opts.groupId,
                    depth: opts.depth,
                    beforeWorkspaceId: workspace.id
                }));
            }
            rt.renderWorkspaceItem(ctx, workspace, container, opts.depth, {
                manualSlots: !!opts.manualSlots,
                groupPreview: true,
                groupId: opts.groupId,
                groupColor: opts.groupColor,
                groupPreviewBaseDepth: opts.depth,
                renderInactive: !!opts.renderInactive,
                parentWorkspaceId: '',
                orderedEntries: visibleWorkspaces,
                entryIndex: visibleWorkspaces.findIndex(function (entry) {
                    return entry && String(entry.id || '') === String(workspace.id || '');
                }),
                beforeEntry: {
                    kind: 'workspace',
                    id: String(workspace.id || '')
                }
            });
        });

        if (opts.manualSlots) {
            container.appendChild(ctx.buildGroupMemberOrderSlot({
                groupId: opts.groupId,
                depth: opts.depth,
                beforeWorkspaceId: ''
            }));
        }
    }

    function buildGroupSection(ctx, group, workspaces, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var currentDepth = typeof opts.depth === 'number' ? opts.depth : 0;
        var groupId = group ? String(group.id || '').trim() : '';
        var groupColor = group ? (group.color || '#00d4ff') : '#7a7f91';
        var currentFocusedGroupId = ctx.getFocusedGroupId();
        var isFocusedGroup = !!currentFocusedGroupId && currentFocusedGroupId === groupId;
        var isInactiveGroup = ctx.isGroupEffectivelyInactive(groupId);
        var isHiddenGroup = !!(group && group.hidden);
        var visibleWorkspaces = isHiddenGroup
            ? (Array.isArray(workspaces) ? workspaces.filter(Boolean) : [])
            : ctx.getRenderableWorkspaces(workspaces);
        var totalWorkspaces = Array.isArray(workspaces) ? workspaces.length : 0;
        var isCollapsed = !!(group && group.collapsed);
        var manualMode = ctx.isManualSidebarOrder();

        if (isInactiveGroup && !ctx.shouldShowInactiveTabs()) return null;

        var wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper ws-group-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }

        var section = document.createElement('div');
        section.className = 'ws-group-section';
        if (groupId) section.dataset.groupId = groupId;
        if (groupId && typeof rt.registerGroupSectionElement === 'function') {
            rt.registerGroupSectionElement(groupId, section);
        }
        section.style.setProperty('--ws-group-color', groupColor);
        if (currentDepth > 0) section.classList.add('ws-group-section--nested');
        if (group && group.hidden) section.classList.add('ws-group-section--hidden');
        if (isCollapsed) section.classList.add('ws-group-section--collapsed');
        if (isFocusedGroup) section.classList.add('ws-group-section--focused');
        if (isInactiveGroup) section.classList.add('ws-group-section--inactive');
        if (groupId && String(config.groupOverviewId || '').trim() === groupId) {
            section.classList.add('ws-group-section--overview');
        }

        var header = document.createElement('div');
        header.className = 'ws-group-header';
        var groupLabel = group.hidden ? group.name + ' (Hidden)' : group.name;
        if (isFocusedGroup) groupLabel += ' (Focused)';
        else if (isInactiveGroup) groupLabel += ' (Inactive)';
        header.setAttribute('aria-label', groupLabel);
        header.removeAttribute('title');

        function toggleGroup(e) {
            if (e) e.stopPropagation();
            if (isInactiveGroup) return;
            ctx.groupsApi.setGroupCollapsed(groupId, undefined, config);
            ctx.saveAndRefresh(false);
        }

        function toggleOverview(e) {
            if (e) e.stopPropagation();
            if (isInactiveGroup) return;
            if (rt.isSidebarSortModeActive && rt.isSidebarSortModeActive()) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            var current = String(config.groupOverviewId || '').trim();
            var next = current === groupId ? '' : groupId;
            config.groupOverviewId = next;
            saveConfig();
            if (typeof rt.syncSidebarViewState === 'function') rt.syncSidebarViewState();
            if (typeof renderDashboard === 'function') renderDashboard();

            if (typeof window.showToast === 'function') {
                var groupLabel = group.name || 'Group';
                window.showToast(
                    next ? 'Group overview: ' + groupLabel : 'Exited group overview',
                    'info'
                );
            }
        }

        header.onclick = toggleOverview;
        header.oncontextmenu = function (e) {
            if (isInactiveGroup) return;
            if (typeof showSidebarGroupContext === 'function') showSidebarGroupContext(e, groupId);
        };
        header.draggable = manualMode && !isInactiveGroup;
        if (manualMode && !isInactiveGroup) {
            header.ondragstart = function (e) {
                rt._lastWorkspaceDragStartTime = Date.now();
                if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                    ctx.markRecentWorkspaceDragGesture(420);
                }
                ctx.setDragState('group', groupId);
                e.dataTransfer.setData('text/plain', groupId);
                e.dataTransfer.effectAllowed = 'move';
                header.classList.add('ws-group-header--dragging');
            };
            header.ondragend = function () {
                header.classList.remove('ws-group-header--dragging');
                if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                    ctx.markRecentWorkspaceDragGesture(260);
                }
                ctx.clearDragState();
            };
        }

        var popoutPayload = {
            icon: String(group.name || '?').slice(0, 1).toUpperCase(),
            name: group.name,
            popoutHint: 'Group'
        };
        header.addEventListener('mouseenter', function (e) { showWsPopout(e, popoutPayload); });
        header.addEventListener('mouseleave', hideWsPopout);

        var toggle = document.createElement('span');
        toggle.className = 'ws-group-toggle';
        toggle.textContent = isCollapsed ? '\u25B6' : '\u25BC';
        toggle.onclick = toggleGroup;
        header.appendChild(toggle);

        var swatch = document.createElement('span');
        swatch.className = 'ws-group-swatch';
        swatch.textContent = String(group.name || '?').slice(0, 1).toUpperCase();
        header.appendChild(swatch);

        var title = document.createElement('span');
        title.className = 'ws-group-title';
        title.textContent = group.name;
        header.appendChild(title);

        var count = document.createElement('span');
        count.className = 'ws-group-count';
        count.textContent = String((Array.isArray(workspaces) ? workspaces.length : 0) || 0);
        header.appendChild(count);

        var groupSummary = ctx.shouldShowDatapackBadges()
            ? ctx.getGroupSummary(groupId)
            : null;
        if (groupSummary) {
            var summary = document.createElement('span');
            summary.className = 'ws-group-summary';

            var bookmarkChip = document.createElement('span');
            bookmarkChip.className = 'ws-group-summary-chip';
            bookmarkChip.textContent = String(Number(groupSummary.bookmarkCount || 0)) + 'B';
            bookmarkChip.title = String(Number(groupSummary.bookmarkCount || 0)) + ' bookmarks in this group';
            summary.appendChild(bookmarkChip);

            var issueCount = Number(groupSummary.localIssueCount || 0);
            if (issueCount > 0) {
                var issueChip = document.createElement('span');
                issueChip.className = 'ws-group-summary-chip ws-group-summary-chip--alert';
                issueChip.textContent = String(issueCount) + '!';
                issueChip.title = issueCount + ' datapack issue' + (issueCount === 1 ? '' : 's') + ' in this group';
                summary.appendChild(issueChip);
            }

            header.appendChild(summary);
        }

        if (isFocusedGroup) {
            var focusedBadge = document.createElement('span');
            focusedBadge.className = 'ws-group-focus-badge';
            focusedBadge.textContent = 'Focused';
            header.appendChild(focusedBadge);
        }

        if (group.hidden) {
            var hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-group-hidden-badge';
            hiddenBadge.textContent = 'Hidden';
            header.appendChild(hiddenBadge);
        }

        if (!isInactiveGroup) ctx.attachGroupMemberDropTarget(header, groupId);
        section.appendChild(header);

        var body = document.createElement('div');
        body.className = 'ws-group-body';
        if (isCollapsed) body.style.display = 'none';
        if (!isInactiveGroup) ctx.attachGroupMemberDropTarget(body, groupId);

        if (!isInactiveGroup) {
            // Group body no longer triggers overview. Access it via the group header.
        }

        if (!isCollapsed) {
            if (visibleWorkspaces.length > 0) {
                renderGroupMembers(ctx, visibleWorkspaces, body, {
                    groupId: groupId,
                    depth: currentDepth + 1,
                    manualSlots: manualMode || !!opts.manualSlots,
                    groupColor: groupColor,
                    renderInactive: isHiddenGroup
                });
            } else {
                var empty = document.createElement('div');
                empty.className = 'ws-group-empty';
                empty.textContent = totalWorkspaces > 0
                    ? 'No visible tabs in this group'
                    : 'No tabs in this group';
                body.appendChild(empty);
            }
        }

        section.appendChild(body);
        wrapper.appendChild(section);
        return wrapper;
    }

    rt.renderGroupMembers = renderGroupMembers;
    rt.buildGroupSection = buildGroupSection;
    rt.groupsReady = true;
})();
