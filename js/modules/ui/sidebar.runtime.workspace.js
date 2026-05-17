window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.workspaceReady || !rt.sharedReady || !rt.groupsReady || !rt.workspaceItemReady) return;

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
            renderWorkspaceItem(ctx, entry.workspace, container, depth, Object.assign({}, options, {
                parentWorkspaceId: entry.parentWorkspaceId || '',
                orderedEntries: Array.isArray(options && options.orderedEntries) ? options.orderedEntries : [],
                entryIndex: typeof (options && options.entryIndex) === 'number' ? options.entryIndex : 0,
                beforeEntry: entry
            }));
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
        renderEntry(ctx, entry, block, 0, {
            manualSlots: true,
            parentWorkspaceId: '',
            orderedEntries: orderedEntries,
            entryIndex: entryIndex,
            beforeEntry: entry
        });
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
            renderEntry(ctx, entry, container, depth, Object.assign({}, opts, {
                parentWorkspaceId: parentWorkspaceId || '',
                orderedEntries: orderedEntries,
                entryIndex: index,
                beforeEntry: entry
            }));
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

        var renderWorkspaceItem = null;
function handleSidebarWorkspaceDrop(ctx, dragId, targetWorkspaceId) {
        var dragDuration = Date.now() - (rt._lastWorkspaceDragStartTime || 0);
        if (dragDuration < 150) return false; // Ignore instant buffered drops caused by UI freezes

        var targetId = String(targetWorkspaceId || '').trim();
        if (!dragId || !targetId || dragId === targetId) return false;
        if (ctx.isWorkspaceEffectivelyInactive(targetId)) return false;
        var targetEntries = ctx.getVisibleParentEntries(targetId);
        return ctx.moveWorkspaceToParentContext(dragId, targetId, null, targetEntries, targetEntries.length);
    }

    renderWorkspaceItem = rt.createWorkspaceItemRenderer({
        renderParentEntries: renderParentEntries,
        handleSidebarWorkspaceDrop: handleSidebarWorkspaceDrop
    });

    function renderRootTree(ctx) {
        var orderedEntries = ctx.getVisibleParentEntries('');
        var treeHost = document.createElement('div');
        treeHost.className = 'ws-tree-host';
        renderParentEntries(ctx, '', treeHost, 0, {
            manualSlots: true,
            rootBlocks: true
        });
        ctx.sb.appendChild(treeHost);
    }

    rt.renderEntry = renderEntry;
    rt.buildTopLevelOrderBlock = buildTopLevelOrderBlock;
    rt.renderParentEntries = renderParentEntries;
    rt.renderWorkspaceItem = renderWorkspaceItem;
    rt.handleSidebarWorkspaceDrop = handleSidebarWorkspaceDrop;
    rt.renderRootTree = renderRootTree;
    rt.workspaceReady = true;
})();
