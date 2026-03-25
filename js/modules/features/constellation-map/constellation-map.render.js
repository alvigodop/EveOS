window.EveConstellationMap = window.EveConstellationMap || {};



(function (ns) {



    const shared = ns._shared || {};

    const {

        state,

        getStaticStateForNode,

        text

    } = shared;



    const renderCanvas = ns._renderCanvas || {};

    const {

        getNodeAnchor,

        getScreenPoint,

        renderLabels,

        drawPhysicsAuras

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

        const boundsLeft = -state.transform.tx / state.transform.scale - 500;
        const boundsTop = -state.transform.ty / state.transform.scale - 500;
        const boundsRight = (ctx.canvas.width - state.transform.tx) / state.transform.scale + 500;
        const boundsBottom = (ctx.canvas.height - state.transform.ty) / state.transform.scale + 500;
        const isMassive = state.nodes.length > 500;
        const hideEdges = state.transform.scale < 0.25 && isMassive;

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

            ctx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
            ctx.lineWidth = 0.9 / state.transform.scale;
            ctx.stroke(tagPath);

            ctx.strokeStyle = 'rgba(0, 212, 255, 0.28)';
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

        if (state.rewire?.enabled && rewireSourceNode) {
            ctx.save();
            
        const pathsByColor = {};
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
            const color = node.color || '#444';

            if (isHovered || isSelected) {
                hoveredSelectedPaths.push({ node, isHovered, isSelected, isMultiSelected, isStatic });
                continue;
            }

            if (isMassive && state.transform.scale < 0.15 && node.kind === 'link') {
                if (!pathsByColor[color]) pathsByColor[color] = new Path2D();
                pathsByColor[color].rect(node.x - 2, node.y - 2, 4, 4);
                continue;
            }

            // Batch standard nodes
            if (!pathsByColor[color]) pathsByColor[color] = new Path2D();
            pathsByColor[color].moveTo(node.x + node.radius, node.y);
            pathsByColor[color].arc(node.x, node.y, node.radius, 0, Math.PI * 2);

            if (node.kind === 'folder' && node.data && typeof node.data.depth === 'number' && node.data.depth > 0) {
                const maxRings = Math.min(node.data.depth, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                if (!pathsByColor['rgba(255, 255, 255, 0.4)']) pathsByColor['rgba(255, 255, 255, 0.4)'] = new Path2D();
                for (let r = 1; r <= maxRings; r++) {
                    const ringRadius = node.radius - (gap * r);
                    if (ringRadius > 0.5) {
                        pathsByColor['rgba(255, 255, 255, 0.4)'].moveTo(node.x + ringRadius, node.y);
                        pathsByColor['rgba(255, 255, 255, 0.4)'].arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                    }
                }
            }

            if (isMultiSelected) {
                multiSelectedPath.moveTo(node.x + node.radius + (4.6 / state.transform.scale), node.y);
                multiSelectedPath.arc(node.x, node.y, node.radius + (4.6 / state.transform.scale), 0, Math.PI * 2);
            }

            if (isStatic) {
                if (!staticPathsByColor['rgba(255,214,90,0.74)']) staticPathsByColor['rgba(255,214,90,0.74)'] = new Path2D();
                staticPathsByColor['rgba(255,214,90,0.74)'].moveTo(node.x + node.radius + (2.8 / state.transform.scale), node.y);
                staticPathsByColor['rgba(255,214,90,0.74)'].arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);
            }
        }

        // Draw Batches!
        for (const color in pathsByColor) {
            if (color === 'rgba(255, 255, 255, 0.4)') {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 / state.transform.scale;
                ctx.stroke(pathsByColor[color]);
            } else {
                ctx.fillStyle = color;
                ctx.fill(pathsByColor[color]);
            }
        }

        ctx.strokeStyle = 'rgba(145,220,255,0.78)';
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
            
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            ctx.shadowBlur = 20 / state.transform.scale;
            ctx.shadowColor = node.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (node.kind === 'folder' && node.data && typeof node.data.depth === 'number' && node.data.depth > 0) {
                const maxRings = Math.min(node.data.depth, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                for (let r = 1; r <= maxRings; r++) {
                    const ringRadius = node.radius - (gap * r);
                    if (ringRadius > 0.5) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.lineWidth = 1 / state.transform.scale;
                        ctx.stroke();
                    }
                }
            }

            ctx.lineWidth = 2 / state.transform.scale;
            ctx.strokeStyle = isStatic ? 'rgba(255,214,90,0.98)' : 'rgba(255,255,255,0.92)';
            ctx.stroke();

            if (isMultiSelected && !isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (4.6 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.2 / state.transform.scale;
                ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
                ctx.strokeStyle = 'rgba(145,220,255,0.78)';
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (isStatic) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.6 / state.transform.scale;
                ctx.strokeStyle = 'rgba(255,214,90,0.74)';
                ctx.stroke();
            }
        }
            ctx.beginPath();
            ctx.arc(rewireSourceNode.x, rewireSourceNode.y, rewireSourceNode.radius + 6.8, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(145,220,255,0.94)';
            ctx.lineWidth = 2.1 / state.transform.scale;
            ctx.stroke();
            if (state.rewire.dragging) {
                const endX = rewireTargetNode ? rewireTargetNode.x : (Number(state.rewire.previewWorldX) || rewireSourceNode.x);
                const endY = rewireTargetNode ? rewireTargetNode.y : (Number(state.rewire.previewWorldY) || rewireSourceNode.y);
                ctx.beginPath();
                ctx.moveTo(Number(state.rewire.sourceStartX) || rewireSourceNode.x, Number(state.rewire.sourceStartY) || rewireSourceNode.y);
                ctx.lineTo(endX, endY);
                ctx.setLineDash([8 / state.transform.scale, 6 / state.transform.scale]);
                ctx.strokeStyle = rewireTargetNode ? 'rgba(122,255,196,0.88)' : 'rgba(145,220,255,0.72)';
                ctx.lineWidth = 1.8 / state.transform.scale;
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        state.nodes.forEach((node) => {
            if (node.x < boundsLeft || node.x > boundsRight || node.y < boundsTop || node.y > boundsBottom) return;

            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            const isMultiSelected = state.selectionIds instanceof Set && state.selectionIds.has(String(node.id || ''));

            if (isMassive && state.transform.scale < 0.15 && !isHovered && !isSelected && node.kind === 'link') {
                ctx.fillStyle = node.color || '#444';
                ctx.fillRect(node.x - 2, node.y - 2, 4, 4);
                return;
            }

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            if (isHovered || isSelected) {
                ctx.shadowBlur = 20 / state.transform.scale;
                ctx.shadowColor = node.color;
            } else if (!isMassive) {
                ctx.shadowBlur = 10 / state.transform.scale;
                ctx.shadowColor = node.color;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.fill();
            ctx.shadowBlur = 0;

            if (node.kind === 'folder' && node.data && typeof node.data.depth === 'number' && node.data.depth > 0) {
                const maxRings = Math.min(node.data.depth, 4);
                const gap = Math.max(1.5, node.radius / (maxRings + 1.5));
                for (let i = 1; i <= maxRings; i++) {
                    const ringRadius = node.radius - (gap * i);
                    if (ringRadius > 0.5) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.lineWidth = 1 / state.transform.scale;
                        ctx.stroke();
                    }
                }
            }

            if (isHovered || isSelected || isMultiSelected) {
                ctx.lineWidth = 2 / state.transform.scale;
                ctx.strokeStyle = getStaticStateForNode(node).isStatic ? 'rgba(255,214,90,0.98)' : 'rgba(255,255,255,0.92)';
                ctx.stroke();
            }
            if (isMultiSelected && !isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (4.6 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.2 / state.transform.scale;
                ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
                ctx.strokeStyle = 'rgba(145,220,255,0.78)';
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (getStaticStateForNode(node).isStatic) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (2.8 / state.transform.scale), 0, Math.PI * 2);
                ctx.lineWidth = 1.6 / state.transform.scale;
                ctx.strokeStyle = 'rgba(255,214,90,0.74)';
                ctx.stroke();
            }
        });

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
