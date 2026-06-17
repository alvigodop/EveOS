const fs = require('fs');
const file = 'js/modules/features/constellation-map/constellation-map.render.js';
let content = fs.readFileSync(file, 'utf-8');

const regex = /if \(!hideEdges\) \{[\s\S]*?\}\n\n        const rewireSourceNode/;

const replacement = `if (!hideEdges) {
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

        const rewireSourceNode`;

fs.writeFileSync(file, content.replace(regex, replacement));
console.log('EDGES_BATCHED');
