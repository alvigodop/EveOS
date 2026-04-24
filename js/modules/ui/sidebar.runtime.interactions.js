window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.interactionsReady || !rt.sharedReady) return;

    function attachRenderInteractions(ctx, dragState, helpers, groupsApi) {
        ctx.isDescendantOf = function (targetId, maybeDescendantId) {
            if (!helpers) return false;
            var target = helpers.findById(config.workspaces, targetId);
            if (!target) return false;
            return helpers.getDescendantIds(target).includes(String(maybeDescendantId || '').trim());
        };

        ctx.getSiblingListLength = function (parentWorkspaceId) {
            var targetParentId = String(parentWorkspaceId || '').trim();
            if (!helpers) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
            if (!targetParentId) return Array.isArray(config.workspaces) ? config.workspaces.length : 0;
            var parentWorkspace = helpers.findById(config.workspaces, targetParentId);
            return Array.isArray(parentWorkspace && parentWorkspace.subTabs) ? parentWorkspace.subTabs.length : 0;
        };

        ctx.resolveWorkspaceInsertIndex = function (parentWorkspaceId, beforeEntry, orderedEntries, entryIndex) {
            var targetParentId = String(parentWorkspaceId || '').trim();

            function getWorkspaceIndex(workspaceId) {
                if (!helpers || !workspaceId) return ctx.getSiblingListLength(targetParentId);
                var siblingContext = helpers.findSiblingContext(config.workspaces, workspaceId);
                if (!siblingContext) return ctx.getSiblingListLength(targetParentId);
                if (String(siblingContext.parentId || '').trim() !== targetParentId) return ctx.getSiblingListLength(targetParentId);
                return siblingContext.index;
            }

            if (!beforeEntry) return ctx.getSiblingListLength(targetParentId);
            if (beforeEntry.kind === 'workspace') return getWorkspaceIndex(beforeEntry.id);

            for (var i = entryIndex; i < orderedEntries.length; i += 1) {
                var nextEntry = orderedEntries[i];
                if (!nextEntry || nextEntry.kind !== 'workspace') continue;
                return getWorkspaceIndex(nextEntry.id);
            }

            return ctx.getSiblingListLength(targetParentId);
        };

        ctx.promoteToRoot = function (dragId, beforeEntry, orderedEntries, entryIndex) {
            if (!helpers || typeof helpers.moveToPosition !== 'function') return false;
            var dragNode = helpers.findById(config.workspaces, dragId);
            if (!dragNode) return false;

            var currentGroupId = groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
                ? groupsApi.getWorkspaceGroupId(dragId, config)
                : String(dragNode.groupId || '').trim();

            var targetIndex = ctx.resolveWorkspaceInsertIndex('', beforeEntry, orderedEntries || [], typeof entryIndex === 'number' ? entryIndex : 0);
            var previousWorkspaces = config.workspaces;
            config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', targetIndex);

            var movedNode = helpers.findById(config.workspaces, dragId);
            if (!movedNode) {
                config.workspaces = previousWorkspaces;
                return false;
            }

            var previousGroupId = currentGroupId;
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

            ctx.markWorkspaceDropApplied();
            return true;
        };

        ctx.moveWorkspaceToParentContext = function (dragId, parentWorkspaceId, beforeEntry, orderedEntries, entryIndex) {
            if (!helpers || typeof helpers.moveToPosition !== 'function') return false;

            var targetParentId = String(parentWorkspaceId || '').trim();
            if (targetParentId) {
                if (dragId === targetParentId) return false;
                if (ctx.isDescendantOf(dragId, targetParentId)) return false;
            }

            if (!targetParentId) return ctx.promoteToRoot(dragId, beforeEntry, orderedEntries, entryIndex);

            var targetIndex = ctx.resolveWorkspaceInsertIndex(targetParentId, beforeEntry, orderedEntries || [], typeof entryIndex === 'number' ? entryIndex : 0);
            var previousWorkspaces = config.workspaces;
            config.workspaces = helpers.moveToPosition(config.workspaces, dragId, targetParentId, targetIndex);

            var movedNode = helpers.findById(config.workspaces, dragId);
            if (!movedNode) {
                config.workspaces = previousWorkspaces;
                return false;
            }
            delete movedNode.groupId;

            if (groupsApi && ctx.isManualSidebarOrder() && typeof groupsApi.placeManualOrderEntry === 'function') {
                groupsApi.placeManualOrderEntry(
                    'workspace',
                    dragId,
                    beforeEntry ? beforeEntry.kind : '',
                    beforeEntry ? beforeEntry.id : '',
                    config,
                    targetParentId
                );
            } else if (groupsApi && typeof groupsApi.removeManualOrderEntry === 'function') {
                groupsApi.removeManualOrderEntry('workspace', dragId, config);
            }
            ctx.markWorkspaceDropApplied();
            return true;
        };

        ctx.canMoveWorkspaceIntoGroup = function (workspaceId, groupId) {
            var dragId = String(workspaceId || '').trim();
            var targetGroupId = String(groupId || '').trim();
            if (!dragId || !targetGroupId || !groupsApi) return false;
            if (!groupsApi.findGroupById(targetGroupId, config)) return false;

            if (typeof groupsApi.isRootWorkspace === 'function' && groupsApi.isRootWorkspace(dragId, config)) {
                if (typeof groupsApi.canGroupWorkspaceInGroup === 'function') {
                    return groupsApi.canGroupWorkspaceInGroup(dragId, targetGroupId, config);
                }
                return true;
            }

            var dragNode = helpers && typeof helpers.findById === 'function'
                ? helpers.findById(config.workspaces, dragId)
                : null;
            if (!dragNode) return false;

            var groupParentId = typeof groupsApi.getGroupParentWorkspaceId === 'function'
                ? String(groupsApi.getGroupParentWorkspaceId(targetGroupId, config) || '').trim()
                : '';
            if (!groupParentId) return true;
            if (groupParentId === dragId) return false;
            if (helpers && typeof helpers.getPath === 'function') {
                return helpers.getPath([dragNode], groupParentId).length === 0;
            }
            return true;
        };

        ctx.canDropWorkspaceIntoGroup = function (groupId) {
            return ctx.canMoveWorkspaceIntoGroup(ctx.getDraggedWorkspaceId(), groupId);
        };

        ctx.moveWorkspaceIntoGroup = function (dragId, groupId, beforeWorkspaceId) {
            if (!helpers || !groupsApi || typeof helpers.moveToPosition !== 'function') return false;
            var targetGroupId = String(groupId || '').trim();
            if (!targetGroupId || !groupsApi.findGroupById(targetGroupId, config)) return false;
            if (!ctx.canMoveWorkspaceIntoGroup(dragId, targetGroupId)) return false;

            var existingGroupId = groupsApi.getWorkspaceGroupId(dragId, config);
            var isRootWorkspace = typeof groupsApi.isRootWorkspace === 'function'
                && groupsApi.isRootWorkspace(dragId, config);
            if (existingGroupId === targetGroupId && isRootWorkspace && !beforeWorkspaceId) {
                ctx.markWorkspaceDropApplied();
                return true;
            }

            if (isRootWorkspace
                && typeof groupsApi.canGroupWorkspaceInGroup === 'function'
                && !groupsApi.canGroupWorkspaceInGroup(dragId, targetGroupId, config)) {
                return false;
            }

            if (isRootWorkspace) {
                if (typeof groupsApi.moveRootWorkspaceToGroup !== 'function') return false;
                if (!groupsApi.moveRootWorkspaceToGroup(dragId, targetGroupId, config, beforeWorkspaceId || '')) return false;
                ctx.markWorkspaceDropApplied();
                return true;
            }

            var roots = Array.isArray(config.workspaces) ? config.workspaces : [];
            var insertIndex = roots.length;
            var beforeId = String(beforeWorkspaceId || '').trim();
            if (beforeId) {
                var beforeIndex = roots.findIndex(function (workspace) {
                    return workspace && String(workspace.id || '') === beforeId;
                });
                if (beforeIndex !== -1) insertIndex = beforeIndex;
            } else {
                var lastGroupIndex = roots.reduce(function (acc, workspace, index) {
                    return workspace && groupsApi.getWorkspaceGroupId(workspace, config) === targetGroupId ? index : acc;
                }, -1);
                insertIndex = lastGroupIndex === -1 ? roots.length : lastGroupIndex + 1;
            }

            var previousWorkspaces = config.workspaces;
            config.workspaces = helpers.moveToPosition(config.workspaces, dragId, '', insertIndex);
            var movedNode = helpers.findById(config.workspaces, dragId);
            var movedParent = typeof helpers.findParent === 'function'
                ? helpers.findParent(config.workspaces, dragId)
                : null;
            if (!movedNode || movedParent) {
                config.workspaces = previousWorkspaces;
                return false;
            }

            movedNode.groupId = targetGroupId;
            if (typeof groupsApi.removeManualOrderEntry === 'function') {
                groupsApi.removeManualOrderEntry('workspace', dragId, config);
            }
            ctx.markWorkspaceDropApplied();
            return true;
        };

        ctx.canDropGroupIntoWorkspace = function (workspaceId) {
            var dragGroupId = ctx.getDraggedGroupId();
            if (!dragGroupId || !groupsApi || !ctx.isManualSidebarOrder()) return false;
            return typeof groupsApi.canPlaceGroupUnderWorkspace === 'function'
                ? groupsApi.canPlaceGroupUnderWorkspace(dragGroupId, workspaceId, config)
                : false;
        };

        ctx.moveGroupToParentContext = function (groupId, parentWorkspaceId, beforeEntry) {
            if (!groupsApi || typeof groupsApi.setGroupParentWorkspaceId !== 'function') return false;
            var targetParentId = String(parentWorkspaceId || '').trim();
            var moved = groupsApi.setGroupParentWorkspaceId(groupId, targetParentId, config);
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
        };

        ctx.attachGroupMemberDropTarget = function (element, groupId) {
            if (!element) return;

            element.ondragover = function (e) {
                if (!ctx.canDropWorkspaceIntoGroup(groupId)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            };
            element.ondragenter = function (e) {
                if (!ctx.canDropWorkspaceIntoGroup(groupId)) return;
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
                var dragDuration = Date.now() - (rt._lastWorkspaceDragStartTime || 0);
                if (dragDuration < 150) return; // Ignore instant buffered drops
                var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
                if (!dragId || !ctx.canDropWorkspaceIntoGroup(groupId)) return;
                if (ctx.moveWorkspaceIntoGroup(dragId, groupId, '')) ctx.saveAndRefresh(true);
            };
            element.__eveSidebarApplyPointerDrop = function (dragId) {
                var workspaceId = String(dragId || '').trim();
                if (!workspaceId || !ctx.canMoveWorkspaceIntoGroup(workspaceId, groupId)) return false;
                return ctx.moveWorkspaceIntoGroup(workspaceId, groupId, '');
            };
        };

        ctx.buildGroupMemberOrderSlot = function (options) {
            var opts = options && typeof options === 'object' ? options : {};
            var slot = document.createElement('div');
            slot.className = 'ws-order-slot';
            if (typeof opts.depth === 'number' && opts.depth > 0) {
                slot.classList.add('ws-order-slot--nested');
                slot.classList.add('ws-depth-' + Math.min(opts.depth, 4));
                slot.style.setProperty('--ws-depth', opts.depth);
            }

            function canAcceptDrop() {
                return !!ctx.getDraggedWorkspaceId() && ctx.canDropWorkspaceIntoGroup(opts.groupId);
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
                var dragDuration = Date.now() - (rt._lastWorkspaceDragStartTime || 0);
                if (dragDuration < 150) return; // Ignore instant buffered drops
                var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
                if (!dragId || !canAcceptDrop()) return;
                if (ctx.moveWorkspaceIntoGroup(dragId, opts.groupId, opts.beforeWorkspaceId || '')) ctx.saveAndRefresh(true);
            };

            slot.__eveSidebarApplyPointerDrop = function (dragId) {
                var workspaceId = String(dragId || '').trim();
                if (!workspaceId || !canAcceptDrop()) return false;
                return ctx.moveWorkspaceIntoGroup(workspaceId, opts.groupId, opts.beforeWorkspaceId || '');
            };

            return slot;
        };

        ctx.buildEntryOrderSlot = function (options) {
            var opts = options && typeof options === 'object' ? options : {};
            var slot = document.createElement('div');
            slot.className = 'ws-order-slot';
            if (opts.topLevel) {
                slot.classList.add('ws-order-slot--top');
            } else if (typeof opts.depth === 'number' && opts.depth > 0) {
                slot.classList.add('ws-order-slot--nested');
                slot.classList.add('ws-depth-' + Math.min(opts.depth, 4));
                slot.style.setProperty('--ws-depth', opts.depth);
            }

            function canAcceptDrop() {
                if (!ctx.isManualSidebarOrder()) return false;

                var dragGroupId = ctx.getDraggedGroupId();
                if (dragGroupId) {
                    if (!groupsApi || typeof groupsApi.canPlaceGroupUnderWorkspace !== 'function') return false;
                    return groupsApi.canPlaceGroupUnderWorkspace(dragGroupId, opts.parentWorkspaceId || '', config);
                }

                var dragId = ctx.getDraggedWorkspaceId();
                if (!dragId || !helpers || typeof helpers.moveToPosition !== 'function') return false;
                if (opts.parentWorkspaceId && (dragId === opts.parentWorkspaceId || ctx.isDescendantOf(dragId, opts.parentWorkspaceId))) {
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
                var dragDuration = Date.now() - (rt._lastWorkspaceDragStartTime || 0);
                if (dragDuration < 150) return; // Ignore instant buffered drops

                var dragGroupId = ctx.getDraggedGroupId();
                if (dragGroupId) {
                    if (ctx.moveGroupToParentContext(dragGroupId, opts.parentWorkspaceId || '', opts.beforeEntry || null)) {
                        ctx.saveAndRefresh(false);
                    }
                    return;
                }

                var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
                if (!dragId || !canAcceptDrop()) return;
                if (ctx.moveWorkspaceToParentContext(dragId, opts.parentWorkspaceId || '', opts.beforeEntry || null, opts.orderedEntries || [], opts.entryIndex || 0)) {
                    ctx.saveAndRefresh(true);
                }
            };

            slot.__eveSidebarApplyPointerDrop = function (dragId) {
                var workspaceId = String(dragId || '').trim();
                if (!workspaceId || !canAcceptDrop()) return false;
                return ctx.moveWorkspaceToParentContext(
                    workspaceId,
                    opts.parentWorkspaceId || '',
                    opts.beforeEntry || null,
                    opts.orderedEntries || [],
                    opts.entryIndex || 0
                );
            };

            return slot;
        };
    }

    rt.attachRenderInteractions = attachRenderInteractions;
    rt.interactionsReady = true;
})();
