window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const graph = ns._graph || {};
    const render = ns._render || {};
    const physics = ns._physics || {};
    const view = ns._view || {};
    const detached = ns._detached || {};
    const rewire = ns._coreRewire = ns._coreRewire || {};

    const { state, text } = shared;
    const { buildGraphData } = graph;
    const {
        requestDraw,
        renderHeader,
        renderInspector,
        renderToolbarState,
        getScreenPoint
    } = render;
    const { syncMotionAnchors } = physics;
    const { canvasPointFromClient, getHitNode } = view;

    function getFolderApi() {
        return window.EveBookmarkFolders || null;
    }

    function getAllLinks() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        return [];
    }

    function getLiveLinkByNode(node) {
        if (!node || node.kind !== 'link') return null;
        const linkId = text(node.data?.linkId, '');
        if (!linkId) return null;
        return getAllLinks().find((link) => String(link?.id || '') === linkId) || null;
    }

    function getFolderRecord(node) {
        if (!node || node.kind !== 'folder') return null;
        const folderApi = getFolderApi();
        if (!folderApi?.getFolderById) return null;
        return folderApi.getFolderById(
            text(node.data?.workspaceId, 'main'),
            text(node.data?.categoryName, 'Unsorted'),
            text(node.data?.folderId, '')
        ) || null;
    }

    function isDetachedRootNode(node) {
        return !!node && !!node.data?.detached && !!node.data?.detachedRoot && !!text(node.data?.detachedEntryId, '');
    }

    function canRewireNode(node) {
        if (!node) return false;
        if (isDetachedRootNode(node)) return true;
        return node.kind === 'link' || node.kind === 'folder';
    }

    function getSourceNode() {
        const sourceNodeId = text(state.rewire?.sourceNodeId, '');
        if (!sourceNodeId) return null;
        return state.nodes.find((node) => node.id === sourceNodeId) || null;
    }

    function getSourceNodes() {
        const sourceNodeIds = Array.isArray(state.rewire?.sourceNodeIds) ? state.rewire.sourceNodeIds : [];
        if (!sourceNodeIds.length) {
            const singleNode = getSourceNode();
            return singleNode ? [singleNode] : [];
        }
        return sourceNodeIds
            .map((nodeId) => state.nodes.find((node) => node.id === nodeId) || null)
            .filter(Boolean);
    }

    function hasArmedSource() {
        return !!getSourceNode();
    }

    function getArmedSourceCount() {
        return getSourceNodes().length;
    }

    function getLinkLocation(link) {
        return {
            workspaceId: text(link?.workspace, 'main'),
            categoryName: text(link?.category, 'Unsorted'),
            folderId: text(link?.folderId, '')
        };
    }

    function getFolderLocation(node, folderRecord) {
        return {
            workspaceId: text(node?.data?.workspaceId, 'main'),
            categoryName: text(node?.data?.categoryName, 'Unsorted'),
            folderId: text(node?.data?.folderId, ''),
            parentId: text(folderRecord?.parentId, '')
        };
    }

    function canDetachNodeToRoot(node) {
        if (!node) return false;
        if (node.data?.detached) return false;
        if (node.kind === 'link') {
            return !!text(getLiveLinkByNode(node)?.folderId, '');
        }
        if (node.kind === 'folder') {
            return !!text(getFolderRecord(node)?.parentId, '');
        }
        return false;
    }

    function canDetachNodeToParking(node) {
        if (!node || node.data?.detached) return false;
        return node.kind === 'link' || node.kind === 'folder';
    }

    function getDropLabel(targetNode, targetSpec) {
        if (!targetNode || !targetSpec) return '';
        if (targetSpec.detachedEntryId && targetSpec.folderId) return 'Attach to detached folder: ' + text(targetNode.label, 'Folder');
        if (targetSpec.folderId) return 'Attach to folder: ' + text(targetNode.label, 'Folder');
        if (targetNode.kind === 'category') return 'Attach to card: ' + text(targetNode.label, 'Card');
        return 'Attach to ' + text(targetNode.label, 'target');
    }

    function getDetachHint(node) {
        if (!node) return 'Drag or click a bookmark or folder to rewire this chain.';
        if (canDetachNodeToRoot(node)) {
            return 'Drag or click onto a card or folder to rewire. Use an explicit detach action when you want to break ownership.';
        }
        return 'Drag or click onto a card or folder to rewire this chain.';
    }

    Object.assign(rewire, {
        state,
        text,
        buildGraphData,
        requestDraw,
        renderHeader,
        renderInspector,
        renderToolbarState,
        getScreenPoint,
        syncMotionAnchors,
        canvasPointFromClient,
        getHitNode,
        detached,
        getFolderApi,
        getAllLinks,
        getLiveLinkByNode,
        getFolderRecord,
        isDetachedRootNode,
        canRewireNode,
        getSourceNode,
        getSourceNodes,
        hasArmedSource,
        getArmedSourceCount,
        getLinkLocation,
        getFolderLocation,
        canDetachNodeToRoot,
        canDetachNodeToParking,
        getDropLabel,
        getDetachHint
    });
})(window.EveConstellationMap);
