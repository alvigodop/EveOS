window.EveSidebarRuntime = window.EveSidebarRuntime || {};

(function () {
    'use strict';

    var rt = window.EveSidebarRuntime;
    if (rt.viewStateReady) return;

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

    rt.syncHoverRevealUiState = syncHoverRevealUiState;
    rt.setHoverRevealActive = setHoverRevealActive;
    rt.isHoverRevealActive = isHoverRevealActive;
    rt.resetSidebarElementRegistry = resetSidebarElementRegistry;
    rt.registerWorkspaceItemElement = registerWorkspaceItemElement;
    rt.registerGroupSectionElement = registerGroupSectionElement;
    rt.registerUnidexButtonElement = registerUnidexButtonElement;
    rt.captureSidebarViewState = captureSidebarViewState;
    rt.syncSidebarViewState = syncSidebarViewState;
    rt.viewStateReady = true;
})();
