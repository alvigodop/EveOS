window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const { state, LABEL_CURSOR_RADIUS, LABEL_FOCUS_LIMIT, getMapThemeRgba } = shared;
    const renderAnchors = ns._renderAnchors || {};
    const { getScreenPoint } = renderAnchors;

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

        const margin = 100 / state.transform.scale;
        const boundsLeft = -state.transform.tx / state.transform.scale - margin;
        const boundsTop = -state.transform.ty / state.transform.scale - margin;
        const boundsRight = (state.canvas.width - state.transform.tx) / state.transform.scale + margin;
        const boundsBottom = (state.canvas.height - state.transform.ty) / state.transform.scale + margin;

        const ranked = [];
        for (let i = 0; i < state.nodes.length; i++) {
            const node = state.nodes[i];
            // Viewport culling for cursor check
            if (node.x < boundsLeft || node.x > boundsRight || node.y < boundsTop || node.y > boundsBottom) continue;

            const point = getScreenPoint(node);
            const dx = point.x - pointerX;
            const dy = point.y - pointerY;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq > (LABEL_CURSOR_RADIUS * LABEL_CURSOR_RADIUS)) continue;
            ranked.push({ node, distSq });
        }
        ranked.sort((left, right) => left.distSq - right.distSq);
        ranked.slice(0, LABEL_FOCUS_LIMIT).forEach((entry) => {
            focusIds.add(entry.node.id);
        });
        return focusIds;
    }

    function getLabelBackdropColor(box) {
        if (box.isSelected) return getMapThemeRgba('panelTint', 0.9);
        if (box.isHovered) return getMapThemeRgba('panelTint', 0.84);
        if (box.node.kind === 'link') return getMapThemeRgba('panelTint', 0.58);
        return getMapThemeRgba('panelTint', 0.72);
    }

    function getLabelStrokeColor(box) {
        if (box.isSelected) return getMapThemeRgba('mapAccent', 0.78);
        if (box.isHovered || box.isPointerFocused || box.isSearchMatch) return getMapThemeRgba('panelEdge', 0.72);
        return getMapThemeRgba('panelEdge', 0.54);
    }

    function getLabelTextColor(labelOpacity) {
        return getMapThemeRgba('titleColor', labelOpacity);
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

    // OCCUPANCY GRID FOR LABELS (O(L) instead of O(L^2))
    const GRID_SIZE = 48;
    let occupancyGrid = new Uint8Array(0);
    let gridCols = 0;
    let gridRows = 0;

    function renderLabels(ctx) {
        state.labelHitBoxes = [];
        if (state.labelMode === 'off') return;

        const margin = 100 / state.transform.scale;
        const boundsLeft = -state.transform.tx / state.transform.scale - margin;
        const boundsTop = -state.transform.ty / state.transform.scale - margin;
        const boundsRight = (state.canvas.width - state.transform.tx) / state.transform.scale + margin;
        const boundsBottom = (state.canvas.height - state.transform.ty) / state.transform.scale + margin;

        const focusIds = getCursorFocusIds();
        const searchMatchIds = new Set((state.searchState.matches || []).map((match) => match.id));
        const autoLinkBudget = getAutoLinkLabelBudget();

        const candidates = [];
        for (let i = 0; i < state.nodes.length; i++) {
            const node = state.nodes[i];
            
            const isHovered = state.hovered && state.hovered.id === node.id;
            const isSelected = state.selected && state.selected.id === node.id;
            
            // Viewport culling for labels
            if (!isHovered && !isSelected) {
                if (node.x < boundsLeft || node.x > boundsRight || node.y < boundsTop || node.y > boundsBottom) continue;
            }

            const isPointerFocused = focusIds.has(node.id);
            const isSearchMatch = searchMatchIds.has(node.id);
            if (!shouldRenderLabel(node, isHovered, isSelected)) continue;
            if (
                state.labelMode === 'focus'
                && node.kind === 'link'
                && !isHovered
                && !isSelected
                && !isPointerFocused
                && !isSearchMatch
            ) {
                continue;
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
            candidates.push(box);
        }

        candidates.sort((left, right) => {
            if (right.priority !== left.priority) return right.priority - left.priority;
            if (left.node.kind === 'link' && right.node.kind !== 'link') return 1;
            if (left.node.kind !== 'link' && right.node.kind === 'link') return -1;
            return left.node.label.localeCompare(right.node.label, undefined, { sensitivity: 'base' });
        });

        // Initialize/Clear occupancy grid
        const cols = Math.ceil(state.canvas.width / GRID_SIZE);
        const rows = Math.ceil(state.canvas.height / GRID_SIZE);
        if (occupancyGrid.length !== cols * rows) {
            occupancyGrid = new Uint8Array(cols * rows);
            gridCols = cols;
            gridRows = rows;
        } else {
            occupancyGrid.fill(0);
        }

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

            const allowOverlap = state.labelMode === 'all' || box.isHovered || box.isSelected;
            
            if (!allowOverlap) {
                // Check Grid Occupancy
                const xStart = Math.max(0, Math.floor(box.left / GRID_SIZE));
                const xEnd = Math.min(gridCols - 1, Math.floor(box.right / GRID_SIZE));
                const yStart = Math.max(0, Math.floor(box.top / GRID_SIZE));
                const yEnd = Math.min(gridRows - 1, Math.floor(box.bottom / GRID_SIZE));

                let isOccupied = false;
                for (let y = yStart; y <= yEnd; y++) {
                    for (let x = xStart; x <= xEnd; x++) {
                        if (occupancyGrid[y * gridCols + x]) {
                            isOccupied = true;
                            break;
                        }
                    }
                    if (isOccupied) break;
                }

                if (isOccupied) {
                    if (box.node.kind === 'link' && !box.isHovered && !box.isSelected) return;
                } else {
                    // Mark Grid as Occupied
                    for (let y = yStart; y <= yEnd; y++) {
                        for (let x = xStart; x <= xEnd; x++) {
                            occupancyGrid[y * gridCols + x] = 1;
                        }
                    }
                }
            }

            state.labelHitBoxes.push(box);
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
            ctx.strokeStyle = getLabelStrokeColor(box);
            ctx.lineWidth = box.isSelected || box.isHovered ? 4.4 : 3.2;
            ctx.shadowBlur = box.isHovered || box.isSelected ? 12 : 6;
            ctx.shadowColor = getMapThemeRgba('panelTint', 0.42);
            ctx.strokeText(box.node.label, box.textX, box.textY);
            ctx.shadowBlur = 0;
            ctx.fillStyle = getLabelTextColor(labelOpacity);
            ctx.fillText(box.node.label, box.textX, box.textY);
        });
    }

    const renderLabelsApi = ns._renderLabels = ns._renderLabels || {};
    Object.assign(renderLabelsApi, {
        shouldRenderLabel,
        getAutoLinkLabelBudget,
        getCursorFocusIds,
        getLabelBackdropColor,
        drawRoundedBackdrop,
        renderLabels
    });
})(window.EveConstellationMap);
