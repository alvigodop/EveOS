window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

    const graph = ns._graph || {};

    const render = ns._render || {};

    const {

        state,

        MAP_PADDING,

        MAX_VIEW_SCALE,

        MIN_VIEW_SCALE,

        FIT_MAX_SCALE,

        clamp,

        isNodeStatic

    } = shared;

    const { getGraphBounds } = graph;

    const { requestDraw, getScreenPoint } = render;



    function isNodeMain(node) {
        if (!node) return false;
        if (node.data?.detached && node.data?.detachedRoot) return true;
        if (node.kind === 'workspace') {
            // Only ROOT workspace nodes are main — sub-tab workspaces have hierarchy edges to a parent workspace
            const hasParentWorkspace = state.edges.some((edge) => edge.source.id === node.id && edge.type === 'hierarchy' && edge.target?.kind === 'workspace');
            return !hasParentWorkspace;
        }
        if (node.kind === 'category' || node.kind === 'folder') {
            const hasParent = state.edges.some((edge) => edge.source.id === node.id && edge.type === 'hierarchy');
            return !hasParent;
        }
        return false;
    }

    function shouldPersistManualAnchor(node) {

        if (!node) return false;

        return isNodeMain(node);

    }



    function shouldPreferSelectedNodeForDrag(node) {

        if (!node) return false;

        if (isNodeStatic(node)) return true;

        return isNodeMain(node);

    }



    function fitToGraph() {

        if (!state.canvas) return;

        const bounds = getGraphBounds();

        const availableWidth = Math.max(280, state.canvas.width - (MAP_PADDING * 2));

        const availableHeight = Math.max(220, state.canvas.height - (MAP_PADDING * 2));

        const scale = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), MIN_VIEW_SCALE, FIT_MAX_SCALE);

        const tx = ((state.canvas.width - (bounds.width * scale)) / 2) - (bounds.minX * scale);

        const ty = ((state.canvas.height - (bounds.height * scale)) / 2) - (bounds.minY * scale);

        state.fitTransform = { scale, tx, ty };

        state.transform = { scale, tx, ty };

        requestDraw();

    }



    function setTransform(scale, tx, ty) {

        state.transform.scale = clamp(scale, MIN_VIEW_SCALE, MAX_VIEW_SCALE);

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

        const scale = clamp(targetScale || state.transform.scale, MIN_VIEW_SCALE, MAX_VIEW_SCALE);

        const tx = (state.canvas.width / 2) - (node.x * scale);

        const ty = (state.canvas.height / 2) - (node.y * scale);

        setTransform(scale, tx, ty);

    }



    function getCanvasMetrics() {

        if (!state.canvas) {
            return {
                rect: { left: 0, top: 0, width: 1, height: 1 },
                scaleX: 1,
                scaleY: 1
            };
        }

        const rect = state.canvas.getBoundingClientRect();
        const rectWidth = Math.max(1, Number(rect.width) || Number(state.canvas.clientWidth) || Number(state.canvas.width) || 1);
        const rectHeight = Math.max(1, Number(rect.height) || Number(state.canvas.clientHeight) || Number(state.canvas.height) || 1);
        const canvasWidth = Math.max(1, Number(state.canvas.width) || rectWidth);
        const canvasHeight = Math.max(1, Number(state.canvas.height) || rectHeight);

        return {
            rect,
            scaleX: canvasWidth / rectWidth,
            scaleY: canvasHeight / rectHeight
        };

    }



    function getCanvasCenterClientPoint() {

        const metrics = getCanvasMetrics();

        return {
            x: metrics.rect.left + (metrics.rect.width / 2),
            y: metrics.rect.top + (metrics.rect.height / 2)
        };

    }



    function worldPointFromClient(clientX, clientY) {

        if (!state.canvas) return { x: 0, y: 0 };
        const point = canvasPointFromClient(clientX, clientY);

        return {

            x: (point.x - state.transform.tx) / state.transform.scale,

            y: (point.y - state.transform.ty) / state.transform.scale

        };

    }



    function canvasPointFromClient(clientX, clientY) {

        if (!state.canvas) return { x: 0, y: 0 };
        const metrics = getCanvasMetrics();

        return {

            x: (clientX - metrics.rect.left) * metrics.scaleX,

            y: (clientY - metrics.rect.top) * metrics.scaleY

        };

    }



    function zoomAt(factor, clientX, clientY) {

        if (!state.canvas) return;
        const localPoint = canvasPointFromClient(clientX, clientY);
        const localX = localPoint.x;
        const localY = localPoint.y;

        const worldX = (localX - state.transform.tx) / state.transform.scale;

        const worldY = (localY - state.transform.ty) / state.transform.scale;

        const nextScale = clamp(state.transform.scale * factor, MIN_VIEW_SCALE, MAX_VIEW_SCALE);

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



    ns._view = {
        isNodeMain,
        shouldPersistManualAnchor,
        shouldPreferSelectedNodeForDrag,
        fitToGraph,
        setTransform,
        resetView,
        centerOnNode,
        getCanvasCenterClientPoint,
        worldPointFromClient,
        canvasPointFromClient,
        zoomAt,
        getHitNode
    };

})(window.EveConstellationMap);
