window.EveConstellationMap = window.EveConstellationMap || {};
(function (ns) {
    const shared = ns._shared || {};
    const { state, KIND_ORDER, text } = shared;

    function resetStaticLocks() {

        state.staticNodeIds = new Set();

        state.staticKinds = new Set();

        state.staticBranchRoots = new Map();

        state.staticBranchNodeIds = new Set();

        state.nodes.forEach((node) => {

            if (!node) return;

            node.staticAnchor = null;

        });

    }



    function getStaticStateForNode(node) {

        if (!node?.id) {

            return { isStatic: false, nodeLocked: false, kindLocked: false, branchLocked: false, source: '' };

        }

        const nodeLocked = state.staticNodeIds.has(String(node.id));

        const kindLocked = state.staticKinds.has(String(node.kind || ''));

        const branchLocked = state.staticBranchNodeIds.has(String(node.id));

        return {

            isStatic: nodeLocked || branchLocked || kindLocked,

            nodeLocked,

            kindLocked,

            branchLocked,

            source: nodeLocked ? 'node' : (branchLocked ? 'branch' : (kindLocked ? 'kind' : ''))

        };

    }



    function isNodeStatic(node) {

        return getStaticStateForNode(node).isStatic;

    }



    function setStaticAnchor(node, position) {

        if (!node) return null;

        const target = position && typeof position === 'object' ? position : node;

        node.staticAnchor = {

            x: Number.isFinite(target?.x) ? Number(target.x) : 0,

            y: Number.isFinite(target?.y) ? Number(target.y) : 0

        };

        return node.staticAnchor;

    }



    function toggleStaticForNode(node) {

        if (!node?.id) return false;

        const key = String(node.id);

        if (state.staticNodeIds.has(key)) {

            state.staticNodeIds.delete(key);

            if (!state.staticKinds.has(String(node.kind || '')) && !state.staticBranchNodeIds.has(key)) {

                node.staticAnchor = null;

            }

            return false;

        }

        setStaticAnchor(node);

        state.staticNodeIds.add(key);

        return true;

    }



    function toggleStaticForKind(kind) {

        const normalizedKind = String(kind || '').trim();

        if (!normalizedKind) return false;

        if (state.staticKinds.has(normalizedKind)) {

            state.staticKinds.delete(normalizedKind);

            state.nodes.forEach((node) => {

                if (!node || String(node.kind || '') !== normalizedKind) return;

                const nodeId = String(node.id || '');

                if (!state.staticNodeIds.has(nodeId) && !state.staticBranchNodeIds.has(nodeId)) {

                    node.staticAnchor = null;

                }

            });

            return false;

        }

        state.staticKinds.add(normalizedKind);

        state.nodes.forEach((node) => {

            if (!node || String(node.kind || '') !== normalizedKind) return;

            state.staticNodeIds.delete(String(node.id || ''));

            setStaticAnchor(node);

        });

        return true;

    }



    function recomputeStaticBranchNodeIds() {

        const next = new Set();

        state.staticBranchRoots.forEach((ids) => {

            (ids || []).forEach((id) => {

                if (id) next.add(String(id));

            });

        });

        state.staticBranchNodeIds = next;

    }



    function getStaticBranchIds(rootNode) {

        if (!rootNode?.id) return [];

        const rootId = String(rootNode.id);

        const ids = new Set([rootId]);

        let changed = true;

        while (changed) {

            changed = false;

            state.nodes.forEach((node) => {

                if (!node || node.kind === 'link') return;

                const nodeId = String(node.id || '');

                if (!nodeId || ids.has(nodeId)) return;

                const parentId = text(node?.data?.anchorNodeId, '');

                if (parentId && ids.has(parentId)) {

                    ids.add(nodeId);

                    changed = true;

                }

            });

        }

        return Array.from(ids.values());

    }



    function toggleStaticBranch(rootNode) {

        if (!rootNode?.id) return false;

        const rootId = String(rootNode.id);

        if (state.staticBranchRoots.has(rootId)) {

            const previousIds = state.staticBranchRoots.get(rootId) || [];

            state.staticBranchRoots.delete(rootId);

            recomputeStaticBranchNodeIds();

            previousIds.forEach((nodeId) => {

                const targetNode = state.nodeIndex.get(String(nodeId));

                if (!targetNode) return;

                const targetState = getStaticStateForNode(targetNode);

                if (!targetState.nodeLocked && !targetState.kindLocked && !targetState.branchLocked) {

                    targetNode.staticAnchor = null;

                }

            });

            return false;

        }

        const branchIds = getStaticBranchIds(rootNode);

        state.staticBranchRoots.set(rootId, branchIds);

        recomputeStaticBranchNodeIds();

        branchIds.forEach((nodeId) => {

            const targetNode = state.nodeIndex.get(String(nodeId));

            if (!targetNode) return;

            setStaticAnchor(targetNode);

        });

        return true;

    }



    function isStaticBranchRoot(node) {

        if (!node?.id) return false;

        return state.staticBranchRoots.has(String(node.id));

    }



    function clearStaticLocks() {

        state.staticNodeIds.clear();

        state.staticKinds.clear();

        state.staticBranchRoots.clear();

        state.staticBranchNodeIds.clear();

        state.nodes.forEach((node) => {

            if (!node) return;

            node.staticAnchor = null;

        });

    }



    function getStaticSummary() {

        return {

            nodeCount: state.staticNodeIds.size,

            kinds: Array.from(state.staticKinds.values()),

            branchCount: state.staticBranchRoots.size,

            total: state.staticNodeIds.size + state.staticKinds.size + state.staticBranchRoots.size

        };

    }

const sharedState = ns._shared = ns._shared || {};
    Object.assign(sharedState, {
        resetStaticLocks,
        getStaticStateForNode,
        isNodeStatic,
        setStaticAnchor,
        toggleStaticForNode,
        toggleStaticForKind,
        toggleStaticBranch,
        isStaticBranchRoot,
        clearStaticLocks,
        getStaticSummary
    });
})(window.EveConstellationMap);
