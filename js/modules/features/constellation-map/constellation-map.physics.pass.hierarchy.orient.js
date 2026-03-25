window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const physicsHierarchy = ns._physicsHierarchy = ns._physicsHierarchy || {};
    const { lerpAngle } = physicsHierarchy;
    const shared = ns._shared || {};
    const { state, text } = shared;

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
            }
            // CENTROID DRIFT DELETED: The Main Card Node is now completely immune to the mass/pull of its child chains.
            // It will strictly retain the direction the user set it at via dragging.

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

            if (n.kind !== 'folder') return;

            if (!pNode && n.data?.detachedRoot) {
                const children = state.nodes.filter((entry) => text(entry?.data?.anchorNodeId, '') === n.id);
                const existing = folderOrientations.get(n.id);
                const currentAngle = (existing && existing.orientAngle !== undefined) ? existing.orientAngle : (-Math.PI / 2);
                let targetAngle = currentAngle;
                const isBeingDragged = state.pointer.mode === 'node' && state.pointer.node?.id === n.id;
                const speed = Math.sqrt((Number(n.vx) || 0) * (Number(n.vx) || 0) + (Number(n.vy) || 0) * (Number(n.vy) || 0));

                if (isBeingDragged && speed > 0.5) {
                    targetAngle = Math.atan2(Number(n.vy) || 0, Number(n.vx) || 0);
                } else if (children.length) {
                    let sumX = 0;
                    let sumY = 0;
                    children.forEach((child) => {
                        sumX += child.x;
                        sumY += child.y;
                    });
                    const avgX = sumX / children.length;
                    const avgY = sumY / children.length;
                    const dx = n.x - avgX;
                    const dy = n.y - avgY;
                    if (Math.sqrt((dx * dx) + (dy * dy)) > 0.001) {
                        targetAngle = Math.atan2(dy, dx);
                    }
                }

                const smoothedAngle = lerpAngle(currentAngle, targetAngle, isBeingDragged ? 0.2 : 0.08);
                folderOrientations.set(n.id, {
                    node: n,
                    parent: null,
                    nx: Math.cos(smoothedAngle),
                    ny: Math.sin(smoothedAngle),
                    dist: 0,
                    isRoot: true,
                    orientAngle: smoothedAngle
                });
                return;
            }

            if (!pNode) return;

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
            // Root folders track the card heading tightly; deeper folders lerp slower
            const smoothedAngle = lerpAngle(currentAngle, targetAngle, isRoot ? 0.18 : 0.08);

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

    

    Object.assign(physicsHierarchy, {
        maintainHierarchyState,
        finalizeCardFrontVectors,
        updateFolderOrientations
    });
})(window.EveConstellationMap);
