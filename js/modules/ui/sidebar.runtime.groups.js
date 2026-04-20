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
                groupColor: opts.groupColor,
                groupPreviewBaseDepth: opts.depth,
                renderInactive: !!opts.renderInactive
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
        header.title = group.hidden ? group.name + ' (Hidden)' : group.name;
        if (isFocusedGroup) header.title += ' (Focused)';
        else if (isInactiveGroup) header.title += ' (Inactive)';

        function toggleGroup(e) {
            if (e) e.stopPropagation();
            if (isInactiveGroup) return;
            ctx.groupsApi.setGroupCollapsed(groupId, undefined, config);
            ctx.saveAndRefresh(false);
        }

        header.onclick = toggleGroup;
        header.oncontextmenu = function (e) {
            if (isInactiveGroup) return;
            if (typeof showSidebarGroupContext === 'function') showSidebarGroupContext(e, groupId);
        };
        header.draggable = manualMode && !isInactiveGroup;
        if (manualMode && !isInactiveGroup) {
            header.ondragstart = function (e) {
                ctx.setDragState('group', groupId);
                e.dataTransfer.setData('text/plain', groupId);
                e.dataTransfer.effectAllowed = 'move';
                header.classList.add('ws-group-header--dragging');
            };
            header.ondragend = function () {
                header.classList.remove('ws-group-header--dragging');
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
        title.onclick = toggleGroup;
        title.addEventListener('mouseenter', function (e) { showWsPopout(e, popoutPayload); });
        title.addEventListener('mouseleave', hideWsPopout);
        header.appendChild(title);

        var count = document.createElement('span');
        count.className = 'ws-group-count';
        count.textContent = String((Array.isArray(workspaces) ? workspaces.length : 0) || 0);
        header.appendChild(count);

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
            body.onclick = function (e) {
                if (e.target.closest('.ws-item') || e.target.closest('.ws-order-slot') || e.target.closest('.ws-group-empty')) return;
                e.stopPropagation();

                var current = String(config.groupOverviewId || '').trim();
                var next = current === groupId ? '' : groupId;
                config.groupOverviewId = next;
                ctx.saveAndRefresh(true);

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
                renderGroupMembers(ctx, visibleWorkspaces, body, {
                    groupId: groupId,
                    depth: currentDepth + 1,
                    manualSlots: manualMode,
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
