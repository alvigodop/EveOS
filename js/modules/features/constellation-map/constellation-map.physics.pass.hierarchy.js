window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {

    const shared = ns._shared || {};
    const { state, text, isNodeStatic } = shared;

    const physicsHelpers = ns._physicsHelpers || {};
    const { applyFolderAura, applyCardAuraRepulsion } = physicsHelpers;

    function lerpAngle(current, target, factor) {
        let diff = target - current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return current + diff * factor;
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

        const activeNodeIds = new Set(state.nodes.map((n) => n.id));
        const activeChains = new Set(state.nodes.map((n) => n.chainId).filter(Boolean));

        [...state.chainRoots.keys()].forEach((cid) => {
            if (!activeChains.has(cid)) state.chainRoots.delete(cid);
        });
        [...state.folderOrientations.keys()].forEach((id) => {
            if (!activeNodeIds.has(id)) state.folderOrientations.delete(id);
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

    function buildHierarchyAnchors(parentChildren, frontierReach) {
        const chainRoots = state.chainRoots;
        const folderOrientations = state.folderOrientations;

        state.hierarchyAnchors = new Map();

        state.nodes.forEach((node) => {
            if (!node || !node.data) return;
            const parentId = text(node.data.anchorNodeId, '');
            if (!parentId) return;
            const parent = state.nodeIndex.get(parentId);
            if (!parent) return;

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

            const siblings = (parentChildren.get(parentId) || []).slice().sort((a, b) => {
                const labelA = a.label || '';
                const labelB = b.label || '';
                return labelA.localeCompare(labelB) || a.id.localeCompare(b.id);
            });
            const index = siblings.indexOf(node);
            const count = siblings.length;
            const isRootChild = parent.kind === 'category' || parent.kind === 'workspace';

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

        state.nodes.forEach((node) => {
            if (!node || !node.chainId || isNodeStatic(node)) return;
            const rootData = chainRoots.get(node.chainId);
            if (!rootData) return;

            const root = rootData.node;
            if (root === node) return;
            if (state.pointer.mode === 'node' && state.pointer.node?.id === node.id) return;

            const nodeDepth = (node.data && typeof node.data.depth === 'number') ? node.data.depth : 0;
            if (nodeDepth <= -1) return;

            const dx = node.x - root.x;
            const dy = node.y - root.y;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const nx = dx / dist;
            const ny = dy / dist;

            const parentId = (node.data && node.data.anchorNodeId) ? node.data.anchorNodeId : '';
            const parentNode = parentId ? state.nodeIndex.get(parentId) : null;

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
                    const nextId = (currentParent.data && currentParent.data.anchorNodeId) ? currentParent.data.anchorNodeId : '';
                    currentParent = nextId ? state.nodeIndex.get(nextId) : null;
                    safety += 1;
                }
            }

            applyCardAuraRepulsion(node, root, rootData);
        });
    }

    function runHierarchyPass(ctx) {
        const { frontierReach } = ctx;
        const parentChildren = buildParentChildren();
        applyParentDrift(parentChildren);
        maintainHierarchyState();
        finalizeCardFrontVectors();
        updateFolderOrientations();
        buildHierarchyAnchors(parentChildren, frontierReach);
        applyHierarchyAuras();
    }

    const passes = ns._physicsTickPasses = ns._physicsTickPasses || {};
    Object.assign(passes, { runHierarchyPass });

})(window.EveConstellationMap);
