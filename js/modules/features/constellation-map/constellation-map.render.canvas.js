window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};

    const {

        state,

        KIND_ORDER,

        LABEL_CURSOR_RADIUS,

        LABEL_FOCUS_LIMIT,

        getNodePolarityState,

        getNodeCoverUrl,

        scheduleInspectorCoverRotation,

        getStaticStateForNode,

        escapeHtml,

        text

    } = shared;

    function getManualAnchorTarget(anchor) {

        if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {

            return { x: 0, y: 0 };

        }

        const driftRadius = Math.max(0, Number(anchor.driftRadius) || 0);

        if (!driftRadius) {

            return { x: anchor.x, y: anchor.y };

        }

        const speed = Math.max(0.0001, Number(anchor.speed) || 0.0004);

        const phase = Number(anchor.phase) || 0;

        const now = Date.now();

        return {

            x: anchor.x + (Math.cos((now * speed) + phase) * driftRadius),

            y: anchor.y + (Math.sin((now * speed * 0.87) + (phase * 1.19)) * driftRadius * 0.78)

        };

    }

    function normalizeAngle(angle) {

        let value = Number.isFinite(angle) ? angle : 0;

        while (value <= -Math.PI) value += Math.PI * 2;

        while (value > Math.PI) value -= Math.PI * 2;

        return value;

    }

    function stepAngleToward(current, target, factor, maxStep) {

        const currentAngle = normalizeAngle(current);

        const targetAngle = normalizeAngle(target);

        let delta = normalizeAngle(targetAngle - currentAngle);

        delta *= Math.max(0, Math.min(1, Number(factor) || 0));

        const stepLimit = Math.max(0.0001, Number(maxStep) || 0.0001);

        if (delta > stepLimit) delta = stepLimit;

        if (delta < -stepLimit) delta = -stepLimit;

        return normalizeAngle(currentAngle + delta);

    }

    function getNodeAnchor(node) {

        if (node?.manualAnchor && Number.isFinite(node.manualAnchor.x) && Number.isFinite(node.manualAnchor.y)) {

            return getManualAnchorTarget(node.manualAnchor);

        }

        // Check for physics-calculated optimal hierarchy anchor (link placement)
        const optimal = state.hierarchyAnchors && state.hierarchyAnchors.get(node.id);
        if (optimal) return optimal;

        const anchorNodeId = text(node?.data?.anchorNodeId, '');

        if (anchorNodeId) {

            const anchorNode = state.nodeIndex.get(anchorNodeId);

            if (anchorNode) {

                return { x: anchorNode.x, y: anchorNode.y };

            }

        }

        return state.worldAnchor || { x: 0, y: 0 };

    }

    function getScreenPoint(node) {

        return {

            x: (node.x * state.transform.scale) + state.transform.tx,

            y: (node.y * state.transform.scale) + state.transform.ty

        };

    }



    function shouldRenderLabel(node, isHovered, isSelected) {

        if (state.labelMode === 'off') return false;

        if (isHovered || isSelected) return true;

        if (node.kind !== 'link') return state.labelMode !== 'off';

        if (state.labelMode === 'focus') return false;

        if (state.labelMode === 'all') return true;

        return true;

    }



    function getAutoLinkLabelBudget() {

        const nodeCount = state.nodes.length;

        const scale = state.transform.scale;

        if (state.labelMode === 'all') return Infinity;

        if (state.labelMode === 'focus') return 0;

        if (nodeCount > 5000) return scale >= 2.8 ? 480 : scale >= 1.85 ? 200 : 90;

        if (nodeCount > 2500) return scale >= 2.6 ? 420 : scale >= 1.7 ? 180 : 80;

        if (nodeCount > 1200) return scale >= 2.4 ? 320 : scale >= 1.55 ? 140 : 60;

        if (nodeCount > 500) return scale >= 2.1 ? 240 : scale >= 1.4 ? 110 : 40;

        if (nodeCount > 220) return scale >= 1.8 ? 170 : scale >= 1.25 ? 90 : 34;

        if (nodeCount > 120) return scale >= 1.45 ? 120 : 56;

        return Infinity;

    }



    function getCursorFocusIds() {

        const focusIds = new Set();

        const pointerX = Number(state.pointer.canvasX);

        const pointerY = Number(state.pointer.canvasY);

        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return focusIds;



        const ranked = [];

        state.nodes.forEach((node) => {

            const point = getScreenPoint(node);

            const dx = point.x - pointerX;

            const dy = point.y - pointerY;

            const distSq = (dx * dx) + (dy * dy);

            if (distSq > (LABEL_CURSOR_RADIUS * LABEL_CURSOR_RADIUS)) return;

            ranked.push({ node, distSq });

        });



        ranked.sort((left, right) => left.distSq - right.distSq);

        ranked.slice(0, LABEL_FOCUS_LIMIT).forEach((entry) => {

            focusIds.add(entry.node.id);

        });

        return focusIds;

    }



    function getLabelBackdropColor(box) {

        if (box.isSelected) return 'rgba(12, 20, 32, 0.82)';

        if (box.isHovered) return 'rgba(8, 18, 30, 0.76)';

        if (box.node.kind === 'link') return 'rgba(6, 12, 22, 0.52)';

        return 'rgba(6, 12, 22, 0.66)';

    }



    function drawRoundedBackdrop(ctx, box) {

        const width = Math.max(12, box.right - box.left);

        const height = Math.max(12, box.bottom - box.top);

        const radius = Math.min(8, Math.max(5, height * 0.38));

        ctx.beginPath();

        if (typeof ctx.roundRect === 'function') {

            ctx.roundRect(box.left, box.top, width, height, radius);

        } else {

            ctx.moveTo(box.left + radius, box.top);

            ctx.lineTo(box.right - radius, box.top);

            ctx.quadraticCurveTo(box.right, box.top, box.right, box.top + radius);

            ctx.lineTo(box.right, box.bottom - radius);

            ctx.quadraticCurveTo(box.right, box.bottom, box.right - radius, box.bottom);

            ctx.lineTo(box.left + radius, box.bottom);

            ctx.quadraticCurveTo(box.left, box.bottom, box.left, box.bottom - radius);

            ctx.lineTo(box.left, box.top + radius);

            ctx.quadraticCurveTo(box.left, box.top, box.left + radius, box.top);

        }

        ctx.closePath();

        ctx.fillStyle = getLabelBackdropColor(box);

        ctx.fill();

    }



    function renderLabels(ctx) {

        state.labelHitBoxes = [];

        if (state.labelMode === 'off') return;

        const focusIds = getCursorFocusIds();

        const searchMatchIds = new Set((state.searchState.matches || []).map((match) => match.id));

        const autoLinkBudget = getAutoLinkLabelBudget();



        const candidates = state.nodes.map((node) => {

            const isHovered = state.hovered && state.hovered.id === node.id;

            const isSelected = state.selected && state.selected.id === node.id;

            const isPointerFocused = focusIds.has(node.id);

            const isSearchMatch = searchMatchIds.has(node.id);

            if (!shouldRenderLabel(node, isHovered, isSelected)) return null;

            if (

                state.labelMode === 'focus'

                && node.kind === 'link'

                && !isHovered

                && !isSelected

                && !isPointerFocused

                && !isSearchMatch

            ) {

                return null;

            }



            const point = getScreenPoint(node);

            const fontSize = isSelected || isHovered

                ? 13

                : node.kind === 'workspace'

                    ? 12.5

                    : node.kind === 'category' || node.kind === 'folder'

                        ? 12

                        : (state.labelMode === 'all' ? 10.5 : 10);

            const textX = point.x + (node.radius * state.transform.scale) + 8;

            const textY = point.y + (isHovered || isSelected ? 5 : 4);

            ctx.font = `${fontSize}px sans-serif`;

            const textWidth = ctx.measureText(node.label).width;

            const box = {

                node,

                left: textX - 6,

                right: textX + textWidth + 8,

                top: textY - fontSize - 5,

                bottom: textY + 8,

                fontSize,

                textX,

                textY,

                isHovered,

                isSelected,

                isPointerFocused,

                isSearchMatch,

                priority: (isSelected ? 100 : 0)

                    + (isHovered ? 60 : 0)

                    + (isPointerFocused ? 40 : 0)

                    + (isSearchMatch ? 32 : 0)

                    + (node.kind === 'workspace' ? 40 : 0)

                    + (node.kind === 'category' ? 32 : 0)

                    + (node.kind === 'folder' ? 24 : 0)

                    + Math.min(node.radius, 12)

            };

            return box;

        }).filter(Boolean);



        candidates.sort((left, right) => {

            if (right.priority !== left.priority) return right.priority - left.priority;

            if (left.node.kind === 'link' && right.node.kind !== 'link') return 1;

            if (left.node.kind !== 'link' && right.node.kind === 'link') return -1;

            return left.node.label.localeCompare(right.node.label, undefined, { sensitivity: 'base' });

        });



        const occupied = [];

        let renderedLinkLabels = 0;

        candidates.forEach((box) => {

            if (

                state.labelMode === 'auto'

                && box.node.kind === 'link'

                && !box.isHovered

                && !box.isSelected

                && !box.isPointerFocused

                && !box.isSearchMatch

                && autoLinkBudget !== Infinity

                && renderedLinkLabels >= autoLinkBudget

            ) {

                return;

            }

            const allowOverlap = state.labelMode === 'all'

                ? (box.isHovered || box.isSelected)

                : false;

            if (!allowOverlap && state.labelMode === 'auto') {

                const overlaps = occupied.some((taken) => !(

                    box.right < taken.left

                    || box.left > taken.right

                    || box.bottom < taken.top

                    || box.top > taken.bottom

                ));

                if (overlaps && box.node.kind === 'link' && !box.isHovered && !box.isSelected) {

                    return;

                }

            }



            state.labelHitBoxes.push(box);

            occupied.push(box);

            if (box.node.kind === 'link') renderedLinkLabels += 1;



            const labelOpacity = box.isSelected

                ? 0.98

                : box.isHovered

                    ? 0.94

                    : box.isPointerFocused || box.isSearchMatch

                        ? 0.9

                    : box.node.kind === 'link'

                        ? (state.labelMode === 'all' ? 0.62 : 0.78)

                        : 0.88;

            ctx.font = `${box.fontSize}px sans-serif`;

            ctx.lineJoin = 'round';

            drawRoundedBackdrop(ctx, box);

            ctx.strokeStyle = 'rgba(4, 10, 18, 0.82)';

            ctx.lineWidth = box.isSelected || box.isHovered ? 4.4 : 3.2;

            ctx.shadowBlur = box.isHovered || box.isSelected ? 12 : 6;

            ctx.shadowColor = 'rgba(0,0,0,0.5)';

            ctx.strokeText(box.node.label, box.textX, box.textY);

            ctx.shadowBlur = 0;

            ctx.fillStyle = `rgba(255,255,255,${labelOpacity})`;

            ctx.fillText(box.node.label, box.textX, box.textY);

        });

    }



    function drawPhysicsAuras(ctx) {
        if (!state.showPhysicsAuras) return;

        const auraRoots = new Map();
        const storedAuraRoots = state.auraRoots instanceof Map ? state.auraRoots : new Map();
        const activeChainIds = new Set();
        state.nodes.forEach((node) => {
            if (!node || !node.chainId) return;
            if (node.kind !== 'category' && node.kind !== 'workspace') return;

            activeChainIds.add(node.chainId);

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
            if (!isDraggingRoot && previousRoot && directFolders.length < 1) {
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

            const nextRoot = {
                node,
                frontX,
                frontY,
                frontAngle
            };

            auraRoots.set(node.chainId, nextRoot);
            storedAuraRoots.set(node.chainId, nextRoot);
        });

        Array.from(storedAuraRoots.keys()).forEach((chainId) => {
            if (!activeChainIds.has(chainId)) {
                storedAuraRoots.delete(chainId);
            }
        });

        state.auraRoots = storedAuraRoots;

        if (!auraRoots.size) return;

        // 1. Draw Root Authority Glows (Asymmetric Teardrop)
        auraRoots.forEach((rootData) => {
            const root = rootData.node;
            if (!root) return;
            
            // Use physics-calculated orientation for perfect alignment
            const angle = rootData.frontAngle || 0;
            const baseRad = root.radius || 120; // Default to larger base if undefined
            const radiusFront = baseRad * 18.0; 
            const radiusBack = baseRad * 5.0; 
            const radiusLat = baseRad * 10.0; 

            // Zoom-based alpha scaling to prevent brightness spikes when zoomed out
            const zoomAlpha = Math.min(1.0, state.transform.scale * 2.5);

            ctx.save();
            ctx.translate(root.x, root.y);
            ctx.rotate(angle);
            
            // Unified Teardrop Path for Glow
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusFront, radiusLat, 0, -Math.PI/2, Math.PI/2);
            ctx.ellipse(0, 0, radiusBack, radiusLat, 0, Math.PI/2, 3*Math.PI/2);
            ctx.closePath();
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(radiusFront, radiusLat));
            gradient.addColorStop(0, `rgba(122, 255, 196, ${0.015 * zoomAlpha})`);
            gradient.addColorStop(0.6, `rgba(122, 255, 196, ${0.005 * zoomAlpha})`);
            gradient.addColorStop(1, 'rgba(122, 255, 196, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();

            // Unified Teardrop Ring
            ctx.beginPath();
            ctx.strokeStyle = `rgba(122, 255, 196, ${0.06 * zoomAlpha})`;
            ctx.setLineDash([15, 45]); // More spacing
            ctx.lineWidth = 1.0 / state.transform.scale;
            ctx.ellipse(0, 0, radiusFront * 0.92, radiusLat * 0.9, 0, -Math.PI/2, Math.PI/2);
            ctx.ellipse(0, 0, radiusBack * 0.92, radiusLat * 0.9, 0, Math.PI/2, 3*Math.PI/2);
            ctx.stroke();
            
            ctx.restore();
        });

        // 1.5 Draw Physics Auras for all Folders (Teardrops)
        state.nodes.forEach(node => {
            if (!node || node.kind !== 'folder') return;

            const pId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;
            if (!pNode) return;

            // Viewport Culling
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

            const extraBuffer = isRoot ? (pNode.radius || 60) + 50 : 250;
            const radiusFront = Math.max(300, (fdist - 140) + extraBuffer);
            const radiusBack = 250;
            const radiusLat = 1100;

            const angle = Math.atan2(fny, fnx);
            const centerX = node.x + fnx * 140;
            const centerY = node.y + fny * 140;

            // Gradient and Drawing
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            
            const zoomAlpha = Math.min(1.0, state.transform.scale * 3.0);
            const showDetails = state.transform.scale > 0.15;
            const alpha = (isRoot ? 0.04 : 0.015) * zoomAlpha;

            // Front half
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusFront, radiusLat, 0, -Math.PI/2, Math.PI/2);
            const gradFront = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusLat);
            gradFront.addColorStop(0, `rgba(0, 212, 255, ${alpha})`);
            gradFront.addColorStop(1, 'rgba(0, 212, 255, 0)');
            ctx.fillStyle = gradFront;
            ctx.fill();

            // Back half
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusBack, radiusLat, 0, Math.PI/2, 3*Math.PI/2);
            const gradBack = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusLat);
            gradBack.addColorStop(0, `rgba(0, 212, 255, ${alpha})`);
            gradBack.addColorStop(1, 'rgba(0, 212, 255, 0)');
            ctx.fillStyle = gradBack;
            ctx.fill();

            if (showDetails) {
                ctx.beginPath();
                ctx.strokeStyle = isRoot ? `rgba(0, 212, 255, ${0.12 * zoomAlpha})` : `rgba(0, 212, 255, ${0.06 * zoomAlpha})`;
                ctx.setLineDash([20, 60]);
                ctx.ellipse(0, 0, radiusFront, radiusLat * 0.9, 0, -Math.PI/2, Math.PI/2);
                ctx.ellipse(0, 0, radiusBack, radiusLat * 0.9, 0, Math.PI/2, 3*Math.PI/2);
                ctx.stroke();
            }
            
            ctx.restore();
        });

        const zoomAlpha = Math.min(1.0, state.transform.scale * 3.0);
        state.nodes.forEach(node => {
            if (!node || !node.chainId) return;
            const rootData = auraRoots.get(node.chainId);
            const root = rootData?.node;
            if (!rootData || !root || root === node) return;

            const rdx = node.x - root.x;
            const rdy = node.y - root.y;
            const rdist = Math.sqrt(rdx * rdx + rdy * rdy);

            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;


            // Card Aura Repulsion & Fallback Visualization
            const cardData = rootData;
            if (cardData && cardData.node !== node) {
                const cfx = cardData.frontX;
                const cfy = cardData.frontY;

                const dx = node.x - cardData.node.x;
                const dy = node.y - cardData.node.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const projLong = dx * cfx + dy * cfy;
                const latX = -cfy;
                const latY = cfx;
                const distLat = Math.abs(dx * latX + dy * latY);

                const baseRad = cardData.node.radius || 120;
                const rFront = baseRad * 18.0;
                const rBack = baseRad * 5.0;
                const rLat = baseRad * 10.0;
                const rLong = projLong > 0 ? rFront : rBack;

                const normDistSq = Math.pow(distLat / rLat, 2) + Math.pow(projLong / rLong, 2);
                if (normDistSq < 1.0) {
                    // Purple Shunt Vector
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node.x + (dx / dist) * 35 / state.transform.scale, node.y + (dy / dist) * 35 / state.transform.scale);
                    ctx.strokeStyle = `rgba(200, 160, 255, ${0.08 * zoomAlpha})`;
                    ctx.lineWidth = 1.0 / state.transform.scale;
                    ctx.stroke();

                    // Orange Fallback Vector (if in front)
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

            // Radial push vector from root
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(node.x + (rdx / rdist) * 30 / state.transform.scale, node.y + (rdy / rdist) * 30 / state.transform.scale);
            ctx.strokeStyle = `rgba(122, 255, 196, ${0.12 * zoomAlpha})`;
            ctx.lineWidth = 1 / state.transform.scale;
            ctx.stroke();
        });
    }

    const renderCanvas = ns._renderCanvas = ns._renderCanvas || {};

    Object.assign(renderCanvas, {

        getManualAnchorTarget,
        normalizeAngle,
        stepAngleToward,
        getNodeAnchor,
        getScreenPoint,
        shouldRenderLabel,
        getAutoLinkLabelBudget,
        getCursorFocusIds,
        getLabelBackdropColor,
        drawRoundedBackdrop,
        renderLabels,
        drawPhysicsAuras

    });

})(window.EveConstellationMap);
