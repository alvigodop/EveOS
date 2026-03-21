window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsHierarchy = ns._physicsHierarchy = ns._physicsHierarchy || {};
    const { normalizeAngle, getAngleDelta, compareNodeOrder, lerpAngle } = physicsHierarchy;
    const shared = ns._shared || {};
    const { state, text, isNodeStatic } = shared;

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

    

    Object.assign(physicsHierarchy, {
        buildParentChildren,
        buildRootChildGuides,
        buildWorkspaceChildGuides,
        applyParentDrift
    });
})(window.EveConstellationMap);
