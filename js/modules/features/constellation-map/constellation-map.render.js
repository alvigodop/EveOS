window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {



    const shared = ns._shared || {};

    const {

        state,

        getStaticStateForNode,

        getMapThemeRgba,

        text

    } = shared;



    const renderCanvas = ns._renderCanvas || {};

    const {

        getNodeAnchor,

        getScreenPoint,

        renderLabels,

        drawPhysicsAuras,

        drawBlobLayers

    } = renderCanvas;



    const renderToolbarHelpers = ns._renderToolbarHelpers || {};

    const {

        renderToolbarState,

        renderHeader

    } = renderToolbarHelpers;



    const renderInspectorHelpers = ns._renderInspectorHelpers || {};

    const {

        renderInspector,

        updateInspectorCoverState,

        updateCursor

    } = renderInspectorHelpers;



function requestDraw() {



        if (!state.running) draw();



    }





function draw() {
        if (!state.ctx || !state.canvas) return;

        const ctx = state.ctx;
        ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        ctx.save();
        ctx.translate(state.transform.tx, state.transform.ty);
        ctx.scale(state.transform.scale, state.transform.scale);

        drawPhysicsAuras(ctx);
        drawBlobLayers(ctx);

        const boundsLeft = -state.transform.tx / state.transform.scale - 500;
        const boundsTop = -state.transform.ty / state.transform.scale - 500;
        const boundsRight = (ctx.canvas.width - state.transform.tx) / state.transform.scale + 500;
        const boundsBottom = (ctx.canvas.height - state.transform.ty) / state.transform.scale + 500;
        const nodeCount = state.nodes.length;
        const isMassive = nodeCount > 500;
        const isHyperMassive = nodeCount > 5000;
        const isUltraMassive = nodeCount > 10000;
        
        // Hide almost all edges unless zoomed in for large maps
        let hideEdges = false;
        if (isUltraMassive) hideEdges = state.transform.scale < 0.8;
        else if (isHyperMassive) hideEdges = state.transform.scale < 0.6;
        else if (isMassive) hideEdges = state.transform.scale < 0.25;

        // Skip massive node drawing completely if zoomed REALLY far out
        const renderClustersOnly = isUltraMassive && state.transform.scale < 0.2;

        if (!hideEdges) {
            const tagPath = new Path2D();
            const defaultPath = new Path2D();

            for (let i = 0; i < state.edges.length; i++) {
                const edge = state.edges[i];
                const sx = edge.source.x, sy = edge.source.y;
                const tx = edge.target.x, ty = edge.target.y;

                if (sx < boundsLeft || sx > boundsRight || sy < boundsTop || sy > boundsBottom) {
                    if (tx < boundsLeft || tx > boundsRight || ty < boundsTop || ty > boundsBottom) continue;
                }

                const path = edge.type === 'tag' ? tagPath : defaultPath;
                path.moveTo(sx, sy);
                path.lineTo(tx, ty);
            }

            ctx.strokeStyle = getMapThemeRgba('mapAccent', 0.12);
            ctx.lineWidth = 0.9 / state.transform.scale;
            ctx.stroke(tagPath);

            ctx.strokeStyle = getMapThemeRgba('mapAccent', 0.28);
            ctx.lineWidth = 1.5 / state.transform.scale;
            ctx.stroke(defaultPath);
        }

        const rewireSourceNode = text(state.rewire?.sourceNodeId, '')
            ? state.nodes.find((node) => node.id === state.rewire.sourceNodeId) || null
            : null;
        const rewireTargetNode = text(state.rewire?.targetNodeId, '')
            ? state.nodes.find((node) => node.id === state.rewire.targetNodeId) || null
            : null;
        const validRewireTargets = state.rewire?.validTargetIds instanceof Set ? state.rewire.validTargetIds : new Set();

        const fillPathsByColor = {};
        const strokePathsByColor = {};
        const staticPathsByColor = {};
        const multiSelectedPath = new Path2D();
        const hoveredSelectedPaths = [];

        for (let i = 0; i < state.nodes.length; i++) {
            const node = state.nodes[i];
            if (node.x < boundsLeft || node.x > boundsRight || node.y < boundsTop || node.y > boundsBottom) continue;

            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            const isMultiSelected = state.selectionIds instanceof Set && state.selectionIds.has(String(node.id || ''));
            const isStatic = getStaticStateForNode(node).isStatic;
            const color = node.color || getMapThemeRgba('mapAccent', 0.6);

            if (isHovered || isSelected) {
                hoveredSelectedPaths.push({ node, isHovered, isSelected, isMultiSelected, isStatic });
                continue;
            }

            if (renderClustersOnly && node.kind !== 'category' && node.kind !== 'workspace') {
                if (i % 8 !== 0) continue; // Aggressive dot skipping at macro zoom
            }

            const simplifyLinks = isUltraMassive ? state.transform.scale < 0.5 : (isHyperMassive ? state.transform.scale < 0.35 : (isMassive && state.transform.scale < 0.15));
            if (simplifyLinks && node.kind === 'link') {
                if (!fillPathsByColor[color]) fillPathsByColor[color] = new Path2D();
                fillPathsByColor[color].rect(node.x - 2, node.y - 2, 4, 4);
                continue;
            }

            // Batch standard nodes
            if (!fillPathsByColor[color]) fillPathsByColor[color] = new Path2D();
            fillPathsByColor[color].moveTo(node.x + node.radius, node.y);
            fillPathsByColor[color].arc(node.x, node.y, node.radius, 0, Math.PI * 2);

            const nodeDepthForRings = node.data && typeof node.data.depth === 'number' ? node.data.depth : 0;
            const wsRingCount = node.kind === 'workspace' ? Math.abs(nodeDepthForRings + 2) : 0;
            const folderRingCount = node.kind === 'folder' && nodeDepthForRings > 0 ? nodeDepthForRings : 0;
            const effectiveRingCount = wsRingCount || folderRingCount;
            if (effectiveRingCount > 0) {
                const maxRings = Math.min(effectiveRingCount, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                const ringColor = getMapThemeRgba('titleColor', 0.4);
                if (!strokePathsByColor[ringColor]) strokePathsByColor[ringColor] = new Path2D();
                for (let r = 1; r <= maxRings; r++) {
                    const ringRadius = node.radius - (gap * r);
                    if (ringRadius > 0.5) {
                        strokePathsByColor[ringColor].moveTo(node.x + ringRadius, node.y);
                        strokePathsByColor[ringColor].arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                    }
                }
            }

            if (isMultiSelected) {
                multiSelectedPath.moveTo(node.x + node.radius + (4.6 / state.transform.scale), node.y);
                multiSelectedPath.arc(node.x, node.y, node.radius + (4.6 / state.transform.scale), 0, Math.PI * 2);
            }

            if (isStatic) {
                const staticColor = getMapThemeRgba('fxAccent', 0.74);
                if (!staticPathsByColor[staticColor]) staticPathsByColor[staticColor] = new Path2D();
                staticPathsByColor[staticColor].moveTo(node.x + node.radius + (2.8 / state.transform.scale), node.y);
                staticPathsByColor[staticColor].arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);
            }
        }

        // Draw Batches!
        for (const color in fillPathsByColor) {
            ctx.fillStyle = color;
            ctx.fill(fillPathsByColor[color]);
        }

        for (const color in strokePathsByColor) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 / state.transform.scale;
            ctx.stroke(strokePathsByColor[color]);
        }

        ctx.strokeStyle = getMapThemeRgba('mapAccent', 0.78);
        ctx.lineWidth = 1.2 / state.transform.scale;
        ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
        ctx.stroke(multiSelectedPath);
        ctx.setLineDash([]);

        for (const color in staticPathsByColor) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.6 / state.transform.scale;
            ctx.stroke(staticPathsByColor[color]);
        }

        // Draw hovered/selected individually so they get drop shadows correctly and render ON TOP
        for (let i = 0; i < hoveredSelectedPaths.length; i++) {
            const { node, isHovered, isSelected, isMultiSelected, isStatic } = hoveredSelectedPaths[i];
            const nodeColor = node.color || getMapThemeRgba('mapAccent', 0.6);
            
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = nodeColor;
            ctx.shadowBlur = 20 / state.transform.scale;
            ctx.shadowColor = nodeColor;
            ctx.fill();
            ctx.shadowBlur = 0;

            const hovDepth = node.data && typeof node.data.depth === 'number' ? node.data.depth : 0;
            const hovWsRings = node.kind === 'workspace' ? Math.abs(hovDepth + 2) : 0;
            const hovFolderRings = node.kind === 'folder' && hovDepth > 0 ? hovDepth : 0;
            const hovEffectiveRings = hovWsRings || hovFolderRings;
            if (hovEffectiveRings > 0) {
                const maxRings = Math.min(hovEffectiveRings, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                for (let r = 1; r <= maxRings; r++) {
                    const ringRadius = node.radius - (gap * r);
                    if (ringRadius > 0.5) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = getMapThemeRgba('titleColor', 0.4);
                        ctx.lineWidth = 1 / state.transform.scale;
                        ctx.stroke();
                    }
                }
            }

            ctx.lineWidth = 2 / state.transform.scale;
            ctx.strokeStyle = isStatic
                ? getMapThemeRgba('fxAccent', 0.98)
                : getMapThemeRgba('titleColor', 0.92);
            ctx.stroke();

            if (isMultiSelected && !isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (4.6 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.2 / state.transform.scale;
                ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
                ctx.strokeStyle = getMapThemeRgba('mapAccent', 0.78);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (isStatic) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.6 / state.transform.scale;
                ctx.strokeStyle = getMapThemeRgba('fxAccent', 0.74);
                ctx.stroke();
            }
        }

        // Rewire Overlay
        if (state.rewire?.enabled && rewireSourceNode) {
            ctx.beginPath();
            ctx.arc(rewireSourceNode.x, rewireSourceNode.y, rewireSourceNode.radius + 6.8, 0, Math.PI * 2);
            ctx.strokeStyle = getMapThemeRgba('mapAccent', 0.94);
            ctx.lineWidth = 2.1 / state.transform.scale;
            ctx.stroke();
            if (state.rewire.dragging) {
                const endX = rewireTargetNode ? rewireTargetNode.x : (Number(state.rewire.previewWorldX) || rewireSourceNode.x);
                const endY = rewireTargetNode ? rewireTargetNode.y : (Number(state.rewire.previewWorldY) || rewireSourceNode.y);
                ctx.beginPath();
                ctx.moveTo(Number(state.rewire.sourceStartX) || rewireSourceNode.x, Number(state.rewire.sourceStartY) || rewireSourceNode.y);
                ctx.lineTo(endX, endY);
                ctx.setLineDash([8 / state.transform.scale, 6 / state.transform.scale]);
                ctx.strokeStyle = rewireTargetNode
                    ? getMapThemeRgba('auraAccent', 0.88)
                    : getMapThemeRgba('mapAccent', 0.72);
                ctx.lineWidth = 1.8 / state.transform.scale;
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        ctx.restore();
        renderLabels(ctx);
        updateCursor();
    }


    state.renderInspector = renderInspector;



    ns._render = ns._render || {};



    Object.assign(ns._render, {

        requestDraw,

        renderHeader,

        renderInspector,

        renderToolbarState,

        updateInspectorCoverState,

        updateCursor,

        getScreenPoint,

        getNodeAnchor,

        draw

    });



})(window.EveConstellationMap);
