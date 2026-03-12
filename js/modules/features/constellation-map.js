// --- CONSTELLATION MAP (Neural Core Phase II) ---
window.EveConstellationMap = window.EveConstellationMap || {};

(function(ns) {
    let canvas, ctx;
    let isRunning = false;
    let nodes = [];
    let edges = [];
    let animationFrameId;

    // A simple physics simulation for the force-directed graph
    function tickPhysics() {
        // Repulsion between nodes
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const n1 = nodes[i];
                const n2 = nodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const force = 1500 / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx -= fx;
                n1.vy -= fy;
                n2.vx += fx;
                n2.vy += fy;
            }
        }

        // Attraction along edges
        edges.forEach(edge => {
            const n1 = edge.source;
            const n2 = edge.target;
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const targetDist = 100;
            const force = (dist - targetDist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx += fx;
            n1.vy += fy;
            n2.vx -= fx;
            n2.vy -= fy;
        });

        // Center gravity
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        nodes.forEach(n => {
            const dx = cx - n.x;
            const dy = cy - n.y;
            n.vx += dx * 0.01;
            n.vy += dy * 0.01;

            // Apply velocity and friction
            n.x += n.vx;
            n.y += n.vy;
            n.vx *= 0.85;
            n.vy *= 0.85;
        });
    }

    function draw() {
        if (!isRunning) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw edges
        edges.forEach(edge => {
            ctx.beginPath();
            ctx.moveTo(edge.source.x, edge.source.y);
            ctx.lineTo(edge.target.x, edge.target.y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${edge.type === 'tag' ? 0.2 : 0.5})`;
            ctx.lineWidth = edge.type === 'tag' ? 1 : 2;
            ctx.stroke();
        });

        // Draw nodes
        nodes.forEach(n => {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();

            // Glow effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = n.color;
            ctx.fill();
            ctx.shadowBlur = 0; // reset

            // Text label
            if (n.radius > 3) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = '10px sans-serif';
                ctx.fillText(n.label, n.x + n.radius + 4, n.y + 4);
            }
        });

        tickPhysics();
        animationFrameId = requestAnimationFrame(draw);
    }

    function buildGraphData() {
        nodes = [];
        edges = [];
        const nodeMap = new Map();

        const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
        const allLinks = Array.isArray(window.eveState?.links) ? window.eveState.links.filter(l => l.workspace === workspaceId) : [];
        const folderApi = window.EveBookmarkFolders;

        const tagMap = new Map(); // to connect nodes with same tags

        // Add Categories as root nodes
        const categories = [...new Set(allLinks.map(l => l.category || 'Unsorted'))];
        categories.forEach(cat => {
            const id = `cat_${cat}`;
            const n = { id, x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: 0, vy: 0, radius: 12, color: '#f0f', label: cat };
            nodes.push(n);
            nodeMap.set(id, n);

            // Add Folders
            if (folderApi) {
                const view = folderApi.buildFolderView(workspaceId, cat, allLinks.filter(l => l.category === cat));
                view.nodes.forEach(f => {
                    const fid = `folder_${f.id}`;
                    const fn = { id: fid, x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: 0, vy: 0, radius: 8, color: '#aa00ff', label: f.name };
                    nodes.push(fn);
                    nodeMap.set(fid, fn);

                    // Link to parent or category
                    const parentId = f.parentId ? `folder_${f.parentId}` : id;
                    edges.push({ source: fn, target: nodeMap.get(parentId) || n, type: 'hierarchy' });
                });
            }
        });

        // Add links
        allLinks.forEach(l => {
            const id = `link_${l.id}`;
            const color = l.done ? '#888' : '#00d4ff';
            const n = { id, x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: 0, vy: 0, radius: 4, color, label: l.title || 'Link' };
            nodes.push(n);
            nodeMap.set(id, n);

            // Link to folder or category
            const parentId = l.folderId ? `folder_${l.folderId}` : `cat_${l.category || 'Unsorted'}`;
            const parentNode = nodeMap.get(parentId);
            if (parentNode) {
                edges.push({ source: n, target: parentNode, type: 'hierarchy' });
            }

            // Tag mapping for energy threads
            if (Array.isArray(l.tags)) {
                l.tags.forEach(t => {
                    if (!tagMap.has(t)) tagMap.set(t, []);
                    tagMap.get(t).push(n);
                });
            }
        });

        // Add tag edges
        tagMap.forEach(taggedNodes => {
            for (let i = 0; i < taggedNodes.length; i++) {
                for (let j = i + 1; j < taggedNodes.length; j++) {
                    edges.push({ source: taggedNodes[i], target: taggedNodes[j], type: 'tag' });
                }
            }
        });
    }

    ns.openMap = function() {
        if (isRunning) return;

        let container = document.getElementById('constellation-map-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'constellation-map-container';
            container.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: radial-gradient(circle at center, #1a1a2e 0%, #000 100%);
                z-index: 999999; display: flex; flex-direction: column;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                position: absolute; top: 20px; left: 20px; color: #fff; font-family: monospace;
                font-size: 1.2rem; pointer-events: none; text-shadow: 0 0 10px #00d4ff;
            `;
            header.innerHTML = 'NEURAL CORE :: CONSTELLATION MAP<br><span style="font-size:0.8rem; opacity:0.6;">Spatial Intelligence Mode</span>';
            container.appendChild(header);

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Exit Map';
            closeBtn.style.cssText = `
                position: absolute; top: 20px; right: 20px; z-index: 10;
                background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
                color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer;
            `;
            closeBtn.onclick = ns.closeMap;
            container.appendChild(closeBtn);

            canvas = document.createElement('canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            container.appendChild(canvas);

            document.body.appendChild(container);
            ctx = canvas.getContext('2d');

            window.addEventListener('resize', () => {
                if (canvas) {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                }
            });
        }

        container.style.display = 'block';
        buildGraphData();
        isRunning = true;
        draw();
    };

    ns.closeMap = function() {
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
        const container = document.getElementById('constellation-map-container');
        if (container) container.style.display = 'none';
    };

})(window.EveConstellationMap);
