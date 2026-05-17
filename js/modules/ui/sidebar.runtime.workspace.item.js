window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.workspaceItemReady) return;

    rt.createWorkspaceItemRenderer = function createWorkspaceItemRenderer(deps) {
        var renderParentEntries = deps && deps.renderParentEntries;
        var handleSidebarWorkspaceDrop = deps && deps.handleSidebarWorkspaceDrop;

        function isCategoryCardSidebarDrag(event) {
            if (!event || !event.dataTransfer) return false;
            if (typeof window.isCategoryCardDragPayload === 'function' && window.isCategoryCardDragPayload(event)) return true;
            return Array.from(event.dataTransfer.types || []).includes('application/x-eve-category-card');
        }

        function getCategoryCardSidebarPayload(event) {
            if (!event || !event.dataTransfer) return null;
            if (typeof window.getCategoryCardDragPayload === 'function') {
                var parsed = window.getCategoryCardDragPayload(event);
                if (parsed) return parsed;
            }
            var raw = event.dataTransfer.getData('application/x-eve-category-card')
                || event.dataTransfer.getData('application/json')
                || event.dataTransfer.getData('text/plain');
            if (!raw) return null;
            try {
                var payload = JSON.parse(raw);
                if (payload?.type !== 'category-card') return null;
                return payload;
            } catch (error) {
                return null;
            }
        }

function renderWorkspaceItem(ctx, ws, container, depth, options) {
        var currentDepth = typeof depth === 'number' ? depth : 0;
        var renderOptions = options && typeof options === 'object' ? options : {};
        var hasChildren = !!(
            (Array.isArray(ws.subTabs) && ws.subTabs.length > 0)
            || (ctx.groupsApi && typeof ctx.groupsApi.getGroupsForParent === 'function'
                && ctx.groupsApi.getGroupsForParent(ws.id, config).length > 0)
        );
        var isCollapsed = typeof ctx.isWorkspaceCollapsed === 'function'
            ? ctx.isWorkspaceCollapsed(ws.id)
            : (Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(String).includes(String(ws.id));
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
        wrapper.dataset.wsId = String(ws.id || '');
        wrapper.dataset.wsDepth = String(currentDepth);

        var childHost = null;
        var childBranchRendered = false;
        var toggle = null;

        function syncToggleUi(nextCollapsed) {
            if (!toggle) return;
            var isNowCollapsed = !!nextCollapsed;
            toggle.textContent = isNowCollapsed ? '\u25B6' : '\u25BC';
            toggle.setAttribute('aria-expanded', isNowCollapsed ? 'false' : 'true');
            toggle.setAttribute('aria-label', isNowCollapsed ? 'Expand sub tabs' : 'Collapse sub tabs');
            toggle.title = isNowCollapsed ? 'Expand sub tabs' : 'Collapse sub tabs';
        }

        function ensureChildHost() {
            if (!hasChildren) return null;
            if (!childHost) {
                childHost = document.createElement('div');
                childHost.className = 'ws-node-children';
                wrapper.appendChild(childHost);
            }
            return childHost;
        }

        function renderChildBranch(force) {
            var host = ensureChildHost();
            if (!host) return null;
            if (childBranchRendered && !force && host.childElementCount > 0) {
                return host;
            }
            var fragment = document.createDocumentFragment();
            renderParentEntries(ctx, ws.id, fragment, currentDepth + 1, {
                manualSlots: !!renderOptions.manualSlots,
                renderInactive: !!renderOptions.renderInactive,
                parentWorkspaceId: ws.id
            });
            host.replaceChildren(fragment);
            childBranchRendered = true;
            return host;
        }

        function syncHoverRevealPreviewAfterBranchChange() {
            if (typeof rt.invalidateHoverRevealPreview !== 'function') return;
            var previewState = rt.previewState || null;
            var hoverRevealActive = !!(rt.isHoverRevealActive && rt.isHoverRevealActive());
            if (!hoverRevealActive && !previewState?.revealPreviewReady) return;
            rt.invalidateHoverRevealPreview({
                rebuildIfActive: hoverRevealActive,
                queue: false
            });
        }

        function toggleWorkspaceBranch(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            var nextCollapsed = typeof ctx.setWorkspaceCollapsed === 'function'
                ? ctx.setWorkspaceCollapsed(ws.id)
                : !config.collapsedTabs.includes(ws.id);
            if (typeof ctx.setWorkspaceCollapsed !== 'function') {
                if (!nextCollapsed) {
                    config.collapsedTabs = config.collapsedTabs.filter(function (id) { return id !== ws.id; });
                } else {
                    config.collapsedTabs.push(ws.id);
                }
            }
            saveConfig();

            syncToggleUi(nextCollapsed);
            wrapper.classList.toggle('is-collapsed', nextCollapsed);
            var host = ensureChildHost();
            if (!host) return;

            if (nextCollapsed) {
                host.hidden = true;
                host.classList.add('is-collapsed');
                syncHoverRevealPreviewAfterBranchChange();
                return;
            }

            renderChildBranch(false);
            host.hidden = false;
            host.classList.remove('is-collapsed');
            syncHoverRevealPreviewAfterBranchChange();
        }

        function shouldTreatRowClickAsToggle(event) {
            if (!hasChildren || !toggle || !event) return false;
            var sidebar = document.getElementById('sidebar');
            if (!sidebar || !sidebar.classList.contains('is-expanded')) return false;
            var target = event.target instanceof Element ? event.target : null;
            if (target) {
                if (target.closest('.ws-toggle')) return true;
                if (target.closest('.ws-icon, .ws-label, .ws-summary, .ws-hidden-badge')) return false;
            }
            var itemRect = item.getBoundingClientRect();
            if (!itemRect || itemRect.width <= 0) return false;
            var toggleRect = toggle.getBoundingClientRect();
            var relativeX = Number(event.clientX) - itemRect.left;
            if (!Number.isFinite(relativeX) || relativeX < 0) return false;
            var toggleZoneRight = Math.max(28, (toggleRect.right - itemRect.left) + 4);
            return relativeX <= Math.min(toggleZoneRight, itemRect.width);
        }

        var item = document.createElement('div');
        item.className = 'ws-item ' + (isWorkspaceActive ? 'active' : '');
        if (currentDepth > 0) item.classList.add('ws-sub-item');
        if (isInactive) item.classList.add('ws-inactive');
        if (renderOptions.groupPreview && currentDepth === renderOptions.groupPreviewBaseDepth) {
            item.classList.add('ws-group-member-item');
            item.style.setProperty('--ws-group-color', renderOptions.groupColor || '#00d4ff');
        }

        function startWorkspaceDrag(e) {
            rt._lastWorkspaceDragStartTime = Date.now();
            rt._isDraggingWorkspace = true;
            if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                ctx.markRecentWorkspaceDragGesture(420);
            }
            ctx.setDragState('workspace', ws.id);
            e.dataTransfer.setData('text/plain', ws.id);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('ws-dragging');
        }

        function endWorkspaceDrag(e) {
            rt._isDraggingWorkspace = false;
            item.classList.remove('ws-dragging');
            if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                ctx.markRecentWorkspaceDragGesture(260);
            }
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
        }

        // Keep visible tabs draggable even when their branch is marked inactive.
        // Inactive should block open/select behavior, not reorder gestures.
        item.setAttribute('draggable', 'true');
        item.draggable = true;
        item.dataset.wsId = ws.id;
        if (typeof rt.registerWorkspaceItemElement === 'function') {
            rt.registerWorkspaceItemElement(ws.id, item);
        }
        item.ondragstart = startWorkspaceDrag;
        item.ondragend = endWorkspaceDrag;

        item.ondragover = function (e) {
            if (isInactive) return;
            if (isCategoryCardSidebarDrag(e)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('ws-drop-target', 'ws-drop-target-card');
                return;
            }
            if (!ctx.getDraggedWorkspaceId() && !ctx.canDropGroupIntoWorkspace(ws.id)) return;
            e.preventDefault();
            if (ctx.getDraggedWorkspaceId()) ctx.setHoveredWorkspaceTarget(ws.id);
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondragenter = function (e) {
            if (isInactive) return;
            if (isCategoryCardSidebarDrag(e)) {
                e.preventDefault();
                item.classList.add('ws-drop-target', 'ws-drop-target-card');
                return;
            }
            if (!ctx.getDraggedWorkspaceId() && !ctx.canDropGroupIntoWorkspace(ws.id)) return;
            e.preventDefault();
            if (ctx.getDraggedWorkspaceId()) ctx.setHoveredWorkspaceTarget(ws.id);
            item.classList.add('ws-drop-target');
        };
        item.ondragleave = function () {
            if (ctx.getHoveredWorkspaceTarget() === String(ws.id)) {
                ctx.setHoveredWorkspaceTarget('');
            }
            item.classList.remove('ws-drop-target', 'ws-drop-target-card');
        };

        function applyWorkspaceDropTarget(dragId) {
            if (isInactive) return false;
            var workspaceId = String(dragId || '').trim();
            if (!workspaceId || workspaceId === String(ws.id)) return false;
            if (renderOptions.groupPreview
                && String(renderOptions.groupId || '').trim()
                && currentDepth === renderOptions.groupPreviewBaseDepth) {
                var isRootWorkspaceDrag = !!(ctx.groupsApi
                    && typeof ctx.groupsApi.isRootWorkspace === 'function'
                    && ctx.groupsApi.isRootWorkspace(workspaceId, config));
                var targetHasChildren = !!(
                    (Array.isArray(ws.subTabs) && ws.subTabs.length > 0)
                    || (ctx.groupsApi && typeof ctx.groupsApi.getGroupsForParent === 'function'
                        && ctx.groupsApi.getGroupsForParent(ws.id, config).length > 0)
                );
                if (isRootWorkspaceDrag && targetHasChildren) {
                    return ctx.moveWorkspaceIntoGroup(workspaceId, renderOptions.groupId, ws.id);
                }
                var targetEntries = ctx.getVisibleParentEntries(ws.id);
                return ctx.moveWorkspaceToParentContext(workspaceId, ws.id, null, targetEntries, targetEntries.length);
            }

            var targetParentId = String(renderOptions.parentWorkspaceId || '').trim();
            if (targetParentId) {
                var dragParent = ctx.helpers && typeof ctx.helpers.findParent === 'function'
                    ? ctx.helpers.findParent(config.workspaces, workspaceId)
                    : null;
                var dragParentId = String(dragParent && dragParent.id || '').trim();
                if (dragParentId !== targetParentId) {
                    var childEntries = ctx.getVisibleParentEntries(ws.id);
                    return ctx.moveWorkspaceToParentContext(workspaceId, ws.id, null, childEntries, childEntries.length);
                }
            }
            var siblingEntries = Array.isArray(renderOptions.orderedEntries)
                ? renderOptions.orderedEntries
                : ctx.getVisibleParentEntries(targetParentId);
            var siblingIndex = typeof renderOptions.entryIndex === 'number' ? renderOptions.entryIndex : siblingEntries.length;
            var beforeEntry = renderOptions.beforeEntry || null;
            return ctx.moveWorkspaceToParentContext(workspaceId, targetParentId, beforeEntry, siblingEntries, siblingIndex);
        }

        item.__eveSidebarApplyPointerDrop = applyWorkspaceDropTarget;

        item.ondrop = function (e) {
            if (isInactive) return;
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('ws-drop-target', 'ws-drop-target-card');

            var cardPayload = getCategoryCardSidebarPayload(e);
            if (cardPayload?.type === 'category-card') {
                if (typeof window.moveCategoryCardToWorkspace === 'function') {
                    window.moveCategoryCardToWorkspace(cardPayload.workspaceId, cardPayload.categoryName, ws.id, {
                        requireConfirm: true,
                        targetWorkspaceName: ws.name || ws.id,
                        source: 'category-card-dropped-on-sidebar-tab'
                    });
                }
                return;
            }

            var dragGroupId = ctx.getDraggedGroupId();
            if (dragGroupId) {
                if (ctx.moveGroupToParentContext(dragGroupId, ws.id, null)) ctx.saveAndRefresh(false);
                return;
            }

            var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (applyWorkspaceDropTarget(dragId)) ctx.saveAndRefresh(true);
        };

        if (hasChildren) {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'ws-toggle';
            toggle.draggable = false;
            toggle.setAttribute('aria-controls', 'sidebar-children-' + String(ws.id || ''));
            syncToggleUi(isCollapsed);
            toggle.onpointerdown = function (e) {
                e.stopPropagation();
            };
            toggle.onmousedown = function (e) {
                e.stopPropagation();
            };
            toggle.ondragstart = function (e) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            toggle.onclick = toggleWorkspaceBranch;
            item.appendChild(toggle);
        } else if (currentDepth > 0) {
            var spacer = document.createElement('span');
            spacer.className = 'ws-spacer';
            item.appendChild(spacer);
        }

        var iconSpan = document.createElement('span');
        iconSpan.className = 'ws-icon';
        iconSpan.textContent = ws.icon || '\u{1F4C1}';
        iconSpan.setAttribute('draggable', 'true');
        iconSpan.draggable = true;
        iconSpan.ondragstart = function (e) {
            e.stopPropagation();
            startWorkspaceDrag(e);
        };
        iconSpan.ondragend = function (e) {
            e.stopPropagation();
            endWorkspaceDrag(e);
        };
        item.appendChild(iconSpan);

        var label = document.createElement('span');
        label.className = 'ws-label';
        label.textContent = ws.name;
        label.setAttribute('draggable', 'true');
        label.draggable = true;
        label.ondragstart = function (e) {
            e.stopPropagation();
            startWorkspaceDrag(e);
        };
        label.ondragend = function (e) {
            e.stopPropagation();
            endWorkspaceDrag(e);
        };
        item.appendChild(label);

        var workspaceSummary = ctx.shouldShowDatapackBadges()
            ? ctx.getWorkspaceSummary(String(ws.id || ''))
            : null;
        if (workspaceSummary) {
            var summary = document.createElement('span');
            summary.className = 'ws-summary';
            summary.setAttribute('draggable', 'true');
            summary.draggable = true;
            summary.ondragstart = function (e) {
                e.stopPropagation();
                startWorkspaceDrag(e);
            };
            summary.ondragend = function (e) {
                e.stopPropagation();
                endWorkspaceDrag(e);
            };

            var bookmarkChip = document.createElement('span');
            bookmarkChip.className = 'ws-summary-chip';
            bookmarkChip.textContent = String(Number(workspaceSummary.bookmarkCount || 0)) + 'B';
            bookmarkChip.title = String(Number(workspaceSummary.bookmarkCount || 0)) + ' bookmarks in this tab';
            summary.appendChild(bookmarkChip);

            var issueCount = Number(workspaceSummary.localIssueCount || 0);
            if (issueCount > 0) {
                var issueChip = document.createElement('span');
                issueChip.className = 'ws-summary-chip ws-summary-chip--alert';
                issueChip.textContent = String(issueCount) + '!';
                issueChip.title = issueCount + ' datapack issue' + (issueCount === 1 ? '' : 's') + ' in this tab';
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
            hiddenBadge.setAttribute('draggable', 'true');
            hiddenBadge.draggable = true;
            hiddenBadge.ondragstart = function (e) {
                e.stopPropagation();
                startWorkspaceDrag(e);
            };
            hiddenBadge.ondragend = function (e) {
                e.stopPropagation();
                endWorkspaceDrag(e);
            };
            item.appendChild(hiddenBadge);
        }

        if (typeof rt.attachNestedWorkspacePointerDrag === 'function') {
            rt.attachNestedWorkspacePointerDrag(ctx, item, ws);
        }

        if (!isInactive) {
            item.onmousedown = function (e) {
                if (e.button !== 0) return; // Only track left clicks
                item.dataset.mousedownTime = String(Date.now());
            };
            item.onclick = function (event) {
                if (rt.isSidebarSortModeActive && rt.isSidebarSortModeActive()) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof ctx.markRecentWorkspaceDragGesture === 'function') {
                        ctx.markRecentWorkspaceDragGesture(220);
                    }
                    return;
                }

                var mousedownTime = Number(item.dataset.mousedownTime || 0);
                var clickDuration = Date.now() - mousedownTime;

                // If the click took longer than 350ms, it was a drag or a long-press. Suppress it.
                if (mousedownTime > 0 && clickDuration > 350) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                if (typeof ctx.shouldSuppressWorkspaceClick === 'function' && ctx.shouldSuppressWorkspaceClick()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                if (shouldTreatRowClickAsToggle(event)) {
                    toggleWorkspaceBranch(event);
                    return;
                }
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

        item.setAttribute('aria-label', isInactive ? (ws.name + ' (Inactive)') : ws.name);
        item.removeAttribute('title');
        item.addEventListener('mouseenter', function (e) { showWsPopout(e, ws); });
        item.addEventListener('mouseleave', hideWsPopout);

        wrapper.appendChild(item);
        if (hasChildren) {
            var initialChildHost = ensureChildHost();
            if (initialChildHost) {
                initialChildHost.id = 'sidebar-children-' + String(ws.id || '');
            }
            wrapper.classList.toggle('is-collapsed', isCollapsed);
            if (!isCollapsed) {
                renderChildBranch(false);
                initialChildHost.hidden = false;
            } else if (initialChildHost) {
                initialChildHost.hidden = true;
                initialChildHost.classList.add('is-collapsed');
            }
        }
        container.appendChild(wrapper);
    }

    

        return renderWorkspaceItem;
    };

    rt.workspaceItemReady = true;
})();
