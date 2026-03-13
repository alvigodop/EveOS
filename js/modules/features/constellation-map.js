// --- CONSTELLATION MAP (Neural Core Phase II) ---
window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    let canvas = null;
    let ctx = null;
    let container = null;
    let resizeHandler = null;
    let isRunning = false;
    let nodes = [];
    let edges = [];
    let animationFrameId = 0;

    const MAP_PADDING = 36;
    const MAX_TAG_EDGES_PER_CLUSTER = 10;
    const MAX_LINK_LABELS = 80;

    function getViewportSize() {
        return {
            width: Math.max(960, Math.floor(window.innerWidth || 0)),
            height: Math.max(640, Math.floor(window.innerHeight || 0))
        };
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function createNode({ id, label, color, radius, kind, x, y }) {
        return {
            id,
            label,
            color,
            radius,
            kind,
            x,
            y,
            vx: 0,
            vy: 0
        };
    }

    function placeOnRing(index, total, ringRadius, centerX, centerY, jitter = 0) {
        const count = Math.max(1, total);
        const angle = ((index % count) / count) * Math.PI * 2;
        const phase = ((index % 7) - 3) * jitter;
        return {
            x: centerX + Math.cos(angle) * (ringRadius + phase),
            y: centerY + Math.sin(angle) * (ringRadius + phase)
        };
    }

    function clampNodeToViewport(node, width, height) {
        const minX = MAP_PADDING + node.radius;
        const maxX = width - MAP_PADDING - node.radius;
        const minY = MAP_PADDING + node.radius;
        const maxY = height - MAP_PADDING - node.radius;

        if (node.x < minX) {
            node.x = minX;
            node.vx *= -0.35;
        } else if (node.x > maxX) {
            node.x = maxX;
            node.vx *= -0.35;
        }

        if (node.y < minY) {
            node.y = minY;
            node.vy *= -0.35;
        } else if (node.y > maxY) {
            node.y = maxY;
            node.vy *= -0.35;
        }
    }

    function tickPhysics() {
        const { width, height } = getViewportSize();
        const nodeCount = Math.max(1, nodes.length);
        const centerX = width / 2;
        const centerY = height / 2;
        const pairStride = nodeCount > 220 ? 5 : nodeCount > 160 ? 4 : nodeCount > 120 ? 3 : nodeCount > 80 ? 2 : 1;
        const repulsionStrength = nodeCount > 220 ? 800 : nodeCount > 140 ? 1100 : 1500;
        const springStrength = nodeCount > 220 ? 0.022 : nodeCount > 140 ? 0.03 : 0.05;
        const targetDist = nodeCount > 220 ? 52 : nodeCount > 140 ? 64 : 96;
        const centerPull = nodeCount > 220 ? 0.0025 : nodeCount > 140 ? 0.004 : 0.006;
        const maxVelocity = nodeCount > 220 ? 7 : nodeCount > 140 ? 9 : 12;

        for (let i = 0; i < nodes.length; i += 1) {
            for (let j = i + 1; j < nodes.length; j += 1) {
                if (pairStride > 1 && ((i + j) % pairStride) !== 0) continue;
                const n1 = nodes[i];
                const n2 = nodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const distSq = Math.max((dx * dx) + (dy * dy), 16);
                const dist = Math.sqrt(distSq);
                const force = repulsionStrength / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx -= fx;
                n1.vy -= fy;
                n2.vx += fx;
                n2.vy += fy;
            }
        }

        edges.forEach((edge) => {
            const n1 = edge.source;
            const n2 = edge.target;
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt((dx * dx) + (dy * dy)) || 1;
            const adjustedTarget = edge.type === 'tag' ? Math.max(40, targetDist - 16) : targetDist;
            const force = (dist - adjustedTarget) * springStrength;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx += fx;
            n1.vy += fy;
            n2.vx -= fx;
            n2.vy -= fy;
        });

        nodes.forEach((node) => {
            node.vx += (centerX - node.x) * centerPull;
            node.vy += (centerY - node.y) * centerPull;

            const speed = Math.hypot(node.vx, node.vy);
            if (speed > maxVelocity) {
                const scale = maxVelocity / speed;
                node.vx *= scale;
                node.vy *= scale;
            }

            node.x += node.vx;
            node.y += node.vy;
            node.vx *= 0.84;
            node.vy *= 0.84;
            clampNodeToViewport(node, width, height);
        });
    }

    function draw() {
        if (!isRunning || !canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        edges.forEach((edge) => {
            ctx.beginPath();
            ctx.moveTo(edge.source.x, edge.source.y);
            ctx.lineTo(edge.target.x, edge.target.y);
            ctx.strokeStyle = edge.type === 'tag' ? 'rgba(0, 212, 255, 0.14)' : 'rgba(0, 212, 255, 0.42)';
            ctx.lineWidth = edge.type === 'tag' ? 1 : 1.8;
            ctx.stroke();
        });

        const showLinkLabels = nodes.length <= MAX_LINK_LABELS;
        nodes.forEach((node) => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            ctx.shadowBlur = 12;
            ctx.shadowColor = node.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            const showLabel = node.kind !== 'link' || showLinkLabels;
            if (showLabel && node.radius > 3) {
                ctx.fillStyle = 'rgba(255,255,255,0.74)';
                ctx.font = '10px sans-serif';
                ctx.fillText(node.label, node.x + node.radius + 4, node.y + 4);
            }
        });

        tickPhysics();
        animationFrameId = requestAnimationFrame(draw);
    }

    function buildGraphData() {
        nodes = [];
        edges = [];
        const nodeMap = new Map();
        const { width, height } = getViewportSize();
        const centerX = width / 2;
        const centerY = height / 2;

        const workspaceId = window.eveState?.config?.activeWorkspace || 'main';
        const allLinks = Array.isArray(window.eveState?.links)
            ? window.eveState.links.filter((link) => String(link?.workspace || 'main') === String(workspaceId))
            : [];
        const folderApi = window.EveBookmarkFolders;
        const tagMap = new Map();
        const categoryBuckets = new Map();

        allLinks.forEach((link) => {
            const category = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            if (!categoryBuckets.has(category)) categoryBuckets.set(category, []);
            categoryBuckets.get(category).push(link);
        });

        const categories = Array.from(categoryBuckets.keys()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
        const categoryNodes = new Map();
        const realFolderIds = new Set();

        categories.forEach((category, index) => {
            const position = placeOnRing(index, categories.length, Math.min(width, height) * 0.2, centerX, centerY, 18);
            const node = createNode({
                id: `cat_${category}`,
                label: category,
                color: '#ff4df1',
                radius: 12,
                kind: 'category',
                x: position.x,
                y: position.y
            });
            nodes.push(node);
            nodeMap.set(node.id, node);
            categoryNodes.set(category, node);
        });

        categories.forEach((category) => {
            if (!folderApi?.buildFolderView) return;
            const linksForCategory = categoryBuckets.get(category) || [];
            const view = folderApi.buildFolderView(workspaceId, category, linksForCategory);
            const realFolders = (Array.isArray(view?.nodes) ? view.nodes : []).filter((folder) => !folder?.isGhost);
            const categoryNode = categoryNodes.get(category);
            realFolders.forEach((folder, index) => {
                const position = placeOnRing(index, Math.max(realFolders.length, 1), 72 + ((index % 4) * 10), categoryNode.x, categoryNode.y, 10);
                const node = createNode({
                    id: `folder_${folder.id}`,
                    label: folder.name,
                    color: '#aa00ff',
                    radius: 8,
                    kind: 'folder',
                    x: position.x,
                    y: position.y
                });
                nodes.push(node);
                nodeMap.set(node.id, node);
                realFolderIds.add(folder.id);
            });

            realFolders.forEach((folder) => {
                const folderNode = nodeMap.get(`folder_${folder.id}`);
                if (!folderNode) return;
                const parentId = folder.parentId && realFolderIds.has(folder.parentId)
                    ? `folder_${folder.parentId}`
                    : `cat_${category}`;
                const parentNode = nodeMap.get(parentId) || categoryNode;
                edges.push({ source: folderNode, target: parentNode, type: 'hierarchy' });
            });
        });

        categories.forEach((category) => {
            const linksForCategory = categoryBuckets.get(category) || [];
            const categoryNode = categoryNodes.get(category);
            linksForCategory.forEach((link, index) => {
                const parentId = link?.folderId && realFolderIds.has(String(link.folderId))
                    ? `folder_${String(link.folderId)}`
                    : `cat_${category}`;
                const parentNode = nodeMap.get(parentId) || categoryNode;
                const position = placeOnRing(index, Math.max(linksForCategory.length, 1), 54 + ((index % 6) * 8), parentNode.x, parentNode.y, 6);
                const node = createNode({
                    id: `link_${link.id}`,
                    label: String(link?.title || 'Link'),
                    color: link?.done ? '#7c7c7c' : '#00d4ff',
                    radius: 4,
                    kind: 'link',
                    x: position.x,
                    y: position.y
                });
                nodes.push(node);
                nodeMap.set(node.id, node);
                if (parentNode) edges.push({ source: node, target: parentNode, type: 'hierarchy' });

                if (Array.isArray(link?.tags)) {
                    link.tags
                        .map((tag) => String(tag || '').trim())
                        .filter(Boolean)
                        .forEach((tag) => {
                            if (!tagMap.has(tag)) tagMap.set(tag, []);
                            tagMap.get(tag).push(node);
                        });
                }
            });
        });

        tagMap.forEach((taggedNodes) => {
            const uniqueNodes = Array.from(new Set(taggedNodes));
            if (uniqueNodes.length < 2) return;
            const anchor = uniqueNodes[0];
            const maxEdges = Math.min(uniqueNodes.length - 1, MAX_TAG_EDGES_PER_CLUSTER);
            for (let index = 1; index <= maxEdges; index += 1) {
                edges.push({ source: anchor, target: uniqueNodes[index], type: 'tag' });
            }
        });
    }

    function ensureContainer() {
        if (container) return container;
        container = document.getElementById('constellation-map-container');
        if (container) return container;

        container = document.createElement('div');
        container.id = 'constellation-map-container';
        container.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100vw',
            'height:100vh',
            'overflow:hidden',
            'background:radial-gradient(circle at center, #1a1a2e 0%, #000 100%)',
            'z-index:999999',
            'display:flex',
            'flex-direction:column'
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = [
            'position:absolute',
            'top:20px',
            'left:20px',
            'color:#fff',
            'font-family:monospace',
            'font-size:1.2rem',
            'pointer-events:none',
            'text-shadow:0 0 10px #00d4ff',
            'z-index:2'
        ].join(';');
        header.innerHTML = 'NEURAL CORE :: CONSTELLATION MAP<br><span style="font-size:0.8rem; opacity:0.6;">Spatial Intelligence Mode</span>';
        container.appendChild(header);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Exit Map';
        closeBtn.style.cssText = [
            'position:absolute',
            'top:20px',
            'right:20px',
            'z-index:10',
            'background:rgba(255,255,255,0.1)',
            'border:1px solid rgba(255,255,255,0.2)',
            'color:#fff',
            'padding:8px 16px',
            'border-radius:4px',
            'cursor:pointer'
        ].join(';');
        closeBtn.onclick = ns.closeMap;
        container.appendChild(closeBtn);

        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        container.appendChild(canvas);
        document.body.appendChild(container);
        ctx = canvas.getContext('2d');

        resizeHandler = () => {
            if (!canvas) return;
            const { width, height } = getViewportSize();
            canvas.width = width;
            canvas.height = height;
        };
        window.addEventListener('resize', resizeHandler);
        resizeHandler();
        return container;
    }

    ns.__debugGetGraphStats = function () {
        const { width, height } = getViewportSize();
        const outOfBounds = nodes.filter((node) => (
            node.x < -node.radius
            || node.y < -node.radius
            || node.x > width + node.radius
            || node.y > height + node.radius
        )).length;
        return {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            outOfBounds,
            isRunning
        };
    };

    ns.openMap = function () {
        if (isRunning) return;
        ensureContainer();
        if (!canvas || !ctx) return;
        container.style.display = 'block';
        buildGraphData();
        isRunning = true;
        draw();
    };

    ns.closeMap = function () {
        isRunning = false;
        cancelAnimationFrame(animationFrameId);
        const currentContainer = document.getElementById('constellation-map-container');
        if (currentContainer) currentContainer.style.display = 'none';
    };
})(window.EveConstellationMap);
