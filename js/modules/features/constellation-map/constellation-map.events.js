window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

    const render = ns._render || {};

    const physics = ns._physics || {};

    const view = ns._view || {};

    const {

        state,

        DOUBLE_CLICK_MS,

        text,

        escapeHtml,

        getViewportSize,

        isNodeStatic,

        setStaticAnchor,

        createManualAnchor,

        clearInspectorCoverRotation,

        ensureCoverPreviewSession,

        scheduleInspectorCoverRotation

    } = shared;

    const {

        requestDraw,

        renderInspector,

        updateInspectorCoverState,

        updateCursor,

        getScreenPoint

    } = render;

    const { setWebMotionAnchor, getReleaseVelocityScale } = physics;

    const {

        isNodeMain,

        shouldPersistManualAnchor,

        shouldPreferSelectedNodeForDrag,

        fitToGraph,

        setTransform,

        centerOnNode,

        worldPointFromClient,

        canvasPointFromClient,

        zoomAt,

        getHitNode

    } = view;



    function setSelectedNode(node) {

        state.selected = node || null;

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

        const matches = state.nodes.filter((node) => {

            return node.label.toLowerCase().includes(query)

                || text(node.meta, '').toLowerCase().includes(query)

                || text(node.data?.url, '').toLowerCase().includes(query);

        });

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



    function bindEvents() {

        if (state.bound || !state.canvas || !state.container) return;



        state.canvas.addEventListener('wheel', (event) => {

            event.preventDefault();

            const factor = event.deltaY < 0 ? 1.12 : 0.9;

            zoomAt(factor, event.clientX, event.clientY);

        }, { passive: false });



        state.canvas.addEventListener('pointerdown', (event) => {

            if (state.infoHovered) {

                state.infoHovered = false;

                state.infoHoverStartedAt = 0;

                clearInspectorCoverRotation();

                updateInspectorCoverState();

            }

            const canvasPoint = canvasPointFromClient(event.clientX, event.clientY);

            let hitNode = null;

            const shouldPreferSelectedRewireNode = !state.pointer.forcePan
                && state.rewire?.enabled
                && state.selected
                && typeof ns._canConstellationRewireNode === 'function'
                && ns._canConstellationRewireNode(state.selected);

            if (
                !state.pointer.forcePan
                && state.selected
                && (
                    (state.selected.kind !== 'link' && shouldPreferSelectedNodeForDrag(state.selected))
                    || shouldPreferSelectedRewireNode
                )
            ) {

                const selectedPoint = getScreenPoint(state.selected);

                const dx = canvasPoint.x - selectedPoint.x;

                const dy = canvasPoint.y - selectedPoint.y;

                const keepRadius = Math.max((state.selected.radius * state.transform.scale) + 24, 34);

                if (((dx * dx) + (dy * dy)) <= (keepRadius * keepRadius)) {

                    hitNode = state.selected;

                }

            }

            if (!hitNode && !state.pointer.forcePan) {

                hitNode = getHitNode(event.clientX, event.clientY);

            }

            const armedRewireSource = text(state.rewire?.sourceNodeId, '')
                ? state.nodes.find((node) => node.id === state.rewire.sourceNodeId) || null
                : null;
            const isRewireTargetClick = !!(
                armedRewireSource
                && hitNode
                && armedRewireSource.id !== hitNode.id
                && state.rewire?.enabled
                && state.rewire.validTargetIds instanceof Set
                && state.rewire.validTargetIds.has(String(hitNode.id || ''))
            );

            let pointerMode = hitNode ? 'node' : 'pan';
            if (
                hitNode
                && state.rewire?.enabled
                && typeof ns._canConstellationRewireNode === 'function'
                && ns._canConstellationRewireNode(hitNode)
            ) {
                pointerMode = 'rewire';
            } else if (isRewireTargetClick) {
                pointerMode = 'rewire';
            }
            state.pointer.mode = pointerMode;

            state.pointer.node = isRewireTargetClick ? armedRewireSource : hitNode;

            state.pointer.startX = event.clientX;

            state.pointer.startY = event.clientY;

            state.pointer.baseTx = state.transform.tx;

            state.pointer.baseTy = state.transform.ty;

            state.pointer.moved = false;

            state.pointer.canvasX = canvasPoint.x;

            state.pointer.canvasY = canvasPoint.y;

            state.pointer.lastWorldX = 0;

            state.pointer.lastWorldY = 0;

            state.pointer.releaseVx = 0;

            state.pointer.releaseVy = 0;

            if (state.pointer.node) {

                setSelectedNode(state.pointer.node);

                state.pointer.lastWorldX = Number(state.pointer.node.x) || 0;

                state.pointer.lastWorldY = Number(state.pointer.node.y) || 0;

                state.canvas.setPointerCapture?.(event.pointerId);
                if (isRewireTargetClick) {
                    state.rewire.targetNodeId = String(hitNode.id || '');
                } else if (pointerMode === 'rewire' && typeof ns._beginConstellationRewireDrag === 'function') {
                    ns._beginConstellationRewireDrag(hitNode, worldPointFromClient(event.clientX, event.clientY));
                }

            }

            updateCursor();

        });



        state.canvas.addEventListener('pointermove', (event) => {

            const canvasPoint = canvasPointFromClient(event.clientX, event.clientY);

            state.pointer.canvasX = canvasPoint.x;

            state.pointer.canvasY = canvasPoint.y;

            if (state.pointer.mode === 'pan') {

                const dx = event.clientX - state.pointer.startX;

                const dy = event.clientY - state.pointer.startY;

                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.pointer.moved = true;

                setTransform(state.transform.scale, state.pointer.baseTx + dx, state.pointer.baseTy + dy);

                return;

            }

            if (state.pointer.mode === 'rewire' && state.pointer.node) {
                const point = worldPointFromClient(event.clientX, event.clientY);

                if (Math.abs(event.clientX - state.pointer.startX) > 2 || Math.abs(event.clientY - state.pointer.startY) > 2) state.pointer.moved = true;

                if (typeof ns._updateConstellationRewireDrag === 'function') {
                    ns._updateConstellationRewireDrag(event.clientX, event.clientY, point);
                }

                return;

            }

            if (state.pointer.mode === 'node' && state.pointer.node) {

                const point = worldPointFromClient(event.clientX, event.clientY);

                if (Math.abs(event.clientX - state.pointer.startX) > 2 || Math.abs(event.clientY - state.pointer.startY) > 2) state.pointer.moved = true;

                state.pointer.node.x = point.x;

                state.pointer.node.y = point.y;

                state.pointer.node.vx = 0;

                state.pointer.node.vy = 0;

                state.pointer.releaseVx = point.x - (Number(state.pointer.lastWorldX) || point.x);

                state.pointer.releaseVy = point.y - (Number(state.pointer.lastWorldY) || point.y);

                state.pointer.lastWorldX = point.x;

                state.pointer.lastWorldY = point.y;

                if (state.motionMode === 'web' && isNodeMain(state.pointer.node)) {

                    setWebMotionAnchor(state.pointer.node, point);

                }

                if (isNodeStatic(state.pointer.node)) {

                    setStaticAnchor(state.pointer.node, point);

                }

                requestDraw();

                return;

            }

            setHoveredNode(getHitNode(event.clientX, event.clientY));

        });



        function clearPointer(event) {

            if (state.pointer.mode === 'idle') return;

            const hitNode = getHitNode(event.clientX, event.clientY);

            const previousNode = state.pointer.node;

            const moved = state.pointer.moved;
            const previousMode = state.pointer.mode;

            state.pointer.mode = 'idle';

            state.pointer.node = null;

            updateCursor();



            if (previousNode && previousMode === 'rewire') {
                const hasTargetSelection = !!text(state.rewire?.targetNodeId, '');
                if (!moved && hasTargetSelection && typeof ns._finishConstellationRewireDrag === 'function') {
                    ns._finishConstellationRewireDrag(event.clientX, event.clientY);
                    return;
                }
                if (!moved) {
                    if (typeof ns._armConstellationRewireNode === 'function') {
                        ns._armConstellationRewireNode(previousNode, { keepEnabled: true });
                    }
                    return;
                }
                if (typeof ns._finishConstellationRewireDrag === 'function') {
                    ns._finishConstellationRewireDrag(event.clientX, event.clientY);
                }
                return;
            }

            if (previousNode && moved && previousNode.kind !== 'link') {

                if (isNodeStatic(previousNode)) {

                    setStaticAnchor(previousNode);

                } else if (shouldPersistManualAnchor(previousNode)) {

                    previousNode.manualAnchor = createManualAnchor(previousNode);

                } else {

                    previousNode.manualAnchor = null;

                    const releaseScale = getReleaseVelocityScale(previousNode);

                    previousNode.vx = (Number(state.pointer.releaseVx) || 0) * releaseScale;

                    previousNode.vy = (Number(state.pointer.releaseVy) || 0) * releaseScale;

                    // Late-bind applyPassiveReleaseImpulse from the orchestrator
                    if (typeof ns._applyPassiveReleaseImpulse === 'function') {
                        ns._applyPassiveReleaseImpulse(previousNode);
                    }

                }

                if (isNodeStatic(previousNode) || shouldPersistManualAnchor(previousNode)) {

                    previousNode.vx = 0;

                    previousNode.vy = 0;

                }

            }



            if (previousNode && !moved) {

                const clickNode = hitNode && hitNode.id === previousNode.id

                    ? hitNode

                    : previousNode;

                const now = Date.now();

                if (state.lastClickNodeId === clickNode.id && now - state.lastClickAt < DOUBLE_CLICK_MS) {

                    // Late-bind activateNode from the orchestrator
                    if (typeof ns._activateNode === 'function') {
                        ns._activateNode(clickNode);
                    }

                    state.lastClickAt = 0;

                    state.lastClickNodeId = '';

                } else {

                    setSelectedNode(clickNode);

                    state.lastClickAt = now;

                    state.lastClickNodeId = clickNode.id;

                }

            }

        }



        state.canvas.addEventListener('pointerup', clearPointer);

        state.canvas.addEventListener('pointerleave', (event) => {

            state.pointer.canvasX = 0;

            state.pointer.canvasY = 0;

            if (state.pointer.mode !== 'idle') {

                clearPointer(event);

                return;

            }

            setHoveredNode(null);

        });



        state.infoEl.addEventListener('click', (event) => {

            const toggleEl = event.target.closest('[data-map-info-toggle]');

            if (toggleEl) {

                state.infoCollapsed = !state.infoCollapsed;

                renderInspector();

                return;

            }

            const actionEl = event.target.closest('[data-map-action]');

            const action = actionEl?.dataset?.mapAction;

            if (!action || !state.selected) return;

            // Late-bind runNodeAction from the orchestrator
            if (typeof ns._runNodeAction === 'function') {
                ns._runNodeAction(state.selected, action);
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



        state.resizeHandler = function () {

            if (!state.canvas) return;

            const { width, height } = getViewportSize();

            state.canvas.width = width;

            state.canvas.height = height;

            fitToGraph();

        };

        window.addEventListener('resize', state.resizeHandler);



        state.keyHandler = function (event) {

            if (!state.container || state.container.style.display === 'none') return;

            if (event.key === 'Escape') {

                event.preventDefault();

                ns.closeMap();

            } else if (event.key === ' ' || event.code === 'Space') {

                state.pointer.forcePan = true;

            } else if (event.key === '+' || event.key === '=') {

                event.preventDefault();

                zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);

            } else if (event.key === '-') {

                event.preventDefault();

                zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);

            }

        };

        window.addEventListener('keydown', state.keyHandler);

        window.addEventListener('keyup', (event) => {

            if (event.key === ' ' || event.code === 'Space') {

                state.pointer.forcePan = false;

            }

        });



        state.bound = true;

    }



    ns._events = {
        bindEvents,
        runFind,
        setSelectedNode,
        setHoveredNode
    };

})(window.EveConstellationMap);
