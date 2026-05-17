// --- SIDEBAR UI ---

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime = window.EveSidebarRuntime || {};
    if (rt.ready) return;
    if (!rt.sharedReady || !rt.interactionsReady || !rt.groupsReady || !rt.workspaceReady || !rt.popoutReady || !rt.scaffoldReady) {
        console.warn('EveSidebar: runtime modules missing');
        return;
    }

    var SIDEBAR_HEAVY_NODE_THRESHOLD = 80;
    var SIDEBAR_BADGE_DISABLE_NODE_THRESHOLD = 140;

function estimateWorkspaceTreeNodeCount() {
        var helpers = window.EveWorkspaceHelpers;
        if (helpers && typeof helpers.flattenIds === 'function') {
            return helpers.flattenIds((config && config.workspaces) || []).length;
        }

        var count = 0;
        (function walk(nodes) {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(function (workspace) {
                if (!workspace) return;
                count += 1;
                if (Array.isArray(workspace.subTabs) && workspace.subTabs.length > 0) {
                    walk(workspace.subTabs);
                }
            });
        })((config && config.workspaces) || []);

        return count;
    }

    function estimateSidebarNodeCount() {
        var workspaceCount = estimateWorkspaceTreeNodeCount();
        var groupCount = Array.isArray(config?.sidebarGroups) ? config.sidebarGroups.length : 0;
        return workspaceCount + groupCount;
    }

    function getSidebarDensityFlags() {
        var nodeCount = estimateSidebarNodeCount();
        return {
            nodeCount: nodeCount,
            isHeavy: nodeCount >= SIDEBAR_HEAVY_NODE_THRESHOLD,
            suppressBadges: nodeCount >= SIDEBAR_BADGE_DISABLE_NODE_THRESHOLD
        };
    }

    function isSidebarExpanded() {
        return !!config.sidebarExpanded;
    }

    function setSidebarExpanded(nextValue, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var nextExpanded = !!nextValue;
        if (!!config.sidebarExpanded === nextExpanded && !opts.forceSync) return nextExpanded;
        config.sidebarExpanded = nextExpanded;
        if (opts.persist !== false && typeof saveConfig === 'function') {
            saveConfig({ immediate: true });
        }
        var sb = document.getElementById('sidebar');
        if (sb) syncSidebarShellState(sb);
        return nextExpanded;
    }

    function bindSidebarToggleBehavior(sb) {
        if (!sb || sb.__eveSidebarToggleBound) return;
        sb.__eveSidebarToggleBound = true;
        sb.addEventListener('dblclick', function (event) {
            if (config.sidebarHidden) return;
            var target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            if (target.closest('.ws-hover-reveal')) return;

            var interactiveTarget = target.closest('.ws-item, .ws-group-header, .ws-toggle, .ws-order-slot');
            if (interactiveTarget) return;

            setSidebarExpanded(!isSidebarExpanded());
        });
    }

    function syncSidebarShellState(sb) {
        if (!sb) return;
        if (typeof config.sidebarExpanded !== 'boolean') config.sidebarExpanded = false;
        var densityFlags = getSidebarDensityFlags();
        rt._sidebarDensityFlags = densityFlags;
        sb.classList.toggle('is-expanded', !!config.sidebarExpanded);
        sb.classList.toggle('ultra-collapsed', !!config.ultraCollapseSidebar);
        sb.classList.toggle('hidden-completely', !!config.sidebarHidden);
        sb.classList.toggle('ws-hover-reveal-active', !!(rt.isHoverRevealActive && rt.isHoverRevealActive()));
        sb.classList.toggle('ws-sort-mode-active', !!(rt.isSidebarSortModeActive && rt.isSidebarSortModeActive()));
        sb.classList.toggle('ws-heavy', densityFlags.isHeavy);
        sb.setAttribute('aria-expanded', config.sidebarExpanded ? 'true' : 'false');
        sb.setAttribute(
            'data-sidebar-sort-mode',
            (rt.isSidebarSortModeActive && rt.isSidebarSortModeActive()) ? 'active' : 'inactive'
        );
    }

    window.toggleSidebarVisibility = function () {
        if (typeof config.sidebarExpanded !== 'boolean') config.sidebarExpanded = false;
        if (typeof config.sidebarHidden !== 'boolean') config.sidebarHidden = false;
        if (typeof config.sidebarToggleDirection !== 'number') config.sidebarToggleDirection = -1;

        var sb = document.getElementById('sidebar');
        var wasHidden = !!(sb && sb.classList.contains('hidden-completely'));

        if (config.sidebarExpanded && !config.sidebarHidden) {
            // Expanded -> Collapsed
            config.sidebarExpanded = false;
            config.sidebarHidden = false;
            config.sidebarToggleDirection = -1;
        } else if (!config.sidebarExpanded && !config.sidebarHidden) {
            // Collapsed -> Hidden or Expanded depending on direction
            if (config.sidebarToggleDirection === -1) {
                config.sidebarHidden = true;
                config.sidebarToggleDirection = 1;
            } else {
                config.sidebarExpanded = true;
                config.sidebarToggleDirection = -1;
            }
        } else {
            // Hidden -> Collapsed
            config.sidebarHidden = false;
            config.sidebarExpanded = false;
            config.sidebarToggleDirection = 1;
        }

        saveConfig();
        
        if (sb) syncSidebarShellState(sb);
        if (config.sidebarHidden) return;
        if (wasHidden && !rt.sidebarDirtyWhileHidden && sb?.querySelector('.ws-sidebar-content')?.childElementCount) {
            if (typeof rt.syncHoverRevealUiState === 'function') rt.syncHoverRevealUiState();
            return;
        }
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
    };

    window.renderSidebar = function () {
        var sb = document.getElementById('sidebar');
        if (!sb) return;

        bindSidebarToggleBehavior(sb);
        var scaffold = rt.ensureSidebarScaffold(sb);
        rt.bindSidebarScrollTracking(scaffold);
        var scrollState = rt.captureSidebarScrollState(scaffold);
        var scrollMemory = rt.getSidebarScrollMemory();
        scrollMemory.restoreToken += 1;
        var restoreToken = scrollMemory.restoreToken;
        rt._sidebarSuppressScrollTracking = true;
        syncSidebarShellState(sb);
        var ctx = rt.createRenderContext(sb);
        rt.syncHoverRevealContentVisibility(scaffold);
        if (config.sidebarHidden) {
            rt.sidebarDirtyWhileHidden = true;
            return;
        }
        rt.sidebarDirtyWhileHidden = false;
        var previewState = rt.getHoverRevealPreviewState();
        previewState.revealRenderVersion += 1;
        previewState.revealPreviewReady = false;
        previewState.revealPreviewVersion = -1;
        scaffold.previewHost.innerHTML = '';
        scaffold.previewHost.hidden = true;
        scaffold.previewHost.setAttribute('aria-hidden', 'true');

        rt.renderSidebarContentHost(sb, scaffold.contentHost, {
            resetRegistry: true,
            syncFocusedGroupState: true
        });
        rt.restoreSidebarScrollState(scaffold, scrollState);
        window.requestAnimationFrame(function () {
            if (rt.getSidebarScrollMemory().restoreToken !== restoreToken) return;
            rt.restoreSidebarScrollState(scaffold, scrollState);
        });
        window.setTimeout(function () {
            var latestScrollMemory = rt.getSidebarScrollMemory();
            if (latestScrollMemory.restoreToken !== restoreToken) return;
            rt.restoreSidebarScrollState(scaffold, scrollState);
            rt._sidebarSuppressScrollTracking = false;
        }, 90);

        sb.ondragover = function (e) {
            var dragId = ctx.getDraggedWorkspaceId();
            if (!dragId) return;
            rt.maybeAutoScrollSidebarDrag(scaffold, e);

            var targetElement = ctx.resolveEventTargetElement(e);
            var targetWorkspaceId = ctx.resolveWorkspaceDropTargetId(targetElement, dragId);
            if (!targetWorkspaceId) return;

            ctx.setHoveredWorkspaceTarget(targetWorkspaceId);
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };

        sb.ondrop = function (e) {
            var dragId = String(ctx.getDraggedWorkspaceId() || e.dataTransfer.getData('text/plain') || '').trim();
            if (!dragId) return;

            var targetElement = ctx.resolveEventTargetElement(e);
            var targetWorkspaceId = ctx.resolveWorkspaceDropTargetId(targetElement, dragId);
            if (!targetWorkspaceId || dragId === targetWorkspaceId) return;

            e.preventDefault();
            e.stopPropagation();
            if (rt.handleSidebarWorkspaceDrop(ctx, dragId, targetWorkspaceId)) {
                ctx.saveAndRefresh(true);
            }
        };

        if (typeof rt.captureSidebarViewState === 'function') rt.captureSidebarViewState();
        if (typeof rt.syncHoverRevealUiState === 'function') rt.syncHoverRevealUiState();
        if (rt.isHoverRevealActive && rt.isHoverRevealActive()) {
            rt.buildHoverRevealPreview(sb, scaffold);
        } else {
            rt.syncHoverRevealContentVisibility(scaffold);
        }
    };

    window.toggleSidebarExpanded = function (nextValue) {
        if (typeof nextValue === 'boolean') return setSidebarExpanded(nextValue);
        return setSidebarExpanded(!isSidebarExpanded());
    };

    rt.getSidebarDensityFlags = getSidebarDensityFlags;
    rt.ready = true;
})();
