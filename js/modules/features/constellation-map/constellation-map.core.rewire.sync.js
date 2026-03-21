window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const rewire = ns._coreRewire = ns._coreRewire || {};
    const {
        state,
        buildGraphData,
        syncMotionAnchors,
        renderHeader,
        renderInspector,
        renderToolbarState,
        requestDraw
    } = rewire;

    function flushDashboardSync() {
        if (rewire.dashboardSyncTimer) {
            clearTimeout(rewire.dashboardSyncTimer);
            rewire.dashboardSyncTimer = 0;
        }
        if (rewire.dashboardSyncIdleHandle && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(rewire.dashboardSyncIdleHandle);
            rewire.dashboardSyncIdleHandle = 0;
        }
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
    }

    function scheduleDashboardSync() {
        if (rewire.dashboardSyncTimer) {
            clearTimeout(rewire.dashboardSyncTimer);
            rewire.dashboardSyncTimer = 0;
        }
        if (rewire.dashboardSyncIdleHandle && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(rewire.dashboardSyncIdleHandle);
            rewire.dashboardSyncIdleHandle = 0;
        }
        if (typeof window.requestIdleCallback === 'function') {
            rewire.dashboardSyncIdleHandle = window.requestIdleCallback(() => {
                rewire.dashboardSyncIdleHandle = 0;
                flushDashboardSync();
            }, { timeout: 120 });
            return;
        }
        rewire.dashboardSyncTimer = window.setTimeout(() => {
            rewire.dashboardSyncTimer = 0;
            flushDashboardSync();
        }, 48);
    }

    function refreshGraphAfterMove(selectionId, options = {}) {
        if (!state.scope) return;
        const previousInfoCollapsed = !!state.infoCollapsed;
        const previousSelectionIds = new Set(state.selectionIds instanceof Set ? state.selectionIds : []);
        const previousNodePositions = new Map(
            state.nodes.map((node) => [String(node.id || ''), {
                x: Number(node.x) || 0,
                y: Number(node.y) || 0,
                vx: Number(node.vx) || 0,
                vy: Number(node.vy) || 0,
                manualAnchor: node?.manualAnchor && typeof node.manualAnchor === 'object'
                    ? {
                        x: Number(node.manualAnchor.x) || 0,
                        y: Number(node.manualAnchor.y) || 0,
                        driftRadius: Number(node.manualAnchor.driftRadius) || 0,
                        pullStrength: Number(node.manualAnchor.pullStrength) || 0,
                        damping: Number(node.manualAnchor.damping) || 0,
                        speed: Number(node.manualAnchor.speed) || 0,
                        phase: Number(node.manualAnchor.phase) || 0
                    }
                    : null,
                staticAnchor: node?.staticAnchor && typeof node.staticAnchor === 'object'
                    ? {
                        x: Number(node.staticAnchor.x) || 0,
                        y: Number(node.staticAnchor.y) || 0
                    }
                    : null
            }])
        );
        buildGraphData(state.scope, { preserveLocks: true });
        state.infoCollapsed = previousInfoCollapsed;
        state.selectionIds = new Set(
            Array.from(previousSelectionIds).filter((nodeId) => state.nodes.some((node) => node.id === nodeId))
        );
        state.nodes.forEach((node) => {
            const prior = previousNodePositions.get(String(node.id || ''));
            if (!prior) return;
            if (selectionId && String(node.id || '') === String(selectionId || '')) return;
            node.x = prior.x;
            node.y = prior.y;
            node.vx = prior.vx;
            node.vy = prior.vy;
            node.manualAnchor = prior.manualAnchor
                ? {
                    x: prior.manualAnchor.x,
                    y: prior.manualAnchor.y,
                    driftRadius: prior.manualAnchor.driftRadius,
                    pullStrength: prior.manualAnchor.pullStrength,
                    damping: prior.manualAnchor.damping,
                    speed: prior.manualAnchor.speed,
                    phase: prior.manualAnchor.phase
                }
                : null;
            node.staticAnchor = prior.staticAnchor
                ? {
                    x: prior.staticAnchor.x,
                    y: prior.staticAnchor.y
                }
                : null;
        });
        syncMotionAnchors(true);
        renderHeader();
        if (selectionId) {
            state.selected = state.nodes.find((node) => node.id === selectionId) || null;
            if (state.selected && options.snapToTargetNodeId) {
                const targetNode = state.nodes.find((node) => node.id === options.snapToTargetNodeId) || null;
                if (targetNode) {
                    state.selected.x = targetNode.x + Math.max(targetNode.radius + 24, 42);
                    state.selected.y = targetNode.y + 6;
                    state.selected.vx = 0;
                    state.selected.vy = 0;
                }
            }
        }
        renderInspector();
        renderToolbarState();
        requestDraw();
        scheduleDashboardSync();
    }

    function resetTransientRewireState() {
        if (!state.rewire) return;
        state.rewire.dragging = false;
        state.rewire.sourceNodeId = '';
        state.rewire.sourceNodeIds = [];
        state.rewire.targetNodeId = '';
        state.rewire.validTargetIds = new Set();
        state.rewire.previewWorldX = 0;
        state.rewire.previewWorldY = 0;
        state.rewire.sourceStartX = 0;
        state.rewire.sourceStartY = 0;
        state.rewire.canDetachToRoot = false;
        state.rewire.hint = '';
    }

    function showRewireToast(message, level) {
        if (!message) return;
        if (typeof window.showToast === 'function') {
            window.showToast(message, level || 'success');
        }
    }

    function getGroupedSourceNodes(node) {
        const selectionIds = state.selectionIds instanceof Set ? state.selectionIds : new Set();
        if (!node || !selectionIds.has(String(node.id || ''))) {
            return [node].filter(Boolean);
        }
        const selectedNodes = Array.from(selectionIds)
            .map((nodeId) => state.nodes.find((entry) => entry.id === nodeId) || null)
            .filter(Boolean);
        const liveLinkNodes = selectedNodes.filter((entry) => entry.kind === 'link' && !entry.data?.detached);
        if (liveLinkNodes.length >= 2 && liveLinkNodes.some((entry) => entry.id === node.id)) {
            return liveLinkNodes;
        }
        return [node];
    }

    Object.assign(rewire, {
        flushDashboardSync,
        scheduleDashboardSync,
        refreshGraphAfterMove,
        resetTransientRewireState,
        showRewireToast,
        getGroupedSourceNodes
    });
})(window.EveConstellationMap);
