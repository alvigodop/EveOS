window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const render = ns._render || {};
    const physics = ns._physics || {};
    const view = ns._view || {};
    const eventState = ns._eventState || {};

    const {
        state,
        DOUBLE_CLICK_MS,
        text,
        isNodeStatic,
        setStaticAnchor,
        createManualAnchor,
        clearInspectorCoverRotation,
        updateInspectorCoverState
    } = Object.assign({}, shared, { updateInspectorCoverState: render.updateInspectorCoverState });

    const { requestDraw, updateCursor, getScreenPoint } = render;
    const { setWebMotionAnchor, getReleaseVelocityScale } = physics;
    const {
        isNodeMain,
        shouldPersistManualAnchor,
        shouldPreferSelectedNodeForDrag,
        setTransform,
        worldPointFromClient,
        canvasPointFromClient,
        zoomAt,
        getHitNode
    } = view;
    const { setSelectedNode, setHoveredNode } = eventState;

    function bindCanvasEvents() {
        state.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.12 : 0.9;
            zoomAt(factor, event.clientX, event.clientY);
        }, { passive: false });

        state.canvas.addEventListener('pointerdown', (event) => {
            if (typeof ns._closeConstellationActionWheel === 'function') {
                ns._closeConstellationActionWheel();
            }
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
                && text(state.rewire?.sourceNodeId, '') === text(state.selected?.id, '')
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
                && armedRewireSource
                && armedRewireSource.id === hitNode.id
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
            state.pointer.dragHistory = [];

            if (state.pointer.node) {
                if (!(event.ctrlKey || event.metaKey)) {
                    setSelectedNode(state.pointer.node);
                }

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

        state.canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const hitNode = getHitNode(event.clientX, event.clientY);
            if (!hitNode) {
                if (typeof ns._closeConstellationActionWheel === 'function') {
                    ns._closeConstellationActionWheel();
                }
                return;
            }
            if (typeof ns._openConstellationActionWheel === 'function') {
                ns._openConstellationActionWheel(hitNode, event.clientX, event.clientY);
            }
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

                const instantVx = point.x - (Number(state.pointer.lastWorldX) || point.x);
                const instantVy = point.y - (Number(state.pointer.lastWorldY) || point.y);
                if (!state.pointer.dragHistory) state.pointer.dragHistory = [];
                state.pointer.dragHistory.push({ vx: instantVx, vy: instantVy });
                if (state.pointer.dragHistory.length > 5) state.pointer.dragHistory.shift();

                let sumVx = 0;
                let sumVy = 0;
                state.pointer.dragHistory.forEach((sample) => {
                    sumVx += sample.vx;
                    sumVy += sample.vy;
                });

                state.pointer.releaseVx = sumVx / state.pointer.dragHistory.length;
                state.pointer.releaseVy = sumVy / state.pointer.dragHistory.length;
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

            const clientX = Number.isFinite(event?.clientX) ? event.clientX : state.pointer.canvasX;
            const clientY = Number.isFinite(event?.clientY) ? event.clientY : state.pointer.canvasY;
            const hitNode = getHitNode(clientX, clientY);
            const previousNode = state.pointer.node;
            const moved = state.pointer.moved;
            const previousMode = state.pointer.mode;

            state.pointer.mode = 'idle';
            state.pointer.node = null;
            updateCursor();

            if (previousNode && previousMode === 'rewire') {
                const hasTargetSelection = !!text(state.rewire?.targetNodeId, '');
                const clickedValidTarget = !!(
                    !moved
                    && hitNode
                    && hitNode.id !== previousNode.id
                    && state.rewire?.enabled
                    && state.rewire.validTargetIds instanceof Set
                    && state.rewire.validTargetIds.has(String(hitNode.id || ''))
                );
                if (clickedValidTarget) {
                    state.rewire.targetNodeId = text(hitNode.id, '');
                }
                if (!moved && (hasTargetSelection || clickedValidTarget) && typeof ns._finishConstellationRewireDrag === 'function') {
                    ns._finishConstellationRewireDrag(clientX, clientY);
                    return;
                }
                if (!moved) {
                    if (typeof ns._armConstellationRewireNode === 'function') {
                        ns._armConstellationRewireNode(previousNode, { keepEnabled: true });
                    }
                    return;
                }
                if (typeof ns._finishConstellationRewireDrag === 'function') {
                    ns._finishConstellationRewireDrag(clientX, clientY);
                }
                return;
            }

            if (previousNode && moved && (previousNode.kind !== 'link' || previousNode.data?.detachedRoot)) {
                if (isNodeStatic(previousNode)) {
                    setStaticAnchor(previousNode);
                } else if (previousNode.data?.detachedRoot || shouldPersistManualAnchor(previousNode)) {
                    previousNode.manualAnchor = createManualAnchor(previousNode);
                } else {
                    previousNode.manualAnchor = null;
                    const releaseScale = getReleaseVelocityScale(previousNode);
                    previousNode.vx = (Number(state.pointer.releaseVx) || 0) * releaseScale;
                    previousNode.vy = (Number(state.pointer.releaseVy) || 0) * releaseScale;
                    if (typeof ns._applyPassiveReleaseImpulse === 'function') {
                        ns._applyPassiveReleaseImpulse(previousNode);
                    }
                }

                if (isNodeStatic(previousNode) || previousNode.data?.detachedRoot || shouldPersistManualAnchor(previousNode)) {
                    previousNode.vx = 0;
                    previousNode.vy = 0;
                }
            }

            if (previousNode && !moved) {
                if (event.ctrlKey || event.metaKey) {
                    const nextSelection = new Set(state.selectionIds instanceof Set ? state.selectionIds : []);
                    const nodeId = text(previousNode?.id, '');
                    if (nodeId) {
                        if (nextSelection.has(nodeId)) nextSelection.delete(nodeId);
                        else nextSelection.add(nodeId);
                    }
                    state.selectionIds = nextSelection;
                    state.selected = previousNode;
                    renderInspector();
                    requestDraw();
                    return;
                }

                const clickNode = hitNode && hitNode.id === previousNode.id ? hitNode : previousNode;
                const now = Date.now();

                if (state.lastClickNodeId === clickNode.id && now - state.lastClickAt < DOUBLE_CLICK_MS) {
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

        state.pointerUpHandler = function (event) {
            if (state.pointer.mode === 'idle') return;
            clearPointer(event);
        };
        window.addEventListener('pointerup', state.pointerUpHandler);
        window.addEventListener('pointercancel', state.pointerUpHandler);

        state.canvas.addEventListener('pointerleave', (event) => {
            state.pointer.canvasX = 0;
            state.pointer.canvasY = 0;
            if (state.pointer.mode !== 'idle') {
                clearPointer(event);
                return;
            }
            setHoveredNode(null);
        });
    }

    ns._eventCanvas = Object.assign(ns._eventCanvas || {}, {
        bindCanvasEvents
    });
})(window.EveConstellationMap);
