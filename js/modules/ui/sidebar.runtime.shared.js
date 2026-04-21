window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.sharedReady) return;

    var previewState = rt.previewState || (rt.previewState = {
        hoverRevealActive: false,
        hideTimer: 0
    });

    function syncHoverRevealUiState() {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        var isActive = !!previewState.hoverRevealActive;
        sb.classList.toggle('ws-hover-reveal-active', isActive);

        var previewButton = sb.querySelector('.ws-hover-reveal');
        if (previewButton) previewButton.classList.toggle('active', isActive);
    }

    function setHoverRevealActive(nextValue) {
        previewState.hoverRevealActive = !!nextValue;
        syncHoverRevealUiState();
        return previewState.hoverRevealActive;
    }

    function isHoverRevealActive() {
        return !!previewState.hoverRevealActive;
    }

    function getDatapackIndexApi() {
        return window.EveOS?.SearchAdvanced?.Index || null;
    }

    function queueStructureSummaryWarmup(reason, rerender) {
        var indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.ensureFresh !== 'function') return;
        if (rt._structureSummaryWarmPromise) return;

        rt._structureSummaryWarmPromise = Promise.resolve(indexApi.ensureFresh({ reason: String(reason || 'sidebar-structure-summary') }))
            .then(function () {
                if (typeof rerender === 'function') rerender();
            })
            .catch(function () {
                // Ignore warmup failures and continue rendering without summaries.
            })
            .finally(function () {
                rt._structureSummaryWarmPromise = null;
            });
    }

    function createRenderContext(sb) {
        var helpers = window.EveWorkspaceHelpers;
        var groupsApi = window.EveSidebarGroups || null;
        var dragState = { type: '', id: '', hoverWorkspaceId: '', didApply: false };
        var ctx = {
            sb: sb,
            helpers: helpers,
            groupsApi: groupsApi
        };

        if (groupsApi && typeof groupsApi.ensureConfigDefaults === 'function') {
            groupsApi.ensureConfigDefaults(config);
        }

        if (!Array.isArray(config.collapsedTabs)) {
            config.collapsedTabs = Array.isArray(config.collapsed) ? config.collapsed.slice() : [];
        }

        ctx.saveAndRefresh = function (shouldRenderDashboard) {
            saveConfig({ immediate: true });
            if (typeof window.renderSidebar === 'function') window.renderSidebar();
            if (shouldRenderDashboard && typeof renderDashboard === 'function') renderDashboard();
        };

        ctx.getStructureSummary = function () {
            var indexApi = getDatapackIndexApi();
            var summary = indexApi && typeof indexApi.getStructureSummary === 'function'
                ? indexApi.getStructureSummary()
                : null;
            if (summary && Number(summary.builtAt || 0) > 0) return summary;
            queueStructureSummaryWarmup('sidebar-structure-summary', window.renderSidebar);
            return null;
        };

        ctx.getWorkspaceSummary = function (workspaceId) {
            var summary = ctx.getStructureSummary();
            var key = String(workspaceId || '').trim();
            return summary && key ? (summary.workspaces[key] || null) : null;
        };

        ctx.getGroupSummary = function (groupId) {
            var summary = ctx.getStructureSummary();
            var key = String(groupId || '').trim();
            return summary && key ? (summary.groups[key] || null) : null;
        };

        ctx.clearDragTargets = function () {
            sb.querySelectorAll('.ws-drop-target').forEach(function (element) {
                element.classList.remove('ws-drop-target');
            });
        };

        ctx.setDragState = function (type, id) {
            dragState = {
                type: String(type || '').trim(),
                id: String(id || '').trim(),
                hoverWorkspaceId: '',
                didApply: false
            };
            sb.classList.add('ws-drag-active');
        };

        ctx.clearDragState = function () {
            dragState = { type: '', id: '', hoverWorkspaceId: '', didApply: false };
            sb.classList.remove('ws-drag-active');
            ctx.clearDragTargets();
        };

        ctx.resolveEventTargetElement = function (event) {
            if (!event) return null;
            if (typeof document.elementFromPoint === 'function'
                && Number.isFinite(event.clientX)
                && Number.isFinite(event.clientY)) {
                var pointTarget = document.elementFromPoint(event.clientX, event.clientY);
                if (pointTarget) return pointTarget;
            }
            return event.target instanceof Element ? event.target : null;
        };

        ctx.getDraggedWorkspaceId = function () {
            return dragState.type === 'workspace' ? String(dragState.id || '').trim() : '';
        };

        ctx.getDraggedGroupId = function () {
            return dragState.type === 'group' ? String(dragState.id || '').trim() : '';
        };

        ctx.setHoveredWorkspaceTarget = function (workspaceId) {
            if (dragState.type !== 'workspace') return;
            dragState.hoverWorkspaceId = String(workspaceId || '').trim();
        };

        ctx.getHoveredWorkspaceTarget = function () {
            return String(dragState.hoverWorkspaceId || '').trim();
        };

        ctx.markWorkspaceDropApplied = function () {
            if (dragState.type !== 'workspace') return;
            dragState.didApply = true;
        };

        ctx.wasWorkspaceDropApplied = function () {
            return !!dragState.didApply;
        };

        ctx.resolveWorkspaceDropTargetId = function (targetElement, dragId) {
            if (!(targetElement instanceof Element)) return '';
            var workspaceTarget = targetElement.closest('.ws-item[data-ws-id]');
            var targetWorkspaceId = workspaceTarget ? String(workspaceTarget.dataset.wsId || '').trim() : '';
            if (!targetWorkspaceId || targetWorkspaceId === dragId) return '';
            if (ctx.isWorkspaceEffectivelyInactive(targetWorkspaceId)) return '';
            return targetWorkspaceId;
        };

        ctx.resolveWorkspaceFallbackTargetId = function (event, dragId) {
            var eventTargetId = ctx.resolveWorkspaceDropTargetId(ctx.resolveEventTargetElement(event), dragId);
            if (eventTargetId) return eventTargetId;
            var hoveredTargetId = ctx.getHoveredWorkspaceTarget();
            if (hoveredTargetId && hoveredTargetId !== dragId && !ctx.isWorkspaceEffectivelyInactive(hoveredTargetId)) {
                return hoveredTargetId;
            }
            return '';
        };

        ctx.isManualSidebarOrder = function () {
            return !!(groupsApi && typeof groupsApi.getSidebarOrderMode === 'function'
                && groupsApi.getSidebarOrderMode(config) === 'manual');
        };

        ctx.getFocusedGroupId = function () {
            return groupsApi && typeof groupsApi.getFocusedGroupId === 'function'
                ? groupsApi.getFocusedGroupId(config)
                : '';
        };

        ctx.isWorkspaceEffectivelyInactive = function (ws) {
            if (!ws) return true;
            if (groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function') {
                return groupsApi.isWorkspaceEffectivelyInactive(ws, config);
            }
            return !!ws.inactive;
        };

        ctx.shouldShowInactiveTabs = function () {
            return !!config.showInactiveTabs || isHoverRevealActive();
        };

        ctx.shouldShowHiddenGroups = function () {
            return !!config.showHiddenSidebarGroups || isHoverRevealActive();
        };

        ctx.shouldShowDatapackBadges = function () {
            return config.showSidebarDatapackBadges !== false;
        };

        ctx.shouldRenderWorkspace = function (ws) {
            return !!ws && (!ctx.isWorkspaceEffectivelyInactive(ws) || ctx.shouldShowInactiveTabs());
        };

        ctx.getRenderableWorkspaces = function (workspaces) {
            return Array.isArray(workspaces)
                ? workspaces.filter(function (workspace) { return ctx.shouldRenderWorkspace(workspace); })
                : [];
        };

        ctx.isGroupEffectivelyInactive = function (groupId) {
            return !!(groupsApi && typeof groupsApi.isGroupEffectivelyInactive === 'function'
                && groupsApi.isGroupEffectivelyInactive(groupId, config));
        };

        ctx.shouldRenderGroup = function (group) {
            if (!group) return false;
            if (ctx.shouldShowInactiveTabs()) return true;
            return !ctx.isGroupEffectivelyInactive(group.id);
        };

        ctx.findFirstWorkspaceId = function (workspaces) {
            var list = Array.isArray(workspaces) ? workspaces : [];
            var firstId = '';

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
        };

        ctx.syncFocusedGroupState = function () {
            var focusedGroupId = ctx.getFocusedGroupId();
            if (focusedGroupId && groupsApi && typeof groupsApi.isWorkspaceInFocusedGroup === 'function'
                && !groupsApi.isWorkspaceInFocusedGroup(String(config.activeWorkspace || '').trim(), config)) {
                var focusedRoots = groupsApi.getGroupRoots(focusedGroupId, config);
                var fallbackWorkspaceId = ctx.findFirstWorkspaceId(focusedRoots);
                if (fallbackWorkspaceId) {
                    config.activeWorkspace = fallbackWorkspaceId;
                    saveConfig({ immediate: true });
                } else if (typeof groupsApi.setFocusedGroup === 'function') {
                    groupsApi.setFocusedGroup('', config);
                    saveConfig({ immediate: true });
                }
            }
        };

        ctx.getRawParentEntries = function (parentWorkspaceId, includeHidden) {
            var targetParentId = String(parentWorkspaceId || '').trim();
            var entries;

            if (groupsApi && typeof groupsApi.getOrderedEntries === 'function') {
                entries = groupsApi.getOrderedEntries(targetParentId, config, {
                    includeHidden: !!includeHidden || ctx.shouldShowHiddenGroups()
                });
            } else if (!targetParentId) {
                entries = (Array.isArray(config.workspaces) ? config.workspaces : []).map(function (workspace) {
                    return { kind: 'workspace', id: String(workspace.id), workspace: workspace };
                });
            } else {
                var parentWorkspace = helpers && typeof helpers.findById === 'function'
                    ? helpers.findById(config.workspaces, targetParentId)
                    : null;
                entries = (Array.isArray(parentWorkspace && parentWorkspace.subTabs) ? parentWorkspace.subTabs : []).map(function (workspace) {
                    return { kind: 'workspace', id: String(workspace.id), workspace: workspace };
                });
            }

            return Array.isArray(entries) ? entries.filter(Boolean) : [];
        };

        ctx.getVisibleParentEntries = function (parentWorkspaceId) {
            return ctx.getRawParentEntries(parentWorkspaceId, false).filter(function (entry) {
                if (!entry) return false;
                if (entry.kind === 'group') return ctx.shouldRenderGroup(entry.group, entry.workspaces);
                return ctx.shouldRenderWorkspace(entry.workspace);
            });
        };

        if (typeof rt.attachRenderInteractions === 'function') {
            rt.attachRenderInteractions(ctx, dragState, helpers, groupsApi);
        }

        return ctx;
    }

    rt.syncHoverRevealUiState = syncHoverRevealUiState;
    rt.setHoverRevealActive = setHoverRevealActive;
    rt.isHoverRevealActive = isHoverRevealActive;
    rt.createRenderContext = createRenderContext;
    rt.sharedReady = true;
})();
