window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const {
        state,
        text,
        isAuraVisualsEnabled,
        isAuraEmitterEnabled,
        getCardAuraShape,
        getFolderAuraShape,
        getWorkspaceAuraShape
    } = shared;
    const renderAnchors = ns._renderAnchors || {};
    const { stepAngleToward } = renderAnchors;

    function drawPhysicsAuras(ctx) {
        if (!isAuraVisualsEnabled()) return;

        const auraRoots = new Map();
        const storedAuraRoots = state.auraRoots instanceof Map ? state.auraRoots : new Map();
        const storedWorkspaceAuraRoots = state.workspaceAuraRoots instanceof Map ? state.workspaceAuraRoots : new Map();
        const activeChainIds = new Set();
        state.nodes.forEach((node) => {
            if (!node || !node.chainId) return;
            if (node.kind !== 'category' && node.kind !== 'workspace') return;
            if (!isAuraEmitterEnabled(node.kind, -1)) return;

            activeChainIds.add(node.chainId);

            const parentId = text(node?.data?.anchorNodeId, '');
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
            const workspaceAuraData = (node.kind === 'category' && parentNode?.kind === 'workspace')
                ? storedWorkspaceAuraRoots.get(parentNode.id)
                : null;
            const hasWorkspaceParentAura = !!workspaceAuraData && Number.isFinite(workspaceAuraData.frontAngle);
            let workspaceParentAngle = null;
            if (parentNode?.kind === 'workspace') {
                const pdx = parentNode.x - node.x;
                const pdy = parentNode.y - node.y;
                const pdist = Math.sqrt((pdx * pdx) + (pdy * pdy));
                if (pdist > 0.001) {
                    workspaceParentAngle = Math.atan2(pdy, pdx);
                }
            }

            const directFolders = state.nodes.filter((candidate) => {
                const parentId = text(candidate?.data?.anchorNodeId, '');
                return candidate.kind === 'folder' && parentId === node.id;
            });

            let frontX = 0;
            let frontY = -1;
            let frontAngle = -Math.PI / 2;

            const isDraggingRoot = state.pointer.mode === 'node' && state.pointer.node?.id === node.id;
            const dragDx = Number(state.pointer.releaseVx) || 0;
            const dragDy = Number(state.pointer.releaseVy) || 0;
            const dragDistSq = (dragDx * dragDx) + (dragDy * dragDy);

            if (isDraggingRoot && dragDistSq > 0.1) {
                const dragDist = Math.sqrt(dragDistSq);
                frontX = dragDx / dragDist;
                frontY = dragDy / dragDist;
                frontAngle = Math.atan2(frontY, frontX);
            } else if (hasWorkspaceParentAura) {
                frontAngle = Number.isFinite(workspaceParentAngle)
                    ? workspaceParentAngle
                    : workspaceAuraData.frontAngle;
                frontX = Math.cos(frontAngle);
                frontY = Math.sin(frontAngle);
            } else if (directFolders.length > 0) {
                let sumX = 0;
                let sumY = 0;
                directFolders.forEach((folder) => {
                    sumX += folder.x;
                    sumY += folder.y;
                });
                const avgX = sumX / directFolders.length;
                const avgY = sumY / directFolders.length;
                const dx = node.x - avgX;
                const dy = node.y - avgY;
                const dist = Math.sqrt((dx * dx) + (dy * dy));
                if (dist > 0.001) {
                    frontX = dx / dist;
                    frontY = dy / dist;
                    frontAngle = Math.atan2(frontY, frontX);
                }
            }

            const previousRoot = storedAuraRoots.get(node.chainId);
            if (!isDraggingRoot && hasWorkspaceParentAura && previousRoot) {
                const targetAngle = Number.isFinite(workspaceParentAngle)
                    ? workspaceParentAngle
                    : workspaceAuraData.frontAngle;
                const currentAngle = Number.isFinite(previousRoot.frontAngle)
                    ? previousRoot.frontAngle
                    : targetAngle;
                frontAngle = stepAngleToward(currentAngle, targetAngle, 0.26, 0.16);
                frontX = Math.cos(frontAngle);
                frontY = Math.sin(frontAngle);
            } else if (!isDraggingRoot && previousRoot && directFolders.length < 1) {
                frontAngle = Number.isFinite(previousRoot.frontAngle)
                    ? previousRoot.frontAngle
                    : frontAngle;
                frontX = Math.cos(frontAngle);
                frontY = Math.sin(frontAngle);
            } else if (previousRoot && !isDraggingRoot) {
                const targetAngle = frontAngle;
                const currentAngle = Number.isFinite(previousRoot.frontAngle)
                    ? previousRoot.frontAngle
                    : targetAngle;
                const smoothing = directFolders.length > 0 ? 0.028 : 0.05;
                const maxStep = directFolders.length > 0 ? 0.04 : 0.07;
                frontAngle = stepAngleToward(currentAngle, targetAngle, smoothing, maxStep);
                frontX = Math.cos(frontAngle);
                frontY = Math.sin(frontAngle);
            }

            const nextRoot = { node, frontX, frontY, frontAngle };
            auraRoots.set(node.chainId, nextRoot);
            storedAuraRoots.set(node.chainId, nextRoot);
        });

        Array.from(storedAuraRoots.keys()).forEach((chainId) => {
            if (!activeChainIds.has(chainId)) {
                storedAuraRoots.delete(chainId);
            }
        });

        state.auraRoots = storedAuraRoots;
        const workspaceAuraRoots = state.workspaceAuraRoots instanceof Map
            ? new Map(Array.from(state.workspaceAuraRoots.entries()).filter(([, data]) => data?.node))
            : new Map();
        if (!auraRoots.size && !workspaceAuraRoots.size) return;

        auraRoots.forEach((rootData) => {
            const root = rootData.node;
            if (!root) return;
            const angle = rootData.frontAngle || 0;
            const shape = getCardAuraShape(root);
            const radiusFront = shape.radiusFront;
            const radiusBack = shape.radiusBack;
            const radiusLat = shape.radiusLat;
            const zoomAlpha = Math.min(1.0, state.transform.scale * 2.5);

            ctx.save();
            ctx.translate(root.x, root.y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusFront, radiusLat, 0, -Math.PI / 2, Math.PI / 2);
            ctx.ellipse(0, 0, radiusBack, radiusLat, 0, Math.PI / 2, 3 * Math.PI / 2);
            ctx.closePath();
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(radiusFront, radiusLat));
            gradient.addColorStop(0, `rgba(122, 255, 196, ${0.015 * zoomAlpha})`);
            gradient.addColorStop(0.6, `rgba(122, 255, 196, ${0.005 * zoomAlpha})`);
            gradient.addColorStop(1, 'rgba(122, 255, 196, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.beginPath();
            ctx.strokeStyle = `rgba(122, 255, 196, ${0.06 * zoomAlpha})`;
            ctx.setLineDash([15, 45]);
            ctx.lineWidth = 1.0 / state.transform.scale;
            ctx.ellipse(0, 0, radiusFront * 0.92, radiusLat * 0.9, 0, -Math.PI / 2, Math.PI / 2);
            ctx.ellipse(0, 0, radiusBack * 0.92, radiusLat * 0.9, 0, Math.PI / 2, 3 * Math.PI / 2);
            ctx.stroke();
            ctx.restore();
        });

        workspaceAuraRoots.forEach((workspaceData) => {
            const root = workspaceData?.node;
            if (!root) return;
            if (!isAuraEmitterEnabled('workspace', -1)) return;

            const categoryCount = Math.max(1, Number(workspaceData.categories?.length) || 1);
            const shape = getWorkspaceAuraShape(root, categoryCount);
            const capsuleHalfWidth = shape.capsuleHalfWidth;
            const capsuleRadius = shape.capsuleRadius;
            const backOffset = shape.backOffset;
            const backAngle = Math.atan2(Number(workspaceData.backY) || 0, Number(workspaceData.backX) || -1);
            const zoomAlpha = Math.min(1.0, state.transform.scale * 2.8);

            ctx.save();
            ctx.translate(root.x, root.y);
            ctx.rotate(backAngle - (Math.PI / 2));

            const fillGradient = ctx.createLinearGradient(0, backOffset - capsuleRadius, 0, backOffset + capsuleRadius);
            fillGradient.addColorStop(0, `rgba(255, 209, 102, ${0.018 * zoomAlpha})`);
            fillGradient.addColorStop(0.5, `rgba(255, 209, 102, ${0.036 * zoomAlpha})`);
            fillGradient.addColorStop(1, 'rgba(255, 209, 102, 0)');
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.strokeStyle = fillGradient;
            ctx.lineWidth = capsuleRadius * 2;
            ctx.moveTo(-capsuleHalfWidth, backOffset);
            ctx.lineTo(capsuleHalfWidth, backOffset);
            ctx.stroke();

            ctx.beginPath();
            ctx.setLineDash([18, 40]);
            ctx.strokeStyle = `rgba(255, 209, 102, ${0.14 * zoomAlpha})`;
            ctx.lineWidth = 2.5 / Math.max(0.35, state.transform.scale);
            ctx.moveTo(-capsuleHalfWidth, backOffset);
            ctx.lineTo(capsuleHalfWidth, backOffset);
            ctx.stroke();
            ctx.restore();
        });

        state.nodes.forEach((node) => {
            if (!node || node.kind !== 'folder') return;
            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
            if (!isAuraEmitterEnabled('folder', nodeDepth)) return;
            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;
            if (!pNode) return;

            const pad = 1200;
            const left = -state.transform.x / state.transform.scale - pad;
            const top = -state.transform.y / state.transform.scale - pad;
            const right = (ctx.canvas.width - state.transform.x) / state.transform.scale + pad;
            const bottom = (ctx.canvas.height - state.transform.y) / state.transform.scale + pad;
            if (node.x < left || node.x > right || node.y < top || node.y > bottom) return;

            const isRoot = (pNode.kind === 'category' || pNode.kind === 'workspace');
            const fdx = pNode.x - node.x;
            const fdy = pNode.y - node.y;
            const fdist = Math.max(1, Math.sqrt(fdx * fdx + fdy * fdy));
            const fnx = fdx / fdist;
            const fny = fdy / fdist;
            const shape = getFolderAuraShape(node, fdist, isRoot);
            const radiusFront = shape.radiusFront;
            const radiusBack = shape.radiusBack;
            const radiusLat = shape.radiusLat;
            const angle = Math.atan2(fny, fnx);
            const centerX = node.x + fnx * shape.offsetDist;
            const centerY = node.y + fny * shape.offsetDist;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            const zoomAlpha = Math.min(1.0, state.transform.scale * 3.0);
            const showDetails = state.transform.scale > 0.15;
            const alpha = (isRoot ? 0.04 : 0.015) * zoomAlpha;
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusFront, radiusLat, 0, -Math.PI / 2, Math.PI / 2);
            const gradFront = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusLat);
            gradFront.addColorStop(0, `rgba(0, 212, 255, ${alpha})`);
            gradFront.addColorStop(1, 'rgba(0, 212, 255, 0)');
            ctx.fillStyle = gradFront;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusBack, radiusLat, 0, Math.PI / 2, 3 * Math.PI / 2);
            const gradBack = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusLat);
            gradBack.addColorStop(0, `rgba(0, 212, 255, ${alpha})`);
            gradBack.addColorStop(1, 'rgba(0, 212, 255, 0)');
            ctx.fillStyle = gradBack;
            ctx.fill();
            if (showDetails) {
                ctx.beginPath();
                ctx.strokeStyle = isRoot ? `rgba(0, 212, 255, ${0.12 * zoomAlpha})` : `rgba(0, 212, 255, ${0.06 * zoomAlpha})`;
                ctx.setLineDash([20, 60]);
                ctx.ellipse(0, 0, radiusFront, radiusLat * 0.9, 0, -Math.PI / 2, Math.PI / 2);
                ctx.ellipse(0, 0, radiusBack, radiusLat * 0.9, 0, Math.PI / 2, 3 * Math.PI / 2);
                ctx.stroke();
            }
            ctx.restore();
        });

        const zoomAlpha = Math.min(1.0, state.transform.scale * 3.0);
        state.nodes.forEach((node) => {
            if (!node || !node.chainId) return;
            const rootData = auraRoots.get(node.chainId);
            const root = rootData?.node;
            if (!rootData || !root || root === node) return;
            const rdx = node.x - root.x;
            const rdy = node.y - root.y;
            const rdist = Math.sqrt(rdx * rdx + rdy * rdy);

            if (rootData && rootData.node !== node) {
                const cfx = rootData.frontX;
                const cfy = rootData.frontY;
                const dx = node.x - rootData.node.x;
                const dy = node.y - rootData.node.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const projLong = dx * cfx + dy * cfy;
                const latX = -cfy;
                const latY = cfx;
                const distLat = Math.abs(dx * latX + dy * latY);
                const rootShape = getCardAuraShape(rootData.node);
                const rFront = rootShape.radiusFront;
                const rBack = rootShape.radiusBack;
                const rLat = rootShape.radiusLat;
                const rLong = projLong > 0 ? rFront : rBack;
                const normDistSq = Math.pow(distLat / rLat, 2) + Math.pow(projLong / rLong, 2);
                if (normDistSq < 1.0) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node.x + (dx / dist) * 35 / state.transform.scale, node.y + (dy / dist) * 35 / state.transform.scale);
                    ctx.strokeStyle = `rgba(200, 160, 255, ${0.08 * zoomAlpha})`;
                    ctx.lineWidth = 1.0 / state.transform.scale;
                    ctx.stroke();
                    if (projLong > 0) {
                        ctx.beginPath();
                        ctx.moveTo(node.x, node.y);
                        ctx.lineTo(node.x - cfx * 60 / state.transform.scale, node.y - cfy * 60 / state.transform.scale);
                        ctx.strokeStyle = `rgba(255, 180, 100, ${0.1 * zoomAlpha})`;
                        ctx.lineWidth = 1.5 / state.transform.scale;
                        ctx.stroke();
                    }
                }
            }

            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(node.x + (rdx / rdist) * 30 / state.transform.scale, node.y + (rdy / rdist) * 30 / state.transform.scale);
            ctx.strokeStyle = `rgba(122, 255, 196, ${0.12 * zoomAlpha})`;
            ctx.lineWidth = 1 / state.transform.scale;
            ctx.stroke();
        });
    }

    const renderAuras = ns._renderAuras = ns._renderAuras || {};
    Object.assign(renderAuras, { drawPhysicsAuras });
})(window.EveConstellationMap);
