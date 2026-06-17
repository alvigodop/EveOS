const fs = require('fs');
const file = 'js/modules/features/constellation-map/constellation-map.render.js';
let content = fs.readFileSync(file, 'utf-8');

const regex = /function draw\(\) \{[\s\S]*?updateCursor\(\);\s*\n\s*\}/;

const replacement = `function draw() {
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
            state.edges.forEach((edge) => {
                if (edge.source.x < boundsLeft || edge.source.x > boundsRight || edge.source.y < boundsTop || edge.source.y > boundsBottom) {
                    if (edge.target.x < boundsLeft || edge.target.x > boundsRight || edge.target.y < boundsTop || edge.target.y > boundsBottom) return;
                }
                ctx.beginPath();
                ctx.moveTo(edge.source.x, edge.source.y);
                ctx.lineTo(edge.target.x, edge.target.y);
                ctx.strokeStyle = edge.type === 'tag' ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 212, 255, 0.28)';
                ctx.lineWidth = edge.type === 'tag' ? (0.9 / state.transform.scale) : (1.5 / state.transform.scale);
                ctx.stroke();
            });
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
            state.nodes.forEach((node) => {
                if (!validRewireTargets.has(String(node.id || ''))) return;
                const isActiveTarget = !!rewireTargetNode && rewireTargetNode.id === node.id;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + (isActiveTarget ? 7.6 : 5.4), 0, Math.PI * 2);
                ctx.strokeStyle = isActiveTarget ? 'rgba(122,255,196,0.92)' : 'rgba(158,219,255,0.34)';
                ctx.lineWidth = (isActiveTarget ? 2.2 : 1.15) / state.transform.scale;
                if (!isActiveTarget) ctx.setLineDash([4 / state.transform.scale, 4 / state.transform.scale]);
                ctx.stroke();
                ctx.setLineDash([]);
            });
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
    }`;

fs.writeFileSync(file, content.replace(regex, replacement));
console.log('REPLACED');
