window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const {
        state,
        text,
        clamp,
        ensureBlobControls,
        isBlobVisualsEnabled,
        isBlobRootShellsEnabled,
        isBlobLayeredEnabled,
        getBlobMode,
        getBlobTuningValue,
        getMapThemeRgba
    } = shared;

    function getHierarchyDepth(node) {
        if (!node) return 0;
        if (node.kind === 'workspace') return -2;
        if (node.kind === 'category') return -1;
        if (node.kind === 'folder') return Number.isFinite(node?.data?.depth) ? node.data.depth : 0;
        return Number.isFinite(node?.data?.depth) ? node.data.depth : 3;
    }

    function getBlobColorKeys(kind) {
        if (kind === 'workspace') return { fill: 'workspaceAuraFill', dash: 'workspaceAuraDash' };
        if (kind === 'category') return { fill: 'cardAuraFill', dash: 'cardAuraDash' };
        if (kind === 'folder') return { fill: 'folderAuraFill', dash: 'folderAuraDash' };
        return null;
    }

    function buildChildrenMap() {
        const childrenMap = new Map();
        state.nodes.forEach((node) => {
            const parentId = text(node?.data?.anchorNodeId, '');
            if (!parentId) return;
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            childrenMap.get(parentId).push(node);
        });
        return childrenMap;
    }

    function collectOnionMembers(node, childrenMap, members, segments, seen) {
        const children = childrenMap.get(node.id) || [];
        children.forEach((child) => {
            const childId = text(child?.id, '');
            if (!childId || seen.has(childId)) return;
            seen.add(childId);
            members.push(child);
            segments.push([node, child]);
            if (child.kind !== 'link') collectOnionMembers(child, childrenMap, members, segments, seen);
        });
    }

    function buildBlobGroups() {
        ensureBlobControls();
        const mode = getBlobMode();
        const childrenMap = buildChildrenMap();
        const allowRootShells = isBlobRootShellsEnabled();
        const groups = [];

        state.nodes.forEach((node) => {
            if (!node || !['workspace', 'category', 'folder'].includes(node.kind)) return;
            if (!allowRootShells && (node.kind === 'workspace' || node.kind === 'category')) return;

            const members = [node];
            const segments = [];
            if (mode === 'onion') {
                const seen = new Set([text(node.id, '')]);
                collectOnionMembers(node, childrenMap, members, segments, seen);
            } else {
                const children = childrenMap.get(node.id) || [];
                children.forEach((child) => {
                    members.push(child);
                    segments.push([node, child]);
                });
            }

            if (members.length < 2) return;
            groups.push({
                parent: node,
                members,
                segments,
                depth: getHierarchyDepth(node)
            });
        });

        return groups.sort((left, right) => left.depth - right.depth);
    }

    function getGroupRadius(node, parent, padding, rootScale) {
        const basePadding = padding * (node.id === parent.id ? rootScale : 1);
        return Math.max(node.radius + 2, node.radius + basePadding);
    }

    function collectBoundarySamples(members, radiusByNodeId, sampleCount) {
        const points = [];
        members.forEach((member) => {
            const radius = radiusByNodeId.get(member.id) || member.radius;
            for (let index = 0; index < sampleCount; index += 1) {
                const angle = (index / sampleCount) * Math.PI * 2;
                points.push({
                    x: member.x + (Math.cos(angle) * radius),
                    y: member.y + (Math.sin(angle) * radius)
                });
            }
        });
        return points;
    }

    function cross(origin, a, b) {
        return ((a.x - origin.x) * (b.y - origin.y)) - ((a.y - origin.y) * (b.x - origin.x));
    }

    function getConvexHull(points) {
        const uniquePoints = Array.from(new Map(points.map((point) => [point.x.toFixed(2) + ':' + point.y.toFixed(2), point])).values());
        if (uniquePoints.length <= 2) return uniquePoints;
        const sorted = uniquePoints.slice().sort((left, right) => {
            if (left.x !== right.x) return left.x - right.x;
            return left.y - right.y;
        });
        const lower = [];
        sorted.forEach((point) => {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
                lower.pop();
            }
            lower.push(point);
        });
        const upper = [];
        for (let index = sorted.length - 1; index >= 0; index -= 1) {
            const point = sorted[index];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
                upper.pop();
            }
            upper.push(point);
        }
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    function drawSmoothHull(ctx, hullPoints) {
        if (!Array.isArray(hullPoints) || hullPoints.length < 3) return false;
        ctx.beginPath();
        const first = hullPoints[0];
        const second = hullPoints[1];
        const startX = (first.x + second.x) / 2;
        const startY = (first.y + second.y) / 2;
        ctx.moveTo(startX, startY);
        for (let index = 1; index <= hullPoints.length; index += 1) {
            const current = hullPoints[index % hullPoints.length];
            const next = hullPoints[(index + 1) % hullPoints.length];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            ctx.quadraticCurveTo(current.x, current.y, midX, midY);
        }
        ctx.closePath();
        return true;
    }

    function drawGroupPass(ctx, group, options) {
        const { fillKey, dashKey, padding, rootScale, bridgeWidthFactor, fillAlpha, outlineAlpha, scale } = options;
        const radiusByNodeId = new Map();
        group.members.forEach((member) => {
            radiusByNodeId.set(member.id, getGroupRadius(member, group.parent, padding, rootScale));
        });

        const segmentWidths = [];
        group.segments.forEach(([source, target]) => {
            const sourceRadius = radiusByNodeId.get(source.id) || source.radius;
            const targetRadius = radiusByNodeId.get(target.id) || target.radius;
            segmentWidths.push(Math.max(12, ((sourceRadius + targetRadius) * 0.82) * bridgeWidthFactor));
        });
        const averageWidth = segmentWidths.length
            ? segmentWidths.reduce((sum, value) => sum + value, 0) / segmentWidths.length
            : Math.max(12, padding * 2.2 * bridgeWidthFactor);
        const hullSamples = collectBoundarySamples(group.members, radiusByNodeId, group.members.length > 10 ? 8 : 12);
        const hullPoints = getConvexHull(hullSamples);
        const hasHull = hullPoints.length >= 3;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = getMapThemeRgba(fillKey, fillAlpha * 0.96);
        if (hasHull) {
            drawSmoothHull(ctx, hullPoints);
            ctx.fill();
        } else {
            group.members.forEach((member) => {
                const radius = radiusByNodeId.get(member.id) || member.radius;
                ctx.beginPath();
                ctx.arc(member.x, member.y, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.strokeStyle = getMapThemeRgba(fillKey, fillAlpha * 0.72);
        ctx.lineWidth = averageWidth * 0.44;
        group.segments.forEach(([source, target]) => {
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
        });
        ctx.restore();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([Math.max(6, 10 / scale), Math.max(8, 16 / scale)]);
        ctx.strokeStyle = getMapThemeRgba(dashKey, outlineAlpha);
        ctx.lineWidth = Math.max(1.1 / scale, averageWidth * 0.12);
        if (hasHull) {
            drawSmoothHull(ctx, hullPoints);
            ctx.stroke();
        } else {
            group.members.forEach((member) => {
                const radius = radiusByNodeId.get(member.id) || member.radius;
                ctx.beginPath();
                ctx.arc(member.x, member.y, Math.max(member.radius + 2, radius * 0.98), 0, Math.PI * 2);
                ctx.stroke();
            });
        }
        ctx.restore();
    }

    function drawBlobLayers(ctx) {
        if (!isBlobVisualsEnabled()) return;

        const groups = buildBlobGroups();
        if (!groups.length) return;

        const padding = getBlobTuningValue('padding');
        const bridgeWidthFactor = getBlobTuningValue('bridgeWidth');
        const rootScale = getBlobTuningValue('rootScale');
        const opacity = getBlobTuningValue('opacity');
        const outline = getBlobTuningValue('outline');
        const layerGap = getBlobTuningValue('layerGap');
        const layered = isBlobLayeredEnabled();
        const scale = Math.max(0.2, Number(state.transform?.scale) || 1);

        groups.forEach((group) => {
            const colorKeys = getBlobColorKeys(group.parent.kind);
            if (!colorKeys) return;

            const baseFillAlpha = clamp((group.parent.kind === 'workspace' ? 0.085 : (group.parent.kind === 'category' ? 0.11 : 0.095)) * opacity, 0.03, 0.42);
            const baseOutlineAlpha = clamp((group.parent.kind === 'workspace' ? 0.22 : 0.28) * outline, 0.04, 0.72);
            const passes = layered ? 3 : 1;
            for (let passIndex = passes - 1; passIndex >= 0; passIndex -= 1) {
                const paddingValue = Math.max(3, padding - (passIndex * layerGap * 0.55));
                const passFillAlpha = baseFillAlpha * (passIndex === 0 ? 1 : (0.56 - ((passIndex - 1) * 0.14)));
                const passOutlineAlpha = baseOutlineAlpha * (passIndex === 0 ? 1 : 0.52);
                if (passFillAlpha <= 0.01) continue;
                drawGroupPass(ctx, group, {
                    fillKey: colorKeys.fill,
                    dashKey: colorKeys.dash,
                    padding: paddingValue,
                    rootScale,
                    bridgeWidthFactor,
                    fillAlpha: passFillAlpha,
                    outlineAlpha: passOutlineAlpha,
                    scale
                });
            }
        });
    }

    const renderBlobs = ns._renderBlobs = ns._renderBlobs || {};
    Object.assign(renderBlobs, { drawBlobLayers });
})(window.EveConstellationMap);
