window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {

    const shared = ns._shared || {};

    const graph = ns._graph || {};

    const {

        state,

        MAP_PADDING,

        DOUBLE_CLICK_MS,

        MAX_VIEW_SCALE,

        FIT_MAX_SCALE,

        LABEL_MODE_ORDER,

        MOTION_MODE_ORDER,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

        getConfig,

        text,

        escapeHtml,

        clamp,

        getViewportSize,

        getScopeText,

        getLabelModeText,

        getMotionModeText,

        MOTION_TUNING_FIELDS,

        getNodePolarityState,

        cycleNodePolarity,

        toggleKindPolarity,

        getPolarityStrengthValue,

        setPolarityStrengthValue,

        getMotionTuningText,

        getMotionTuningValue,

        setMotionTuningValue,

        resetMotionTuning,

        clearPolarityOverrides,

        getPolaritySummary,

        getNodeCoverCandidates,

        getNodeCoverRotationInterval,

        ensureCoverPreviewSession,

        getNodeCoverUrl,

        isNodeStatic,

        setStaticAnchor,

        toggleStaticForNode,

        toggleStaticForKind,

        toggleStaticBranch,

        clearStaticLocks,

        getStaticStateForNode,

        clearInspectorCoverRotation,

        scheduleInspectorCoverRotation

    } = shared;

    const { buildGraphData, initializeWorldField, getGraphBounds } = graph;

    const render = ns._render || {};

    const {

        requestDraw,

        renderHeader,

        renderInspector,

        renderToolbarState,

        updateInspectorCoverState,

        updateCursor,

        getScreenPoint,

        getNodeAnchor,

        draw

    } = render;

    const physics = ns._physics || {};

    const {

        getMotionProfile,

        syncMotionAnchors,

        setWebMotionAnchor,

        getReleaseVelocityScale,

        tickPhysics

    } = physics;

    if (ns.ready) return;

    function getManualAnchorPreset(node) {

        if (node?.kind === 'workspace') {

            return { driftRadius: 22, pullStrength: 0.02, damping: 0.924, speed: 0.00028 };

        }

        if (node?.kind === 'category') {

            return { driftRadius: 16, pullStrength: 0.024, damping: 0.916, speed: 0.00032 };

        }

        if (node?.kind === 'folder') {

            return { driftRadius: 10, pullStrength: 0.03, damping: 0.91, speed: 0.00038 };

        }

        return { driftRadius: 8, pullStrength: 0.032, damping: 0.904, speed: 0.00042 };

    }



    function hashNodeId(node) {

        const value = String(node?.id || '');

        let hash = 0;

        for (let index = 0; index < value.length; index += 1) {

            hash = ((hash * 33) + value.charCodeAt(index)) % 100003;

        }

        return hash;

    }



    function createManualAnchor(node) {

        const preset = getManualAnchorPreset(node);

        const hash = hashNodeId(node);

        return {

            x: Number.isFinite(node?.x) ? node.x : 0,

            y: Number.isFinite(node?.y) ? node.y : 0,

            driftRadius: preset.driftRadius + (hash % 5),

            pullStrength: preset.pullStrength,

            damping: preset.damping,

            speed: preset.speed + ((hash % 7) * 0.00001),

            phase: (hash % 6283) / 1000

        };

    }

    function buildMotionTuningMarkup() {

        return MOTION_TUNING_FIELDS.map((field) => [

            '<label style="display:grid;grid-template-columns:92px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',

            '<span>' + escapeHtml(field.label) + '</span>',

            '<input data-map-motion-tuning="' + escapeHtml(field.key) + '" type="range" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMotionTuningText(field.key)) + '" style="width:100%;">',

            '<span data-map-motion-tuning-value="' + escapeHtml(field.key) + '" style="min-width:42px;text-align:right;">' + escapeHtml(getMotionTuningText(field.key)) + '</span>',

            '<input data-map-motion-tuning-number="' + escapeHtml(field.key) + '" type="number" min="' + escapeHtml(String(field.min)) + '" max="' + escapeHtml(String(field.max)) + '" step="' + escapeHtml(String(field.step)) + '" value="' + escapeHtml(getMotionTuningText(field.key)) + '" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',

            '</label>'

        ].join('')).join('');

    }



    function applyPassiveReleaseImpulse(node) {

        if (!node || node.kind !== 'folder') return;

        const speed = Math.hypot(Number(node.vx) || 0, Number(node.vy) || 0);

        if (speed >= 0.48) return;

        const hash = hashNodeId(node);

        const angle = (hash % 6283) / 1000;

        const impulse = 0.76 + ((hash % 7) * 0.05);

        node.vx = Math.cos(angle) * impulse;

        node.vy = Math.sin(angle) * impulse;

    }



    function getInteractionTargetNode() {

        return state.selected || state.hovered || null;

    }



    function shouldPersistManualAnchor(node) {

        if (!node) return false;

        return node.kind === 'workspace' || node.kind === 'category';

    }



    function shouldPreferSelectedNodeForDrag(node) {

        if (!node) return false;

        if (isNodeStatic(node)) return true;

        return node.kind === 'workspace' || node.kind === 'category';

    }



    function fitToGraph() {

        if (!state.canvas) return;

        const bounds = getGraphBounds();

        const availableWidth = Math.max(280, state.canvas.width - (MAP_PADDING * 2));

        const availableHeight = Math.max(220, state.canvas.height - (MAP_PADDING * 2));

        const scale = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), 0.42, FIT_MAX_SCALE);

        const tx = ((state.canvas.width - (bounds.width * scale)) / 2) - (bounds.minX * scale);

        const ty = ((state.canvas.height - (bounds.height * scale)) / 2) - (bounds.minY * scale);

        state.fitTransform = { scale, tx, ty };

        state.transform = { scale, tx, ty };

        requestDraw();

    }



    function setTransform(scale, tx, ty) {

        state.transform.scale = clamp(scale, 0.42, MAX_VIEW_SCALE);

        state.transform.tx = tx;

        state.transform.ty = ty;

        requestDraw();

    }



    function resetView() {

        state.transform = {

            scale: state.fitTransform.scale,

            tx: state.fitTransform.tx,

            ty: state.fitTransform.ty

        };

        requestDraw();

    }



    function centerOnNode(node, targetScale) {

        if (!node || !state.canvas) return;

        const scale = clamp(targetScale || state.transform.scale, 0.42, MAX_VIEW_SCALE);

        const tx = (state.canvas.width / 2) - (node.x * scale);

        const ty = (state.canvas.height / 2) - (node.y * scale);

        setTransform(scale, tx, ty);

    }



    function worldPointFromClient(clientX, clientY) {

        if (!state.canvas) return { x: 0, y: 0 };

        const rect = state.canvas.getBoundingClientRect();

        return {

            x: (clientX - rect.left - state.transform.tx) / state.transform.scale,

            y: (clientY - rect.top - state.transform.ty) / state.transform.scale

        };

    }



    function canvasPointFromClient(clientX, clientY) {

        if (!state.canvas) return { x: 0, y: 0 };

        const rect = state.canvas.getBoundingClientRect();

        return {

            x: clientX - rect.left,

            y: clientY - rect.top

        };

    }



    function zoomAt(factor, clientX, clientY) {

        if (!state.canvas) return;

        const rect = state.canvas.getBoundingClientRect();

        const localX = clientX - rect.left;

        const localY = clientY - rect.top;

        const worldX = (localX - state.transform.tx) / state.transform.scale;

        const worldY = (localY - state.transform.ty) / state.transform.scale;

        const nextScale = clamp(state.transform.scale * factor, 0.42, MAX_VIEW_SCALE);

        const nextTx = localX - (worldX * nextScale);

        const nextTy = localY - (worldY * nextScale);

        setTransform(nextScale, nextTx, nextTy);

    }



    function getHitNode(clientX, clientY) {

        const point = canvasPointFromClient(clientX, clientY);

        let bestNode = null;

        let bestScore = Infinity;

        for (let index = state.nodes.length - 1; index >= 0; index -= 1) {

            const node = state.nodes[index];

            const screenPoint = getScreenPoint(node);

            const dx = point.x - screenPoint.x;

            const dy = point.y - screenPoint.y;

            const minPixelRadius = node.kind === 'workspace'

                ? 34

                : node.kind === 'category'

                    ? 30

                    : node.kind === 'folder'

                        ? 24

                        : 18;

            const radius = Math.max((node.radius * state.transform.scale) + 10, minPixelRadius);

            const distSq = (dx * dx) + (dy * dy);

            if (distSq <= (radius * radius)) {

                const kindBias = node.kind === 'link' ? 1 : 0.72;

                const score = (distSq / Math.max(radius, 1)) * kindBias;

                if (score < bestScore) {

                    bestNode = node;

                    bestScore = score;

                }

            }

        }

        if (!bestNode) {

            let nearestNode = null;

            let nearestScore = Infinity;

            for (let index = state.nodes.length - 1; index >= 0; index -= 1) {

                const node = state.nodes[index];

                const screenPoint = getScreenPoint(node);

                const dx = point.x - screenPoint.x;

                const dy = point.y - screenPoint.y;

                const distSq = (dx * dx) + (dy * dy);

                if (distSq < nearestScore && distSq <= (30 * 30)) {

                    nearestNode = node;

                    nearestScore = distSq;

                }

            }

            if (nearestNode) return nearestNode;

        }

        if (bestNode) return bestNode;



        for (let index = state.labelHitBoxes.length - 1; index >= 0; index -= 1) {

            const box = state.labelHitBoxes[index];

            if (

                point.x >= box.left

                && point.x <= box.right

                && point.y >= box.top

                && point.y <= box.bottom

            ) {

                return box.node;

            }

        }

        return null;

    }



    function getPrimaryAction(node) {

        if (!node) return null;

        if (node.kind === 'link') {

            return { label: 'Open Bookmark', action: 'open-link' };

        }

        if (node.kind === 'workspace') {

            return { label: 'Open Tab', action: 'open-workspace' };

        }

        if (node.kind === 'category') {

            return { label: 'Open Card', action: 'open-category' };

        }

        if (node.kind === 'folder') {

            return { label: 'Open Folder', action: 'open-folder' };

        }

        return { label: 'Center Node', action: 'center-node' };

    }



    function activateNode(node) {

        if (!node) return;

        const data = node.data || {};



        if (node.kind === 'link' && data.linkId && typeof window.openBookmarkFromDashboard === 'function') {

            window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, data.linkId);

            ns.closeMap();

            return;

        }



        if (node.kind === 'workspace' && data.workspaceId && typeof window.switchWorkspace === 'function') {

            window.switchWorkspace(data.workspaceId);

            ns.closeMap();

            return;

        }



        if (node.kind === 'category' && data.categoryName) {

            if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {

                window.switchWorkspace(data.workspaceId);

            }

            if (typeof window.setFocus === 'function') {

                window.setFocus(data.categoryName);

                ns.closeMap();

                return;

            }

        }

        if (node.kind === 'folder' && data.folderId && data.categoryName && openFolderFromMap(node)) {

            return;

        }



        centerOnNode(node, Math.max(state.transform.scale, 1.2));

    }

    function openFolderFromMap(node) {

        const data = node?.data || {};

        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');
        const folderId = text(data.folderId, '');

        if (!categoryName || !folderId || !window.EveFolderViewV2?.enterFolder) return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {

            window.switchWorkspace(workspaceId);

        }

        if (categoryName && typeof window.setFocus === 'function') {

            window.setFocus(categoryName);

        }

        window.setTimeout(() => {

            try {

                window.EveFolderViewV2.enterFolder(null, categoryName, folderId, workspaceId);

            } catch (error) {

                console.warn('[ConstellationMap] Failed to open folder from map', error);

            }

        }, 70);

        ns.closeMap();

        return true;

    }

    function openCategorySettingsFromMap(node) {

        const data = node?.data || {};

        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');

        if (!categoryName || typeof window.openCategorySettings !== 'function') return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {

            window.switchWorkspace(workspaceId);

        }

        if (typeof window.setFocus === 'function') {

            window.setFocus(categoryName);

        }

        window.setTimeout(() => {

            try {

                window.openCategorySettings(categoryName);

            } catch (error) {

                console.warn('[ConstellationMap] Failed to open card settings from map', error);

            }

        }, 60);

        return true;

    }

    function runNodeAction(node, action) {

        if (!node || !action) return;

        if (action === 'primary') {

            activateNode(node);
            return;

        }

        if (action === 'center') {

            centerOnNode(node, Math.max(state.transform.scale, 1.24));
            return;

        }

        if (action === 'open-category') {

            const data = node.data || {};

            if (data.categoryName) {

                if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {

                    window.switchWorkspace(data.workspaceId);

                }

                if (typeof window.setFocus === 'function') {

                    window.setFocus(data.categoryName);
                    ns.closeMap();
                }

            }

            return;

        }

        if (action === 'open-folder') {

            openFolderFromMap(node);
            return;

        }

        if (action === 'open-category-settings') {

            openCategorySettingsFromMap(node);

        }

    }



    function step() {

        if (!state.running) return;

        tickPhysics();

        draw();

        state.animationFrameId = window.requestAnimationFrame(step);

    }



    function stopAnimation() {

        state.running = false;

        if (state.animationFrameId) {

            window.cancelAnimationFrame(state.animationFrameId);

            state.animationFrameId = 0;

        }

    }



    function startAnimation() {

        stopAnimation();

        state.running = true;

        step();

    }



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

            if (!state.pointer.forcePan && state.selected && state.selected.kind !== 'link' && shouldPreferSelectedNodeForDrag(state.selected)) {

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

            state.pointer.mode = hitNode ? 'node' : 'pan';

            state.pointer.node = hitNode;

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

            if (hitNode) {

                setSelectedNode(hitNode);

                state.pointer.lastWorldX = Number(hitNode.x) || 0;

                state.pointer.lastWorldY = Number(hitNode.y) || 0;

                state.canvas.setPointerCapture?.(event.pointerId);

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

                if (state.motionMode === 'web' && (state.pointer.node.kind === 'workspace' || state.pointer.node.kind === 'category')) {

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

            state.pointer.mode = 'idle';

            state.pointer.node = null;

            updateCursor();



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

                    applyPassiveReleaseImpulse(previousNode);

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

                    activateNode(clickNode);

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

            if (event.target?.dataset?.mapInfoToggle) {

                state.infoCollapsed = !state.infoCollapsed;

                renderInspector();

                return;

            }

            const action = event.target?.dataset?.mapAction;

            if (!action || !state.selected) return;

            runNodeAction(state.selected, action);

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



    function ensureContainer() {

        if (state.container && state.canvas && state.ctx) return;

        const container = document.createElement('div');

        container.id = 'constellation-map-overlay';

        container.style.cssText = [

            'position:fixed',

            'inset:0',

            'z-index:99999',

            'display:none',

            'background:radial-gradient(circle at top, rgba(8,21,38,0.94), rgba(2,6,16,0.97))',

            'backdrop-filter:blur(10px)'

        ].join(';');

        container.innerHTML = [

            '<div style="position:absolute;z-index:3;top:16px;left:20px;display:flex;flex-direction:column;gap:4px;max-width:min(48vw,680px);pointer-events:auto;">',

            '<div data-map-title style="font-size:1.05rem;font-weight:700;letter-spacing:0.06em;color:#f3f8ff;">NEURAL CORE :: CONSTELLATION MAP</div>',

            '<div data-map-scope style="font-size:0.82rem;color:rgba(255,255,255,0.76);"></div>',

            '<div data-map-stats style="font-size:0.78rem;color:rgba(255,255,255,0.58);"></div>',

            '</div>',

            '<div style="position:absolute;z-index:3;top:16px;right:20px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;max-width:min(52vw,900px);pointer-events:auto;">',

            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',

            '<input data-map-find type="search" placeholder="Find bookmark, card, folder..." style="min-width:240px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;outline:none;">',

            '<button type="button" data-map-toolbar="find" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Find</button>',

            '<button type="button" data-map-toolbar="zoom-out" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">-</button>',

            '<button type="button" data-map-toolbar="zoom-in" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">+</button>',

            '<button type="button" data-map-toolbar="fit" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Fit</button>',

            '<button type="button" data-map-toolbar="reset" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Reset</button>',

            '<button type="button" data-map-toolbar="labels" style="border:1px solid rgba(0,212,255,0.28);background:rgba(0,212,255,0.12);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Labels: Auto</button>',

            '<button type="button" data-map-toolbar="motion" style="border:1px solid rgba(145,220,255,0.26);background:rgba(145,220,255,0.11);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Motion: Web</button>',

            '<button type="button" data-map-toolbar="controls" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Controls</button>',

            '<button type="button" data-map-toolbar="close" style="border:1px solid rgba(255,80,120,0.3);background:rgba(255,80,120,0.14);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">Close</button>',

            '</div>',

            '<div data-map-controls-panel style="display:none;flex-direction:column;gap:12px;align-items:stretch;align-self:stretch;min-width:min(440px,calc(100vw - 40px));max-width:min(52vw,900px);padding:14px 16px;border:1px solid rgba(255,255,255,0.14);background:rgba(4,10,20,0.88);border-radius:16px;box-shadow:0 18px 34px rgba(0,0,0,0.28);">',

            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',

            '<button type="button" data-map-toolbar="static-node" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Static Node</button>',

            '<button type="button" data-map-toolbar="static-chain" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Static Chain</button>',

            '<button type="button" data-map-toolbar="static-kind" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Static Type</button>',

            '<button type="button" data-map-toolbar="static-clear" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Clear Static</button>',

            '<div data-map-static-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">Static: none</div>',

            '</div>',

            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',

            '<button type="button" data-map-static-kind="workspace" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Freeze Tab</button>',

            '<button type="button" data-map-static-kind="category" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Freeze Card</button>',

            '<button type="button" data-map-static-kind="folder" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Freeze Folder</button>',

            '<button type="button" data-map-static-kind="link" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Freeze Bookmark</button>',

            '</div>',

            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">',

            '<button type="button" data-map-toolbar="polarity-node" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Node: Inherit</button>',

            '<button type="button" data-map-toolbar="polarity-kind" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Type: Push</button>',

            '<button type="button" data-map-toolbar="polarity-clear" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Clear Flow</button>',

            '<button type="button" data-map-toolbar="motion-reset" style="border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.07);color:#fff;border-radius:10px;padding:7px 11px;cursor:pointer;">Reset Forces</button>',

            '<div data-map-polarity-summary style="font-size:0.74rem;color:rgba(255,255,255,0.72);padding-left:4px;">Flow: push default</div>',

            '</div>',

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;align-items:start;">',

            '<label style="display:grid;grid-template-columns:42px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',

            '<span>Push</span>',

            '<input data-map-polarity-strength="repel" type="range" min="0" max="2.5" step="0.01" value="0.76" style="width:100%;">',

            '<span data-map-polarity-strength-value="repel" style="min-width:42px;text-align:right;">0.76</span>',

            '<input data-map-polarity-strength-number="repel" type="number" min="0" max="2.5" step="0.01" value="0.76" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',

            '</label>',

            '<label style="display:grid;grid-template-columns:42px minmax(112px,1fr) 50px 64px;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.82);">',

            '<span>Pull</span>',

            '<input data-map-polarity-strength="attract" type="range" min="0" max="2.5" step="0.01" value="0.62" style="width:100%;">',

            '<span data-map-polarity-strength-value="attract" style="min-width:42px;text-align:right;">0.62</span>',

            '<input data-map-polarity-strength-number="attract" type="number" min="0" max="2.5" step="0.01" value="0.62" style="width:64px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#fff;border-radius:8px;padding:6px 8px;outline:none;">',

            '</label>',

            '</div>',

            '<div style="display:flex;flex-direction:column;gap:8px;">',

            buildMotionTuningMarkup(),

            '</div>',

            '<div style="font-size:0.78rem;line-height:1.5;color:rgba(255,255,255,0.74);padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);">Drag background to pan. Hold Space to force-pan through dense clusters. Drag nodes to reorganize. Mouse wheel zooms. Double-click a bookmark node to open it.</div>',

            '</div>',

            '</div>',

            '<canvas data-map-canvas style="position:absolute;z-index:1;inset:0;width:100%;height:100%;display:block;cursor:grab;"></canvas>',

            '<div data-map-info style="position:absolute;z-index:3;right:108px;bottom:20px;max-width:min(360px,calc(100vw - 200px));min-width:260px;border:1px solid rgba(255,255,255,0.14);background:rgba(3,10,20,0.86);border-radius:16px;padding:14px 16px;color:#fff;box-shadow:0 18px 40px rgba(0,0,0,0.35);pointer-events:auto;"></div>'

        ].join('');

        document.body.appendChild(container);



        state.container = container;

        state.canvas = container.querySelector('[data-map-canvas]');

        state.ctx = state.canvas.getContext('2d');

        state.titleEl = container.querySelector('[data-map-title]');

        state.scopeEl = container.querySelector('[data-map-scope]');

        state.statsEl = container.querySelector('[data-map-stats]');

        state.infoEl = container.querySelector('[data-map-info]');

        state.findInput = container.querySelector('[data-map-find]');



        container.addEventListener('click', (event) => {

            const toolbarAction = event.target?.dataset?.mapToolbar;

            const directStaticKind = event.target?.dataset?.mapStaticKind;

            if (directStaticKind) {

                toggleStaticForKind(directStaticKind);

                renderInspector();

                requestDraw();

                return;

            }

            if (!toolbarAction) return;

            if (toolbarAction === 'find') runFind();

            else if (toolbarAction === 'zoom-in') zoomAt(1.12, state.canvas.width / 2, state.canvas.height / 2);

            else if (toolbarAction === 'zoom-out') zoomAt(0.9, state.canvas.width / 2, state.canvas.height / 2);

            else if (toolbarAction === 'fit') fitToGraph();

            else if (toolbarAction === 'reset') resetView();

            else if (toolbarAction === 'labels') {

                const currentIndex = LABEL_MODE_ORDER.indexOf(state.labelMode);

                state.labelMode = LABEL_MODE_ORDER[(currentIndex + 1) % LABEL_MODE_ORDER.length];

                event.target.textContent = getLabelModeText();

                requestDraw();

                renderToolbarState();

            } else if (toolbarAction === 'motion') {

                const currentIndex = MOTION_MODE_ORDER.indexOf(state.motionMode);

                state.motionMode = MOTION_MODE_ORDER[(currentIndex + 1) % MOTION_MODE_ORDER.length];

                syncMotionAnchors(true);

                event.target.textContent = getMotionModeText();

                requestDraw();

                renderToolbarState();

            } else if (toolbarAction === 'controls') {

                state.controlsExpanded = !state.controlsExpanded;

                renderToolbarState();

            } else if (toolbarAction === 'static-node') {

                const targetNode = getInteractionTargetNode();

                if (!targetNode) return;

                toggleStaticForNode(targetNode);

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'static-chain') {

                const targetNode = getInteractionTargetNode();

                if (!targetNode) return;

                toggleStaticBranch(targetNode);

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'static-kind') {

                const targetNode = getInteractionTargetNode();

                if (!targetNode) return;

                toggleStaticForKind(targetNode.kind);

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'static-clear') {

                clearStaticLocks();

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'polarity-node') {

                const targetNode = getInteractionTargetNode();

                if (!targetNode) return;

                cycleNodePolarity(targetNode);

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'polarity-kind') {

                const targetNode = getInteractionTargetNode();

                if (!targetNode) return;

                toggleKindPolarity(targetNode.kind);

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'polarity-clear') {

                clearPolarityOverrides();

                renderInspector();

                requestDraw();

            } else if (toolbarAction === 'motion-reset') {

                resetMotionTuning();

                renderToolbarState();

                requestDraw();

            } else if (toolbarAction === 'close') {

                ns.closeMap();

            }

        });

        container.addEventListener('input', (event) => {

            const polarityMode = event.target?.dataset?.mapPolarityStrength;

            const polarityNumberMode = event.target?.dataset?.mapPolarityStrengthNumber;

            const motionTuningMode = event.target?.dataset?.mapMotionTuning;

            const motionTuningNumberMode = event.target?.dataset?.mapMotionTuningNumber;

            if (polarityMode || polarityNumberMode) {

                setPolarityStrengthValue(polarityMode || polarityNumberMode, event.target.value);

                renderToolbarState();

                renderInspector();

                requestDraw();

                return;

            }

            if (!motionTuningMode && !motionTuningNumberMode) return;

            setMotionTuningValue(motionTuningMode || motionTuningNumberMode, event.target.value);

            renderToolbarState();

            requestDraw();

        });



        bindEvents();

        state.resizeHandler?.();

        const labelsButton = container.querySelector('[data-map-toolbar="labels"]');

        if (labelsButton) labelsButton.textContent = getLabelModeText();

        const motionButton = container.querySelector('[data-map-toolbar="motion"]');

        if (motionButton) motionButton.textContent = getMotionModeText();

        renderInspector();

        updateInspectorCoverState();

        renderToolbarState();

    }



    ns.openMap = function openMap(scopeOption) {

        ensureContainer();

        buildGraphData(scopeOption);

        syncMotionAnchors(true);

        renderHeader();

        renderInspector();

        fitToGraph();

        state.container.style.display = 'block';

        document.body.style.overflow = 'hidden';

        startAnimation();

    };



    ns.openAllMap = function openAllMap() {

        ns.openMap({ scope: 'all' });

    };



    ns.openWorkspaceMap = function openWorkspaceMap(workspaceId) {

        ns.openMap({ scope: 'workspace', workspaceId });

    };



    ns.openCardMap = function openCardMap(workspaceId, categoryName) {

        ns.openMap({ scope: 'card', workspaceId, categoryName });

    };



    ns.openFolderMap = function openFolderMap(workspaceId, categoryName, folderId, folderLabel) {

        ns.openMap({ scope: 'folder', workspaceId, categoryName, folderId, folderLabel });

    };



    ns.openDerivedMap = function openDerivedMap(options) {

        const source = options && typeof options === 'object' ? options : {};

        ns.openMap({

            scope: 'derived',

            workspaceId: source.workspaceId,

            categoryName: source.categoryName,

            scopeLabel: source.scopeLabel,

            linkIds: Array.isArray(source.linkIds) ? source.linkIds : []

        });

    };



    ns.openCurrentViewMap = function openCurrentViewMap() {

        const mainContent = document.getElementById('main-content');

        const isUnidexActive = !!mainContent?.classList?.contains('unidex-view-active');

        const unidex = window.UnidexView;

        if (isUnidexActive && unidex?.getConstellationScope) {

            ns.openMap(unidex.getConstellationScope());

            return;

        }

        ns.openWorkspaceMap(getConfig().activeWorkspace || 'main');

    };



    ns.closeMap = function closeMap() {

        stopAnimation();

        clearInspectorCoverRotation();

        if (state.container) state.container.style.display = 'none';

        document.body.style.overflow = '';

    };



    ns.__debugGetGraphStats = function __debugGetGraphStats() {

        const viewport = state.canvas

            ? { width: state.canvas.width, height: state.canvas.height }

            : getViewportSize();

        const scale = Math.max(state.transform.scale || 1, 0.0001);

        const visibleWorldBounds = {

            minX: Number((((MAP_PADDING - state.transform.tx) / scale)).toFixed(2)),

            maxX: Number(((((viewport.width - MAP_PADDING) - state.transform.tx) / scale)).toFixed(2)),

            minY: Number((((MAP_PADDING - state.transform.ty) / scale)).toFixed(2)),

            maxY: Number(((((viewport.height - MAP_PADDING) - state.transform.ty) / scale)).toFixed(2))

        };

        const outOfBounds = state.nodes.reduce((count, node) => {

            if (!node) return count;

            if (

                node.x < visibleWorldBounds.minX

                || node.y < visibleWorldBounds.minY

                || node.x > visibleWorldBounds.maxX

                || node.y > visibleWorldBounds.maxY

            ) {

                return count + 1;

            }

            return count;

        }, 0);

        const motionProfile = getMotionProfile(state.nodes.length);

        return {

            motionProfile: {
                mode: motionProfile.mode,
                repulsionScale: Number((motionProfile.repulsionScale || 0).toFixed(3)),
                centerPullScale: Number((motionProfile.centerPullScale || 0).toFixed(3)),
                springScale: Number((motionProfile.springScale || 0).toFixed(3)),
                hierarchyReactionScale: Number((motionProfile.hierarchyReactionScale || 0).toFixed(3)),
                folderRecoveryScale: Number((motionProfile.folderRecoveryScale || 0).toFixed(3)),
                dampingScale: Number((motionProfile.dampingScale || 0).toFixed(3)),
                speedScale: Number((motionProfile.speedScale || 0).toFixed(3)),
                worldTetherScale: Number((motionProfile.worldTetherScale || 0).toFixed(3))
            },

            scope: state.scope,

            motionMode: state.motionMode,

            visible: !!state.container && state.container.style.display !== 'none',

            nodeCount: state.nodes.length,

            edgeCount: state.edges.length,

            labelCount: state.labelHitBoxes.length,

            outOfBounds,

            worldRadius: Number((state.worldRadius || 0).toFixed(2)),

            visibleWorldBounds,

            worldBounds: state.worldBounds ? {

                minX: Number(state.worldBounds.minX.toFixed(2)),

                maxX: Number(state.worldBounds.maxX.toFixed(2)),

                minY: Number(state.worldBounds.minY.toFixed(2)),

                maxY: Number(state.worldBounds.maxY.toFixed(2))

            } : null,

            transform: {

                scale: Number(state.transform.scale.toFixed(4)),

                tx: Number(state.transform.tx.toFixed(2)),

                ty: Number(state.transform.ty.toFixed(2))

            },

            sampleNodes: state.nodes.slice(0, 60).map((node) => ({

                id: node.id,

                kind: node.kind,

                label: node.label,

                x: Number(node.x.toFixed(2)),

                y: Number(node.y.toFixed(2)),

                vx: Number((Number(node.vx) || 0).toFixed(3)),

                vy: Number((Number(node.vy) || 0).toFixed(3)),

                isStatic: isNodeStatic(node),

                staticSource: getStaticStateForNode(node).source || '',

                hasManualAnchor: !!node.manualAnchor,

                polarity: getNodePolarityState(node).effective,

                polaritySource: getNodePolarityState(node).source || '',

                nodePolarity: getNodePolarityState(node).nodeOverride,

                kindPolarity: getNodePolarityState(node).kind

            })),

            staticSummary: {

                nodeIds: Array.from(state.staticNodeIds.values()),

                kinds: Array.from(state.staticKinds.values()),

                branchRoots: Array.from(state.staticBranchRoots.keys()),

                branchNodeIds: Array.from(state.staticBranchNodeIds.values())

            },

            polaritySummary: {

                nodeOverrideCount: getPolaritySummary().nodeOverrideCount,

                attractKinds: getPolaritySummary().attractKinds.slice(),

                strength: {

                    repel: Number(getPolarityStrengthValue('repel').toFixed(2)),

                    attract: Number(getPolarityStrengthValue('attract').toFixed(2))

                }

            },

            motionTuning: Object.fromEntries(MOTION_TUNING_FIELDS.map((field) => [
                field.key,
                Number(getMotionTuningValue(field.key).toFixed(2))
            ])),

            kinds: state.nodes.reduce((acc, node) => {

                acc[node.kind] = (acc[node.kind] || 0) + 1;

                return acc;

            }, {})

        };

    };



    ns.__debugGetInspectorCoverState = function __debugGetInspectorCoverState() {

        const targetNode = state.selected || state.hovered || null;

        return {

            targetNode: targetNode ? {

                id: targetNode.id,

                kind: targetNode.kind,

                label: targetNode.label

            } : null,

            now: Date.now(),

            infoHovered: !!state.infoHovered,

            infoHoverStartedAt: state.infoHoverStartedAt || 0,

            interval: getNodeCoverRotationInterval(targetNode),

            candidates: getNodeCoverCandidates(targetNode),

            current: getNodeCoverUrl(targetNode),

            session: state.coverPreviewSession ? {

                key: state.coverPreviewSession.key,

                startedAt: state.coverPreviewSession.startedAt,

                elapsedMs: state.coverPreviewSession.elapsedMs,

                covers: state.coverPreviewSession.covers.slice()

            } : null

        };

    };

    ns.__debugSelectNode = function __debugSelectNode(nodeId) {

        const node = state.nodeIndex.get(String(nodeId || '')) || null;

        if (!node) return false;

        setSelectedNode(node);

        requestDraw();

        return true;

    };



    ns.__debugShiftInspectorHover = function __debugShiftInspectorHover(deltaMs) {

        const amount = Number(deltaMs) || 0;

        if (!state.infoHoverStartedAt) {

            state.infoHoverStartedAt = Date.now();

        }

        state.infoHoverStartedAt -= amount;

        if (state.coverPreviewSession?.startedAt) {

            state.coverPreviewSession.startedAt -= amount;

        } else if (state.coverPreviewSession) {

            state.coverPreviewSession.elapsedMs = Math.max(0, Number(state.coverPreviewSession.elapsedMs || 0) + amount);

        }

        renderInspector();

        return state.infoHoverStartedAt;

    };



    ns.ready = true;

})(window.EveConstellationMap);

