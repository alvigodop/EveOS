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

    function createSidebarElementRegistry() {
        return {
            workspaceItems: new Map(),
            groupSections: new Map(),
            unidexButtons: []
        };
    }

    function resetSidebarElementRegistry() {
        rt._sidebarElementRegistry = createSidebarElementRegistry();
        return rt._sidebarElementRegistry;
    }

    function ensureSidebarElementRegistry() {
        return rt._sidebarElementRegistry || resetSidebarElementRegistry();
    }

    function registerSidebarElement(map, key, element) {
        if (!map || !key || !element) return;
        var normalizedKey = String(key || '').trim();
        if (!normalizedKey) return;
        if (!map.has(normalizedKey)) {
            map.set(normalizedKey, []);
        }
        map.get(normalizedKey).push(element);
    }

    function registerWorkspaceItemElement(workspaceId, element) {
        var registry = ensureSidebarElementRegistry();
        registerSidebarElement(registry.workspaceItems, workspaceId, element);
    }

    function registerGroupSectionElement(groupId, element) {
        var registry = ensureSidebarElementRegistry();
        registerSidebarElement(registry.groupSections, groupId, element);
    }

    function registerUnidexButtonElement(element) {
        if (!element) return;
        var registry = ensureSidebarElementRegistry();
        registry.unidexButtons.push(element);
    }

    function snapshotSidebarViewState() {
        return {
            activeWorkspaceId: String(config?.activeWorkspace || '').trim(),
            overviewGroupId: String(config?.groupOverviewId || '').trim(),
            inUnidexView: String(config?.viewMode || '').trim() === 'unidex'
        };
    }

    function captureSidebarViewState() {
        rt._sidebarLastViewState = snapshotSidebarViewState();
        return rt._sidebarLastViewState;
    }

    function toggleSidebarElementClass(elements, className, enabled) {
        if (!Array.isArray(elements)) return;
        elements.forEach(function (element) {
            if (!element || !element.classList) return;
            element.classList.toggle(className, !!enabled);
        });
    }

    function fullSyncSidebarViewState(sb, state) {
        var currentState = state || snapshotSidebarViewState();

        sb.querySelectorAll('.ws-unidex').forEach(function (element) {
            element.classList.toggle('active', currentState.inUnidexView);
        });

        sb.querySelectorAll('.ws-item[data-ws-id]').forEach(function (element) {
            var workspaceId = String(element.dataset?.wsId || '').trim();
            var isActive = !currentState.inUnidexView
                && !currentState.overviewGroupId
                && workspaceId
                && workspaceId === currentState.activeWorkspaceId;
            element.classList.toggle('active', isActive);
        });

        sb.querySelectorAll('.ws-group-section[data-group-id]').forEach(function (element) {
            var groupId = String(element.dataset?.groupId || '').trim();
            element.classList.toggle('ws-group-section--overview', !!groupId && groupId === currentState.overviewGroupId);
        });
    }

    function syncSidebarViewState() {
        var sb = document.getElementById('sidebar');
        if (!sb) return false;
        var nextState = snapshotSidebarViewState();
        var prevState = rt._sidebarLastViewState || null;
        var registry = rt._sidebarElementRegistry || null;

        if (!registry
            || !(registry.workspaceItems instanceof Map)
            || !(registry.groupSections instanceof Map)
            || !Array.isArray(registry.unidexButtons)) {
            fullSyncSidebarViewState(sb, nextState);
            rt._sidebarLastViewState = nextState;
            return true;
        }

        if (!prevState) {
            fullSyncSidebarViewState(sb, nextState);
            rt._sidebarLastViewState = nextState;
            return true;
        }

        if (prevState.inUnidexView !== nextState.inUnidexView) {
            toggleSidebarElementClass(registry.unidexButtons, 'active', nextState.inUnidexView);
        }

        var prevActiveWorkspaceId = (!prevState.inUnidexView && !prevState.overviewGroupId)
            ? prevState.activeWorkspaceId
            : '';
        var nextActiveWorkspaceId = (!nextState.inUnidexView && !nextState.overviewGroupId)
            ? nextState.activeWorkspaceId
            : '';

        if (prevActiveWorkspaceId !== nextActiveWorkspaceId) {
            if (prevActiveWorkspaceId) {
                toggleSidebarElementClass(registry.workspaceItems.get(prevActiveWorkspaceId), 'active', false);
            }
            if (nextActiveWorkspaceId) {
                toggleSidebarElementClass(registry.workspaceItems.get(nextActiveWorkspaceId), 'active', true);
            }
        } else if (nextActiveWorkspaceId && (
            prevState.inUnidexView !== nextState.inUnidexView
            || prevState.overviewGroupId !== nextState.overviewGroupId
        )) {
            toggleSidebarElementClass(registry.workspaceItems.get(nextActiveWorkspaceId), 'active', true);
        }

        var prevOverviewGroupId = prevState.overviewGroupId;
        var nextOverviewGroupId = nextState.overviewGroupId;
        if (prevOverviewGroupId !== nextOverviewGroupId) {
            if (prevOverviewGroupId) {
                toggleSidebarElementClass(registry.groupSections.get(prevOverviewGroupId), 'ws-group-section--overview', false);
            }
            if (nextOverviewGroupId) {
                toggleSidebarElementClass(registry.groupSections.get(nextOverviewGroupId), 'ws-group-section--overview', true);
            }
        }

        rt._sidebarLastViewState = nextState;

        return true;
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function queueStructureSummaryWarmup(reason, rerender) {
        var indexApi = getDatapackIndexApi();
        if (!indexApi || (typeof indexApi.ensureFresh !== 'function' && typeof indexApi.rebuild !== 'function')) return;
        if (rt._structureSummaryWarmPromise) return;
        var warmReason = String(reason || 'sidebar-structure-summary');
        var warmPromise = typeof indexApi.ensureFresh === 'function'
            ? indexApi.ensureFresh({ reason: warmReason })
            : indexApi.rebuild({ reason: warmReason });

        rt._structureSummaryWarmPromise = Promise.resolve(warmPromise)
            .catch(function () {
                // Ignore warmup failures and continue rendering without summaries.
            })
            .finally(function () {
                rt._structureSummaryWarmPromise = null;
            });
    }

    function queueSidebarDashboardRefresh(options) {
        var opts = options && typeof options === 'object' ? options : {};
        if (rt._sidebarDashboardRefreshRaf) {
            window.cancelAnimationFrame(rt._sidebarDashboardRefreshRaf);
            rt._sidebarDashboardRefreshRaf = 0;
        }
        if (rt._sidebarDashboardRefreshTimer) {
            clearTimeout(rt._sidebarDashboardRefreshTimer);
            rt._sidebarDashboardRefreshTimer = 0;
        }

        var delayMs = Math.max(0, Number(opts.delayMs || 0) || 24);
        rt._sidebarDashboardRefreshTimer = window.setTimeout(function () {
            rt._sidebarDashboardRefreshTimer = 0;
            rt._sidebarDashboardRefreshRaf = window.requestAnimationFrame(function () {
                rt._sidebarDashboardRefreshRaf = 0;
                if (typeof window.invalidateDashboardDeferredWork === 'function') {
                    window.invalidateDashboardDeferredWork({ cleanupMasonry: true });
                }
                if (typeof renderDashboard === 'function') renderDashboard();
            });
        }, delayMs);
    }

    function createRenderContext(sb, options) {
        var helpers = window.EveWorkspaceHelpers;
        var groupsApi = window.EveSidebarGroups || null;
        var opts = options && typeof options === 'object' ? options : {};
        var dragState = { type: '', id: '', hoverWorkspaceId: '', didApply: false };
        var ctx = {
            sb: sb,
            helpers: helpers,
            groupsApi: groupsApi,
            hoverRevealOverride: typeof opts.hoverRevealOverride === 'boolean'
                ? opts.hoverRevealOverride
                : null
        };

        if (groupsApi && typeof groupsApi.ensureConfigDefaults === 'function') {
            groupsApi.ensureConfigDefaults(config);
        }

        if (!Array.isArray(config.collapsedTabs)) {
            config.collapsedTabs = Array.isArray(config.collapsed) ? config.collapsed.slice() : [];
        }
        var collapsedTabIds = new Set((Array.isArray(config.collapsedTabs) ? config.collapsedTabs : []).map(function (id) {
            return String(id || '').trim();
        }).filter(Boolean));
        var structureSummaryResolved = false;
        var structureSummaryCache = null;
        var structureSummaryUnavailable = false;

        ctx.saveAndRefresh = function (shouldRenderDashboard) {
            saveConfig({
                immediate: true,
                source: 'sidebar-tab-reorder',
                meta: {
                    dragType: dragState.type || '',
                    dragId: dragState.id || ''
                }
            });
            if (typeof window.renderSidebar === 'function') window.renderSidebar();
            if (shouldRenderDashboard) {
                queueSidebarDashboardRefresh({
                    delayMs: dragState.type ? 40 : 16
                });
            }
        };

        ctx.getStructureSummary = function () {
            if (structureSummaryResolved) return structureSummaryCache;
            if (structureSummaryUnavailable) return null;

            var indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getStructureSummary !== 'function') {
                structureSummaryUnavailable = true;
                return null;
            }
            var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
            var hasUsableSnapshot = typeof indexApi.hasReadableStructureSnapshot === 'function'
                ? indexApi.hasReadableStructureSnapshot()
                : (typeof indexApi.hasUsableSnapshot === 'function'
                    ? indexApi.hasUsableSnapshot()
                    : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0));
            if (!hasUsableSnapshot) {
                queueStructureSummaryWarmup('sidebar-structure-summary', window.renderSidebar);
                structureSummaryUnavailable = true;
                return null;
            }
            var summary = indexApi.getStructureSummary();
            if (summary && Number(summary.builtAt || 0) > 0) {
                structureSummaryCache = summary;
                structureSummaryResolved = true;
                return summary;
            }
            queueStructureSummaryWarmup('sidebar-structure-summary', window.renderSidebar);
            structureSummaryUnavailable = true;
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

        ctx.markRecentWorkspaceDragGesture = function (durationMs) {
            var lifetimeMs = Math.max(120, Number(durationMs || 0) || 220);
            rt._sidebarWorkspaceClickSuppressUntil = Date.now() + lifetimeMs;
            rt._sidebarDragJustEnded = true;
            
            if (rt._sidebarDragClearTimer) {
                clearTimeout(rt._sidebarDragClearTimer);
                rt._sidebarDragClearTimer = 0;
            }
            window.requestAnimationFrame(function () {
                rt._sidebarDragClearTimer = window.setTimeout(function () {
                    rt._sidebarDragJustEnded = false;
                    rt._sidebarDragClearTimer = 0;
                }, lifetimeMs);
            });
        };

        ctx.shouldSuppressWorkspaceClick = function () {
            if (rt._isDraggingWorkspace || rt._sidebarDragJustEnded) return true;
            return Number(rt._sidebarWorkspaceClickSuppressUntil || 0) > Date.now();
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
            var targetElement = ctx.resolveEventTargetElement(event);
            if (!(targetElement instanceof Element)) return '';
            if (!targetElement.closest('.ws-drop-target')) return '';
            return ctx.resolveWorkspaceDropTargetId(targetElement, dragId);
        };

        ctx.isWorkspaceCollapsed = function (workspaceId) {
            var targetId = String(workspaceId || '').trim();
            return !!targetId && collapsedTabIds.has(targetId);
        };

        ctx.setWorkspaceCollapsed = function (workspaceId, nextValue) {
            var targetId = String(workspaceId || '').trim();
            if (!targetId) return false;

            var shouldCollapse = typeof nextValue === 'boolean'
                ? nextValue
                : !collapsedTabIds.has(targetId);

            if (shouldCollapse) collapsedTabIds.add(targetId);
            else collapsedTabIds.delete(targetId);

            config.collapsedTabs = Array.from(collapsedTabIds);
            return shouldCollapse;
        };

        ctx.getSidebarDensityFlags = function () {
            if (rt && typeof rt.getSidebarDensityFlags === 'function') {
                return rt.getSidebarDensityFlags();
            }
            return rt && rt._sidebarDensityFlags
                ? rt._sidebarDensityFlags
                : { nodeCount: 0, isHeavy: false, suppressBadges: false };
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
            if (ctx.hoverRevealOverride !== null) return ctx.hoverRevealOverride;
            return !!config.showInactiveTabs || isHoverRevealActive();
        };

        ctx.shouldShowHiddenGroups = function () {
            if (ctx.hoverRevealOverride !== null) return ctx.hoverRevealOverride;
            return !!config.showHiddenSidebarGroups || isHoverRevealActive();
        };

        ctx.shouldShowDatapackBadges = function () {
            var densityFlags = ctx.getSidebarDensityFlags();
            return config.showSidebarDatapackBadges !== false
                && !!config.sidebarExpanded
                && !densityFlags.suppressBadges;
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
    rt.resetSidebarElementRegistry = resetSidebarElementRegistry;
    rt.registerWorkspaceItemElement = registerWorkspaceItemElement;
    rt.registerGroupSectionElement = registerGroupSectionElement;
    rt.registerUnidexButtonElement = registerUnidexButtonElement;
    rt.captureSidebarViewState = captureSidebarViewState;
    rt.syncSidebarViewState = syncSidebarViewState;
    rt.createRenderContext = createRenderContext;
    rt.sharedReady = true;
})();
