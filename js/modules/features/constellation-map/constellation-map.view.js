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
        if (node.kind === 'workspace') return true;
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
        worldPointFromClient,
        canvasPointFromClient,
        zoomAt,
        getHitNode
    };

})(window.EveConstellationMap);
