window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.workspaceReady || !rt.sharedReady || !rt.groupsReady) return;

    function renderEntry(ctx, entry, container, depth, options) {
        if (!entry) return;
        if (entry.kind === 'group') {
            var section = rt.buildGroupSection(ctx, entry.group, entry.workspaces, {
                depth: depth,
                manualSlots: !!(options && options.manualSlots),
                parentWorkspaceId: entry.parentWorkspaceId || '',
                renderInactive: !!(options && options.renderInactive)
            });
            if (section) container.appendChild(section);
            return;
        }

        if (entry.workspace && (ctx.shouldRenderWorkspace(entry.workspace) || !!(options && options.renderInactive))) {
            renderWorkspaceItem(ctx, entry.workspace, container, depth, options);
        }
    }

    function buildTopLevelOrderBlock(ctx, entry, orderedEntries, entryIndex) {
        var block = document.createElement('div');
        block.className = 'ws-top-order-block';
        block.appendChild(ctx.buildEntryOrderSlot({
            parentWorkspaceId: '',
            beforeEntry: entry,
            orderedEntries: orderedEntries,
            entryIndex: entryIndex,
            depth: 0,
            topLevel: true
        }));
        renderEntry(ctx, entry, block, 0, { manualSlots: true });
        return block;
    }

    function renderParentEntries(ctx, parentWorkspaceId, container, depth, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var orderedEntries = opts.renderInactive
            ? ctx.getRawParentEntries(parentWorkspaceId, false).filter(function (entry) {
                if (!entry) return false;
                if (entry.kind === 'group') return true;
                return !!entry.workspace;
            })
            : ctx.getVisibleParentEntries(parentWorkspaceId);

        if (opts.rootBlocks) {
            orderedEntries.forEach(function (entry, index) {
                var block = buildTopLevelOrderBlock(ctx, entry, orderedEntries, index);
                if (block) container.appendChild(block);
            });
            var tailBlock = document.createElement('div');
            tailBlock.className = 'ws-top-order-block ws-top-order-block--tail';
            tailBlock.appendChild(ctx.buildEntryOrderSlot({
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
                container.appendChild(ctx.buildEntryOrderSlot({
                    parentWorkspaceId: parentWorkspaceId || '',
                    beforeEntry: entry,
                    orderedEntries: orderedEntries,
                    entryIndex: index,
                    depth: depth
                }));
            }
            renderEntry(ctx, entry, container, depth, opts);
        });

        if (opts.manualSlots) {
            container.appendChild(ctx.buildEntryOrderSlot({
                parentWorkspaceId: parentWorkspaceId || '',
                beforeEntry: null,
                orderedEntries: orderedEntries,
                entryIndex: orderedEntries.length,
                depth: depth
            }));
        }
    }

    function renderWorkspaceItem(ctx, ws, container, depth, options) {
        var currentDepth = typeof depth === 'number' ? depth : 0;
        var renderOptions = options && typeof options === 'object' ? options : {};
        var childEntries = ctx.getVisibleParentEntries(ws.id);
        var childEntriesAll = ctx.getRawParentEntries(ws.id, true);
        var hasChildren = childEntriesAll.length > 0;
        var isCollapsed = (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(String).includes(String(ws.id));
        var isGroupOverviewActive = !!String(config.groupOverviewId || '').trim();
        var isWorkspaceActive = config.viewMode !== 'unidex' && config.activeWorkspace === ws.id && !isGroupOverviewActive;
        var isInactive = ctx.isWorkspaceEffectivelyInactive(ws);

        if (isInactive && !ctx.shouldShowInactiveTabs() && !renderOptions.renderInactive) return;

        var wrapper = document.createElement('div');
        wrapper.className = 'ws-node-wrapper';
        if (currentDepth > 0) {
            wrapper.classList.add('ws-depth-' + Math.min(currentDepth, 4));
            wrapper.style.setProperty('--ws-depth', currentDepth);
        }
        if (renderOptions.groupPreview && currentDepth === renderOptions.groupPreviewBaseDepth) {
            wrapper.classList.add('ws-group-member-wrapper');
            wrapper.style.setProperty('--ws-group-color', renderOptions.groupColor || '#00d4ff');
        }

        var item = document.createElement('div');
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
                ctx.setDragState('workspace', ws.id);
                e.dataTransfer.setData('text/plain', ws.id);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('ws-dragging');
            };
            item.ondragend = function (e) {
                item.classList.remove('ws-dragging');
                var dragId = ctx.getDraggedWorkspaceId();
                var fallbackTargetId = dragId && !ctx.wasWorkspaceDropApplied()
                    ? ctx.resolveWorkspaceFallbackTargetId(e, dragId)
                    : '';
                if (dragId && fallbackTargetId && handleSidebarWorkspaceDrop(ctx, dragId, fallbackTargetId)) {
                    ctx.clearDragState();
                    ctx.saveAndRefresh(true);
                    return;
                }
                ctx.clearDragState();
            };
        }

        item.ondragover = function (e) {
            if (isInactive) return;
            if (!ctx.getDraggedWorkspaceId() && !ctx.canDropGroupIntoWorkspace(ws.id)) return;
            e.preventDefault();
            if (ctx.getDraggedWorkspaceId()) ctx.setHoveredWorkspaceTarget(ws.id);
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = function (e) {
            if (isInactive) return;
            if (!ctx.getDraggedWorkspaceId() && !ctx.canDropGroupIntoWorkspace(ws.id)) return;
            e.preventDefault();
            if (ctx.getDraggedWorkspaceId()) ctx.setHoveredWorkspaceTarget(ws.id);
            item.classList.add('ws-drop-target');
        };
        item.ondragleave = function () {
            if (ctx.getHoveredWorkspaceTarget() === String(ws.id)) {
                ctx.setHoveredWorkspaceTarget('');
            }
            item.classList.remove('ws-drop-target');
        };
        item.ondrop = function (e) {
            if (isInactive) return;
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('ws-drop-target');

            var dragGroupId = ctx.getDraggedGroupId();
            if (dragGroupId) {
                if (ctx.moveGroupToParentContext(dragGroupId, ws.id, null)) ctx.saveAndRefresh(false);
                return;
            }

            var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId || dragId === String(ws.id)) return;
            if (ctx.moveWorkspaceToParentContext(dragId, ws.id, null, childEntries, childEntries.length)) ctx.saveAndRefresh(true);
        };

        if (hasChildren) {
            var toggle = document.createElement('span');
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
                if (typeof window.renderSidebar === 'function') window.renderSidebar();
            };
            item.appendChild(toggle);
        } else if (currentDepth > 0) {
            var spacer = document.createElement('span');
            spacer.className = 'ws-spacer';
            item.appendChild(spacer);
        }

        var iconSpan = document.createElement('span');
        iconSpan.className = 'ws-icon';
        iconSpan.textContent = ws.icon || '\u{1F4C1}';
        item.appendChild(iconSpan);

        var label = document.createElement('span');
        label.className = 'ws-label';
        label.textContent = ws.name;
        item.appendChild(label);

        var workspaceSummary = ctx.getWorkspaceSummary(String(ws.id || ''));
        if (workspaceSummary) {
            var summary = document.createElement('span');
            summary.className = 'ws-summary';

            var bookmarkChip = document.createElement('span');
            bookmarkChip.className = 'ws-summary-chip';
            bookmarkChip.textContent = String(Number(workspaceSummary.bookmarkCount || 0)) + 'B';
            bookmarkChip.title = String(Number(workspaceSummary.bookmarkCount || 0)) + ' bookmarks in this tab';
            summary.appendChild(bookmarkChip);

            var issueCount = Number(workspaceSummary.brokenCount || 0)
                + Number(workspaceSummary.orphanedCount || 0)
                + Number(workspaceSummary.staleCount || 0);
            if (issueCount > 0) {
                var issueChip = document.createElement('span');
                issueChip.className = 'ws-summary-chip ws-summary-chip--alert';
                issueChip.textContent = String(issueCount) + '!';
                issueChip.title = issueCount + ' datapack issues in this tab';
                summary.appendChild(issueChip);
            }

            item.appendChild(summary);
        }

        if (ws.hiddenInParent && currentDepth > 0) {
            item.classList.add('ws-hidden-in-parent');
            var hiddenBadge = document.createElement('span');
            hiddenBadge.className = 'ws-hidden-badge';
            hiddenBadge.textContent = 'Hidden';
            hiddenBadge.title = 'Hidden from parent tab view';
            item.appendChild(hiddenBadge);
        }

        if (!isInactive) {
            item.onclick = function () {
                var exitingUnidex = config.viewMode === 'unidex';
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
            renderParentEntries(ctx, ws.id, container, currentDepth + 1, {
                manualSlots: !!renderOptions.manualSlots,
                renderInactive: !!renderOptions.renderInactive
            });
        }
    }

    function handleSidebarWorkspaceDrop(ctx, dragId, targetWorkspaceId) {
        var targetId = String(targetWorkspaceId || '').trim();
        if (!dragId || !targetId || dragId === targetId) return false;
        if (ctx.isWorkspaceEffectivelyInactive(targetId)) return false;
        var targetEntries = ctx.getVisibleParentEntries(targetId);
        return ctx.moveWorkspaceToParentContext(dragId, targetId, null, targetEntries, targetEntries.length);
    }

    function renderRootTree(ctx) {
        var orderedEntries = ctx.getVisibleParentEntries('');
        if (ctx.isManualSidebarOrder()) {
            var treeHost = document.createElement('div');
            treeHost.className = 'ws-tree-host';
            renderParentEntries(ctx, '', treeHost, 0, {
                manualSlots: true,
                rootBlocks: true
            });
            ctx.sb.appendChild(treeHost);
            return;
        }

        orderedEntries.forEach(function (entry) {
            renderEntry(ctx, entry, ctx.sb, 0, { manualSlots: false });
        });
    }

    rt.renderEntry = renderEntry;
    rt.buildTopLevelOrderBlock = buildTopLevelOrderBlock;
    rt.renderParentEntries = renderParentEntries;
    rt.renderWorkspaceItem = renderWorkspaceItem;
    rt.handleSidebarWorkspaceDrop = handleSidebarWorkspaceDrop;
    rt.renderRootTree = renderRootTree;
    rt.workspaceReady = true;
})();
