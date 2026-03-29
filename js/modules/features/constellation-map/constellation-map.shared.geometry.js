window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const sharedState = ns._sharedState || {};
    const { state } = sharedState;

    const sharedHelpers = ns._sharedHelpers || {};
    const { text, clamp } = sharedHelpers;
    const sharedBlobs = ns._sharedBlobs || {};
    const { measureBlobHalfWidthForNode } = sharedBlobs;

    function getAuraValue(key) {
        const controls = ns._sharedControls || {};
        if (typeof controls.getAuraTuningValue === 'function') {
            return controls.getAuraTuningValue(key);
        }
        return 1;
    }

    function getCardAuraShape(card) {
        const baseRadius = card?.radius || 120;
        return {
            radiusFront: baseRadius * 18.0 * getAuraValue('cardFrontScale'),
            radiusBack: baseRadius * 5.0 * getAuraValue('cardBackScale'),
            radiusLat: baseRadius * 10.0 * getAuraValue('cardWidthScale')
        };
    }

    function getFolderAuraShape(folder, distToParent, isRootFolder, parentNode) {
        let offsetDist = 140 * getAuraValue('folderOffsetScale');
        if (isRootFolder) {
            offsetDist = 80 * getAuraValue('folderOffsetScale');
        }

        const distFromCenterToParent = distToParent - offsetDist;
        const extraBuffer = isRootFolder ? 110 : 250;
        const widthScale = getAuraValue('folderWidthScale');
        let radiusLat = 1100 * widthScale;

        let resolvedParentNode = parentNode || null;
        if (!resolvedParentNode) {
            const parentId = text(folder?.data?.anchorNodeId, '');
            resolvedParentNode = parentId ? state.nodeIndex.get(parentId) || null : null;
        }

        if (
            isRootFolder
            && resolvedParentNode?.kind === 'category'
            && typeof measureBlobHalfWidthForNode === 'function'
        ) {
            const axisAngle = Math.atan2(
                (Number(resolvedParentNode.y) || 0) - (Number(folder?.y) || 0),
                (Number(resolvedParentNode.x) || 0) - (Number(folder?.x) || 0)
            );
            const blobHalfWidth = measureBlobHalfWidthForNode(resolvedParentNode, axisAngle);
            if (Number.isFinite(blobHalfWidth) && blobHalfWidth > 0) {
                const purposefulWidth = clamp(blobHalfWidth * 1.04, 96, 1600);
                radiusLat = purposefulWidth * widthScale;
            }
        }

        return {
            offsetDist,
            radiusFront: isRootFolder
                ? 300 * getAuraValue('folderFrontScale')
                : Math.max(300 * getAuraValue('folderFrontScale'), (distFromCenterToParent + extraBuffer) * getAuraValue('folderFrontScale')),
            radiusBack: (isRootFolder ? 260 : 250) * getAuraValue('folderBackScale'),
            radiusLat
        };
    }

    function getWorkspaceAuraShape(workspace, categoryCount) {
        const baseRadius = workspace?.radius || 15;
        const count = Math.max(1, Number(categoryCount) || 1);
        const backOffset = Math.max(80, ((baseRadius * 5) + (count * 4)) * getAuraValue('workspaceOffsetScale'));
        const centerOffset = Math.max(58, backOffset * 0.84);

        return {
            capsuleHalfWidth: Math.max(150, (((baseRadius * 7) + (count * 18)) * 1.45) * getAuraValue('workspaceLengthScale')),
            capsuleRadius: Math.max(90, ((baseRadius * 5.5) + (count * 7)) * getAuraValue('workspaceWidthScale')),
            backOffset,
            centerOffset
        };
    }

    function addNode(node) {
        if (!node?.id) return null;
        const existing = state.nodeIndex.get(String(node.id));
        if (existing) return existing;
        state.nodes.push(node);
        state.nodeIndex.set(String(node.id), node);
        return node;
    }

    function addEdge(source, target, type) {
        if (!source || !target || source.id === target.id) return;
        const edgeType = text(type, 'hierarchy');
        const edgeKey = source.id + '|' + target.id + '|' + edgeType;
        if (state.edgeKeys.has(edgeKey)) return;
        state.edgeKeys.add(edgeKey);
        state.edges.push({ source, target, type: edgeType });
    }

    function hashNodeId(node) {
        const value = String(node?.id || '');
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash * 33) + value.charCodeAt(index)) % 100003;
        }
        return hash;
    }

    function getManualAnchorPreset(node) {
        if (node?.kind === 'workspace') {
            return { driftRadius: 22, pullStrength: 0.02, damping: 0.924, speed: 0.00028 };
        }
        if (node?.kind === 'category') {
            return { driftRadius: 16, pullStrength: 0.024, damping: 0.916, speed: 0.00032 };
        }
        if (node?.kind === 'folder') {
            return { driftRadius: 10, pullStrength: 0.03, damping: 0.91, speed: 0.00038 };
        }
        return { driftRadius: 8, pullStrength: 0.032, damping: 0.904, speed: 0.00042 };
    }

    function createManualAnchor(node) {
        const preset = getManualAnchorPreset(node);
        const hash = hashNodeId(node);
        return {
            x: Number.isFinite(node?.x) ? node.x : 0,
            y: Number.isFinite(node?.y) ? node.y : 0,
            driftRadius: preset.driftRadius + (hash % 5),
            pullStrength: preset.pullStrength,
            damping: preset.damping,
            speed: preset.speed + ((hash % 7) * 0.00001),
            phase: (hash % 6283) / 1000
        };
    }

    ns._sharedGeometry = Object.assign(ns._sharedGeometry || {}, {
        getCardAuraShape,
        getFolderAuraShape,
        getWorkspaceAuraShape,
        addNode,
        addEdge,
        hashNodeId,
        getManualAnchorPreset,
        createManualAnchor
    });
})(window.EveConstellationMap);
