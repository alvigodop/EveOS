window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, text, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { applyFolderAura, applyCardAuraRepulsion, applyWorkspaceAuraRepulsion } = physicsHelpers;

    function lerpAngle(current, target, factor) {
        let diff = target - current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return current + diff * factor;
    }

    function normalizeAngle(angle) {
        let value = Number.isFinite(angle) ? angle : 0;
        while (value <= -Math.PI) value += Math.PI * 2;
        while (value > Math.PI) value -= Math.PI * 2;
        return value;
    }

    function getAngleDelta(current, target) {
        return normalizeAngle(target - current);
    }

    function compareNodeOrder(a, b) {
        const labelA = a?.label || '';
        const labelB = b?.label || '';
        return labelA.localeCompare(labelB) || String(a?.id || '').localeCompare(String(b?.id || ''));
    }

    function buildParentChildren() {
        const parentChildren = new Map();
        state.nodes.forEach((n) => {
            if (!n || !n.data) return;
            const parentId = text(n.data.anchorNodeId, '');
            if (!parentId) return;
            if (!parentChildren.has(parentId)) parentChildren.set(parentId, []);
            parentChildren.get(parentId).push(n);
        });
        return parentChildren;
    }

    function buildRootChildGuides(parentChildren) {
        const guides = new Map();
        if (state.scope?.scope !== 'card') return guides;

        parentChildren.forEach((children, parentId) => {
            const parent = state.nodeIndex.get(parentId);
            if (!parent || (parent.kind !== 'category' && parent.kind !== 'workspace')) return;

            const rootFolders = children
                .filter((node) => node?.kind === 'folder')
                .slice()
                .sort(compareNodeOrder);
            const rootLinks = children
                .filter((node) => node?.kind === 'link')
                .slice()
                .sort(compareNodeOrder);

            if (!rootFolders.length || rootLinks.length < 18) return;

            const branchNodes = [];
            rootFolders.forEach((node) => {
                branchNodes.push(node);
                (parentChildren.get(node.id) || []).forEach((child) => branchNodes.push(child));
            });

            let sumX = 0;
            let sumY = 0;
            branchNodes.forEach((node) => {
                sumX += node.x;
                sumY += node.y;
            });

            const avgX = sumX / branchNodes.length;
            const avgY = sumY / branchNodes.length;
            const folderAngle = Math.atan2(avgY - parent.y, avgX - parent.x);

            guides.set(parent.id, {
                folderAngle,
                backAngle: folderAngle + Math.PI,
                rootFolders,
                rootLinks
            });
        });

        return guides;
    }

    function buildWorkspaceChildGuides(parentChildren) {
        const guides = new Map();
        const storedRoots = state.workspaceAuraRoots instanceof Map ? state.workspaceAuraRoots : new Map();
        const activeIds = new Set();
        const storedCardAuras = state.auraRoots instanceof Map ? state.auraRoots : new Map();

        parentChildren.forEach((children, parentId) => {
            const parent = state.nodeIndex.get(parentId);
            if (!parent || parent.kind !== 'workspace') return;

            const categories = children
                .filter((node) => node?.kind === 'category')
                .slice()
                .sort(compareNodeOrder);

            if (!categories.length) return;

            activeIds.add(parent.id);

            const isDraggingRoot = state.pointer.mode === 'node' && state.pointer.node?.id === parent.id;
            const isDraggingChildCategory = state.pointer.mode === 'node'
                && state.pointer.node?.kind === 'category'
                && text(state.pointer.node?.data?.anchorNodeId, '') === parent.id;
            const previous = storedRoots.get(parent.id);
            let lockedAngle = Number.isFinite(previous?.lockedAngle) ? previous.lockedAngle : null;
            let frontAngle = -Math.PI / 2;
            let targetAngle = null;

            if (isDraggingRoot) {
                const dragDx = Number(state.pointer.releaseVx) || 0;
                const dragDy = Number(state.pointer.releaseVy) || 0;
                const dragDistSq = (dragDx * dragDx) + (dragDy * dragDy);
                if (dragDistSq > 0.1) {
                    targetAngle = Math.atan2(dragDy, dragDx);
                    lockedAngle = targetAngle;
                }
            }

            if (!Number.isFinite(targetAngle)) {
                let auraVecX = 0;
                let auraVecY = 0;
                let auraCount = 0;
                categories.forEach((node) => {
                    const auraRoot = storedCardAuras.get(node.chainId);
                    if (!auraRoot || !Number.isFinite(auraRoot.frontAngle)) return;
                    auraVecX += -Math.cos(auraRoot.frontAngle);
                    auraVecY += -Math.sin(auraRoot.frontAngle);
                    auraCount += 1;
                });
                const auraLen = Math.sqrt((auraVecX * auraVecX) + (auraVecY * auraVecY));
                if (auraCount > 0 && auraLen > 0.001) {
                    targetAngle = Math.atan2(auraVecY, auraVecX);
                }
            }

            if (!Number.isFinite(targetAngle)) {
                let sumX = 0;
                let sumY = 0;
                categories.forEach((node) => {
                    sumX += node.x;
                    sumY += node.y;
                });
                const avgX = sumX / categories.length;
                const avgY = sumY / categories.length;
                const dx = parent.x - avgX;
                const dy = parent.y - avgY;
                const dist = Math.sqrt((dx * dx) + (dy * dy));
                if (dist > 0.001) {
                    targetAngle = Math.atan2(dy, dx);
                }
            }

            if (!Number.isFinite(targetAngle)) {
                targetAngle = Number.isFinite(lockedAngle)
                    ? lockedAngle
                    : (Number.isFinite(previous?.frontAngle) ? previous.frontAngle : frontAngle);
            }

            if (!isDraggingRoot && Number.isFinite(lockedAngle)) {
                const childInfluence = isDraggingChildCategory ? 0.006 : 0.03;
                targetAngle = normalizeAngle(lockedAngle + (getAngleDelta(lockedAngle, targetAngle) * childInfluence));
            }

            if (isDraggingRoot) {
                frontAngle = targetAngle;
            } else {
                const currentAngle = Number.isFinite(previous?.frontAngle)
                    ? previous.frontAngle
                    : (Number.isFinite(lockedAngle) ? lockedAngle : targetAngle);
                const childCount = Math.max(1, categories.length);
                const isSingleChild = childCount === 1;
                const delta = Math.abs(getAngleDelta(currentAngle, targetAngle));
                const hasLockedDirection = Number.isFinite(lockedAngle);
                const deadzone = hasLockedDirection
                    ? (isSingleChild ? 0.55 : childCount <= 3 ? 0.44 : 0.32)
                    : (isSingleChild ? 0.22 : childCount <= 3 ? 0.18 : 0.12);
                if (delta <= deadzone) {
                    frontAngle = currentAngle;
                } else {
                    const responsiveness = hasLockedDirection
                        ? (isDraggingChildCategory ? 0.00035 : isSingleChild ? 0.0008 : childCount <= 3 ? 0.0011 : 0.0016)
                        : (isDraggingChildCategory ? 0.0014 : isSingleChild ? 0.0035 : childCount <= 3 ? 0.0055 : 0.008);
                    const maxStep = hasLockedDirection
                        ? (isDraggingChildCategory ? 0.0006 : isSingleChild ? 0.0012 : childCount <= 3 ? 0.0018 : 0.0024)
                        : (isDraggingChildCategory ? 0.002 : isSingleChild ? 0.004 : childCount <= 3 ? 0.006 : 0.009);
                    const adjustedTarget = normalizeAngle(currentAngle + Math.sign(getAngleDelta(currentAngle, targetAngle)) * Math.max(0, delta - deadzone));
                    frontAngle = lerpAngle(currentAngle, adjustedTarget, responsiveness);
                    const steppedDelta = getAngleDelta(currentAngle, frontAngle);
                    if (steppedDelta > maxStep) frontAngle = normalizeAngle(currentAngle + maxStep);
                    if (steppedDelta < -maxStep) frontAngle = normalizeAngle(currentAngle - maxStep);
                }
            }

            const frontX = Math.cos(frontAngle);
            const frontY = Math.sin(frontAngle);
            const guide = {
                node: parent,
                categories,
                frontAngle,
                frontX,
                frontY,
                backX: -frontX,
                backY: -frontY,
                latX: -frontY,
                latY: frontX,
                targetAngle,
                lockedAngle
            };

            guides.set(parent.id, guide);
            storedRoots.set(parent.id, guide);
        });

        Array.from(storedRoots.keys()).forEach((id) => {
            if (!activeIds.has(id)) storedRoots.delete(id);
        });

        state.workspaceAuraRoots = storedRoots;
        return guides;
    }

    function applyParentDrift(parentChildren) {
        parentChildren.forEach((children, parentId) => {
            const parent = state.nodeIndex.get(parentId);
            if (!parent) return;
            if (children.length < 2) return;
            if (isNodeStatic(parent) || parent.manualAnchor) return;
            if (state.pointer.mode === 'node' && state.pointer.node?.id === parent.id) return;

            let sumX = 0;
            let sumY = 0;
            children.forEach((c) => {
                sumX += c.x;
                sumY += c.y;
            });
            const cx = sumX / children.length;
            const cy = sumY / children.length;

            const dx = parent.x - cx;
            const dy = parent.y - cy;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const nx = dx / dist;
            const ny = dy / dist;

            const drift = 0.12;
            parent.vx += nx * drift;
            parent.vy += ny * drift;
        });
    }

    function maintainHierarchyState() {
        state.chainRoots = state.chainRoots || new Map();
        state.folderOrientations = state.folderOrientations || new Map();
        state.workspaceAuraRoots = state.workspaceAuraRoots || new Map();

        const activeNodeIds = new Set(state.nodes.map((n) => n.id));
        const activeChains = new Set(state.nodes.map((n) => n.chainId).filter(Boolean));

        [...state.chainRoots.keys()].forEach((cid) => {
            if (!activeChains.has(cid)) state.chainRoots.delete(cid);
        });
        [...state.folderOrientations.keys()].forEach((id) => {
            if (!activeNodeIds.has(id)) state.folderOrientations.delete(id);
        });
        [...state.workspaceAuraRoots.keys()].forEach((id) => {
            if (!activeNodeIds.has(id)) state.workspaceAuraRoots.delete(id);
        });
    }

    function finalizeCardFrontVectors() {
        state.chainRoots.forEach((data) => {
            const node = data.node;
            const isBeingDragged = (state.pointer.mode === 'node' && state.pointer.node?.id === node.id);
            const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);

            if (isBeingDragged && speed > 0.5) {
                const moveAngle = Math.atan2(node.vy, node.vx);
                data.frontAngle = lerpAngle(data.frontAngle === undefined ? moveAngle : data.frontAngle, moveAngle, 0.15);
            } else if (data.count > 0) {
                const avgX = data.sumX / data.count;
                const avgY = data.sumY / data.count;
                const dx = node.x - avgX;
                const dy = node.y - avgY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 30) {
                    const targetAngle = Math.atan2(dy, dx);
                    data.frontAngle = lerpAngle(data.frontAngle === undefined ? targetAngle : data.frontAngle, targetAngle, 0.005);
                }
            }

            if (data.frontAngle !== undefined) {
                data.frontX = Math.cos(data.frontAngle);
                data.frontY = Math.sin(data.frontAngle);
            }
        });
    }

    function updateFolderOrientations() {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;

        state.nodes.forEach((n) => {
            const pId = (n.data && n.data.anchorNodeId) ? n.data.anchorNodeId : '';
            const pNode = pId ? state.nodeIndex.get(pId) : null;

            if (n.kind !== 'folder' || !pNode) return;

            const isRoot = (pNode.kind === 'category' || pNode.kind === 'workspace');
            const fdx = pNode.x - n.x;
            const fdy = pNode.y - n.y;
            const fdist = Math.max(1, Math.sqrt(fdx * fdx + fdy * fdy));

            let targetAngle = Math.atan2(fdy, fdx);
            if (isRoot) {
                const rootData = chainRoots.get(pNode.chainId);
                if (rootData && rootData.frontAngle !== undefined) {
                    targetAngle = rootData.frontAngle + Math.PI;
                }
            }

            const existing = folderOrientations.get(n.id);
            const currentAngle = (existing && existing.orientAngle !== undefined) ? existing.orientAngle : targetAngle;
            const smoothedAngle = lerpAngle(currentAngle, targetAngle, 0.08);

            folderOrientations.set(n.id, {
                node: n,
                parent: pNode,
                nx: Math.cos(smoothedAngle),
                ny: Math.sin(smoothedAngle),
                dist: fdist,
                isRoot,
                orientAngle: smoothedAngle
            });
        });
    }

    function buildHierarchyAnchors(parentChildren, frontierReach, rootChildGuides, workspaceChildGuides) {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;

        state.hierarchyAnchors = new Map();

        state.nodes.forEach((node) => {
            if (!node || !node.data) return;
            const parentId = text(node.data.anchorNodeId, '');
            if (!parentId) return;
            const parent = state.nodeIndex.get(parentId);
            if (!parent) return;

            const isRootChild = parent.kind === 'category' || parent.kind === 'workspace';
            const rootGuide = isRootChild ? rootChildGuides.get(parentId) : null;
            const workspaceGuide = parent.kind === 'workspace' ? workspaceChildGuides.get(parentId) : null;

            if (node.kind === 'category' && parent.kind === 'workspace' && workspaceGuide?.categories?.length) {
                const workspaceCategories = workspaceGuide.categories;
                const workspaceIndex = workspaceCategories.findIndex((entry) => entry.id === node.id);
                if (workspaceIndex >= 0) {
                    const maxPerBand = workspaceCategories.length >= 18
                        ? 6
                        : workspaceCategories.length >= 10
                            ? 5
                            : 4;
                    const band = Math.floor(workspaceIndex / maxPerBand);
                    const bandStart = band * maxPerBand;
                    const bandSize = Math.min(maxPerBand, workspaceCategories.length - bandStart);
                    const slot = workspaceIndex - bandStart;
                    const halfSpan = Math.max(150, 110 + ((bandSize - 1) * 48 * 0.5));
                    const backOffset = 150 + (band * 84);
                    const localX = bandSize > 1
                        ? ((slot / (bandSize - 1)) - 0.5) * halfSpan * 2
                        : 0;
                    const localY = backOffset;
                    const jitterSeed = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                    const lateralJitter = (((jitterSeed >> 1) % 5) - 2) * 2.5;
                    const depthJitter = ((jitterSeed % 5) - 2) * 1.8;

                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + (workspaceGuide.latX * (localX + lateralJitter)) + (workspaceGuide.backX * (localY + depthJitter)),
                        y: parent.y + (workspaceGuide.latY * (localX + lateralJitter)) + (workspaceGuide.backY * (localY + depthJitter))
                    });
                    return;
                }
            }

            if (node.kind === 'link' && isRootChild && rootGuide?.rootLinks?.length) {
                const rootLinks = rootGuide.rootLinks;
                const rootIndex = rootLinks.findIndex((entry) => entry.id === node.id);
                if (rootIndex >= 0) {
                    const gapArc = Math.PI * 1.1;
                    const availableArc = (Math.PI * 2) - gapArc;
                    const startAngle = rootGuide.folderAngle + (gapArc * 0.5);
                    const baseRadius = Math.max((parent.radius || 12) + 140, (frontierReach * 0.8) + 40);
                    const bandSpacing = 32;
                    const targetChord = 42;
                    let remaining = rootLinks.length;
                    let remainingIndex = rootIndex;
                    let bandIndex = 0;
                    let band = 0;
                    let slot = 0;
                    let bandSize = rootLinks.length;

                    while (remaining > 0) {
                        const radius = baseRadius + (bandIndex * bandSpacing);
                        const capacity = Math.max(6, Math.floor((availableArc * radius) / targetChord));
                        const currentBandSize = Math.min(remaining, capacity);
                        if (remainingIndex < currentBandSize) {
                            band = bandIndex;
                            slot = remainingIndex;
                            bandSize = currentBandSize;
                            break;
                        }
                        remaining -= currentBandSize;
                        bandIndex += 1;
                        remainingIndex -= currentBandSize;
                    }

                    const bandRadius = baseRadius + (band * bandSpacing);
                    const slotsInBand = Math.max(1, bandSize);
                    const bandPhase = (band % 2) * 0.5;
                    const laneAngle = slotsInBand > 1
                        ? startAngle + (availableArc * ((slot + 0.5 + bandPhase) / (slotsInBand + (bandPhase * 2))))
                        : rootGuide.backAngle;
                    const jitterSeed = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                    const radialJitter = ((jitterSeed % 7) - 3) * 0.45;
                    const tangentialJitter = (((jitterSeed >> 1) % 5) - 2) * 0.004;
                    node.spinalAngle = lerpAngle(node.spinalAngle || laneAngle, laneAngle, 0.08);
                    const finalRadius = bandRadius + radialJitter;
                    const angle = node.spinalAngle + tangentialJitter;

                    state.hierarchyAnchors.set(node.id, {
                        x: parent.x + Math.cos(angle) * finalRadius,
                        y: parent.y + Math.sin(angle) * finalRadius
                    });
                    return;
                }
            }

            let baseAngle = 0;
            let radius = 0;
            let foundBase = false;

            const parentOrient = folderOrientations.get(parent.id);
            if (parentOrient) {
                baseAngle = Math.atan2(-parentOrient.ny, -parentOrient.nx);
                radius = (parent.radius || 15) + 12;
                foundBase = true;
            } else if (parent.kind === 'category' || parent.kind === 'workspace') {
                const rootData = chainRoots.get(parent.chainId);
                if (rootData && (rootData.frontX !== 0 || rootData.frontY !== 0)) {
                    baseAngle = Math.atan2(-rootData.frontY, -rootData.frontX);
                    radius = (parent.radius || 60) + 40;
                    foundBase = true;
                }
            }

            if (!foundBase) return;

            const siblings = (parentChildren.get(parentId) || []).slice().sort(compareNodeOrder);
            const index = siblings.indexOf(node);
            const count = siblings.length;

            node.spinalAngle = lerpAngle(node.spinalAngle || baseAngle, baseAngle, 0.08);

            let baseSpread = isRootChild ? Math.PI * 0.22 : Math.PI * 0.35;
            if (!isRootChild && node.kind === 'link') baseSpread = Math.PI * 0.45;

            const rowCount = 5;
            const row = index % rowCount;

            let spread = baseSpread;
            if (node.kind === 'link') {
                const growthFactor = isRootChild ? 0.10 : 0.15;
                const spreadExpansion = (row / (rowCount - 1)) * growthFactor;
                spread = baseSpread + spreadExpansion * Math.PI;
            }

            const offset = count > 1 ? (spread * (index / (count - 1) - 0.5)) : 0;
            const jitterMag = isRootChild ? 10 : 60;
            const jitterVal = (node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % (jitterMag * 2 + 1)) - jitterMag;

            let finalRadius = radius;
            if (node.kind === 'link') {
                const popPull = isRootChild ? Math.min(60, count * 0.12) : 0;
                const rootBase = frontierReach * 0.85;
                const baseR = isRootChild ? 60 + rootBase - popPull : (parent.radius || 15) + frontierReach;
                const rowDepth = isRootChild ? 10 : 100;
                const popPush = isRootChild ? 0 : Math.min(60, count * 3);
                finalRadius = baseR + (row * rowDepth) + popPush + jitterVal;
            } else if (node.kind === 'folder') {
                const fRow = index % 2;
                const fPopPull = isRootChild ? Math.min(45, count * 0.10) : 0;
                const frootBase = frontierReach * 0.80;
                const fBaseR = isRootChild ? 60 + frootBase - fPopPull : (parent.radius || 15) + (frontierReach - 60);
                const fRowDepth = isRootChild ? 10 : 50;
                const fPopPush = isRootChild ? 0 : Math.min(30, count * 4);
                finalRadius = fBaseR + (fRow * fRowDepth) + fPopPush;
            }

            state.hierarchyAnchors.set(node.id, {
                x: parent.x + Math.cos(node.spinalAngle + offset) * finalRadius,
                y: parent.y + Math.sin(node.spinalAngle + offset) * finalRadius
            });
        });
    }

    function applyHierarchyAuras() {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;
        const workspaceAuraRoots = state.workspaceAuraRoots instanceof Map ? state.workspaceAuraRoots : new Map();

        state.nodes.forEach((node) => {
            if (!node || !node.chainId || isNodeStatic(node)) return;
            const rootData = chainRoots.get(node.chainId);
            if (!rootData) return;

            const root = rootData.node;
            if (root === node) return;
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
            if (nodeDepth <= -1) return;

            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
            let workspaceAncestor = null;

            if (parentNode) {
                let currentParent = parentNode;
                let safety = 0;
                while (currentParent && safety < 10) {
                    if (currentParent.kind === 'folder') {
                        const orient = folderOrientations.get(currentParent.id);
                        if (orient) {
                            applyFolderAura(node, currentParent, orient.nx, orient.ny, orient.dist, orient.isRoot);
                        }
                    }
                    if (currentParent.kind === 'workspace') {
                        workspaceAncestor = currentParent;
                        break;
                    }
                    const nextId = (currentParent.data && currentParent.data.anchorNodeId) ? currentParent.data.anchorNodeId : '';
                    currentParent = nextId ? state.nodeIndex.get(nextId) : null;
                    safety += 1;
                }
            }

            applyCardAuraRepulsion(node, root, rootData);

            if (workspaceAncestor) {
                const workspaceData = workspaceAuraRoots.get(workspaceAncestor.id);
                if (workspaceData) {
                    applyWorkspaceAuraRepulsion(node, workspaceAncestor, workspaceData);
                }
            }
        });

        state.nodes.forEach((node) => {
            if (!node || node.kind !== 'category' || isNodeStatic(node)) return;
            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;
            if (!parentNode || parentNode.kind !== 'workspace') return;
            const workspaceData = workspaceAuraRoots.get(parentNode.id);
            if (!workspaceData) return;
            applyWorkspaceAuraRepulsion(node, parentNode, workspaceData);
        });
    }

    function runHierarchyPass(ctx) {
        const { frontierReach } = ctx;
        const parentChildren = buildParentChildren();
        const rootChildGuides = buildRootChildGuides(parentChildren);
        const workspaceChildGuides = buildWorkspaceChildGuides(parentChildren);
        applyParentDrift(parentChildren);
        maintainHierarchyState();
        finalizeCardFrontVectors();
        updateFolderOrientations();
        buildHierarchyAnchors(parentChildren, frontierReach, rootChildGuides, workspaceChildGuides);
        applyHierarchyAuras();
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runHierarchyPass });

})(window.EveConstellationMap);
