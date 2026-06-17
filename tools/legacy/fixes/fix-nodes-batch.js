const fs = require('fs');
const file = 'js/modules/features/constellation-map/constellation-map.render.js';
let content = fs.readFileSync(file, 'utf-8');

const regex = /state\.nodes\.forEach\(\(node\) => \{[\s\S]*?\}\);/;

const replacement = `
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
        }`;

fs.writeFileSync(file, content.replace(regex, replacement));
console.log('NODES_BATCHED');
