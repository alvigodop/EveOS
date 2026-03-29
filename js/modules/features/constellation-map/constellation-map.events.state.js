window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const render = ns._render || {};
    const view = ns._view || {};

    const { state, text, escapeHtml } = shared;
    const { requestDraw, renderInspector } = render;
    const { centerOnNode } = view;

    function setSelectedNode(node) {
        state.selected = node || null;
        state.selectionIds = node ? new Set([text(node.id, '')].filter(Boolean)) : new Set();
        state.infoHovered = false;
        state.infoHoverStartedAt = 0;
        if (state.coverPreviewSession) {
            state.coverPreviewSession.startedAt = 0;
        }

        renderInspector();
        requestDraw();
    }

    function setHoveredNode(node) {
        if ((state.hovered?.id || '') === (node?.id || '')) return;
        state.hovered = node || null;
        requestDraw();
        if (!state.selected) renderInspector();
    }

    function runFind() {
        const query = text(state.findInput?.value, '').toLowerCase();
        state.searchState.query = query;

        if (!query) {
            state.searchState.matches = [];
            state.searchState.index = -1;
            if (!state.selected) renderInspector();
            return;
        }

        const matches = state.nodes.filter((node) => (
            node.label.toLowerCase().includes(query)
            || text(node.meta, '').toLowerCase().includes(query)
            || text(node.data?.url, '').toLowerCase().includes(query)
        ));

        state.searchState.matches = matches;
        if (!matches.length) {
            state.searchState.index = -1;
            state.infoEl.innerHTML = '<div style="font-size:0.9rem;font-weight:700;">No matches</div><div style="font-size:0.8rem;opacity:0.78;margin-top:6px;">Nothing in this map matched "' + escapeHtml(query) + '".</div>';
            return;
        }

        state.searchState.index = (state.searchState.index + 1) % matches.length;
        const node = matches[state.searchState.index];
        setSelectedNode(node);
        centerOnNode(node, Math.max(state.transform.scale, 1.28));
    }

    ns._eventState = Object.assign(ns._eventState || {}, {
        setSelectedNode,
        setHoveredNode,
        runFind
    });
})(window.EveConstellationMap);
