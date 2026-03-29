window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const render = ns._render || {};
    const eventState = ns._eventState || {};

    const {
        state,
        text,
        clearInspectorCoverRotation,
        ensureCoverPreviewSession,
        scheduleInspectorCoverRotation
    } = shared;
    const { renderInspector, updateInspectorCoverState } = render;
    const { runFind } = eventState;

    function bindInspectorEvents() {
        state.infoEl.addEventListener('click', (event) => {
            const toggleEl = event.target.closest('[data-map-info-toggle]');
            if (toggleEl) {
                state.infoCollapsed = !state.infoCollapsed;
                renderInspector();
                return;
            }

            const actionEl = event.target.closest('[data-map-action]');
            const action = actionEl?.dataset?.mapAction;
            const actionNode = state.selected || state.hovered;
            if (!action || !actionNode) return;
            if (typeof ns._runNodeAction === 'function') {
                ns._runNodeAction(actionNode, action);
            }
        });

        state.infoEl.addEventListener('mouseenter', () => {
            state.infoHovered = true;
            state.infoHoverStartedAt = Date.now();
            const sessionCovers = ensureCoverPreviewSession(state.selected || state.hovered, { reset: !state.coverPreviewSession });
            if (state.coverPreviewSession && sessionCovers.length) {
                state.coverPreviewSession.startedAt = Date.now();
            }
            renderInspector();
            updateInspectorCoverState();
            scheduleInspectorCoverRotation();
        });

        state.infoEl.addEventListener('mouseleave', () => {
            if (state.coverPreviewSession?.startedAt) {
                state.coverPreviewSession.elapsedMs = Math.max(
                    0,
                    Number(state.coverPreviewSession.elapsedMs || 0) + (Date.now() - state.coverPreviewSession.startedAt)
                );
                state.coverPreviewSession.startedAt = 0;
            }
            state.infoHovered = false;
            state.infoHoverStartedAt = 0;
            clearInspectorCoverRotation();
            renderInspector();
            updateInspectorCoverState();
        });

        state.findInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runFind();
            }
        });
    }

    ns._eventInspector = Object.assign(ns._eventInspector || {}, {
        bindInspectorEvents
    });
})(window.EveConstellationMap);
