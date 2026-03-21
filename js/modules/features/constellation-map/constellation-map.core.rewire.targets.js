window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const rewire = ns._coreRewire = ns._coreRewire || {};
    const {
        state,
        text,
        canRewireNode,
        getDropLabel,
        getLinkLocation,
        getLiveLinkByNode,
        getFolderRecord,
        getFolderLocation,
        getHitNode,
        canvasPointFromClient,
        getScreenPoint
    } = rewire;

    function getTargetSpec(sourceNode, targetNode) {
        if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return null;
        if (!canRewireNode(sourceNode)) return null;
        if (sourceNode.data?.detached && targetNode.data?.detached) return null;

        const targetWorkspaceId = text(targetNode.data?.workspaceId, '');
        const targetCategoryName = text(targetNode.data?.categoryName, '');
        const targetDetachedEntryId = text(targetNode.data?.detachedEntryId, '');
        const targetFolderId = text(targetNode.data?.folderId, '');

        if (sourceNode.kind === 'link') {
            if (targetNode.kind === 'category') {
                return {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    folderId: '',
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, { folderId: '' })
                };
            }
            if (targetNode.kind === 'folder') {
                return {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    folderId: targetFolderId,
                    detachedEntryId: targetNode.data?.detached ? targetDetachedEntryId : '',
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, {
                        folderId: targetFolderId,
                        detachedEntryId: targetNode.data?.detached ? targetDetachedEntryId : ''
                    })
                };
            }
            return null;
        }

        if (sourceNode.kind === 'folder') {
            if (targetNode.kind === 'category') {
                return {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    targetParentId: '',
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, { folderId: '' })
                };
            }
            if (targetNode.kind === 'folder') {
                return {
                    workspaceId: targetWorkspaceId,
                    categoryName: targetCategoryName,
                    targetParentId: targetFolderId,
                    detachedEntryId: targetNode.data?.detached ? targetDetachedEntryId : '',
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, {
                        folderId: targetFolderId,
                        detachedEntryId: targetNode.data?.detached ? targetDetachedEntryId : ''
                    })
                };
            }
        }

        return null;
    }

    function isNoopTarget(sourceNode, targetSpec) {
        if (!sourceNode || !targetSpec) return true;
        if (sourceNode.data?.detached) return false;
        if (targetSpec.detachedEntryId) return false;

        if (sourceNode.kind === 'link') {
            const link = getLiveLinkByNode(sourceNode);
            if (!link) return true;
            const location = getLinkLocation(link);
            return location.workspaceId === text(targetSpec.workspaceId, location.workspaceId)
                && location.categoryName === text(targetSpec.categoryName, location.categoryName)
                && location.folderId === text(targetSpec.folderId, location.folderId);
        }

        if (sourceNode.kind === 'folder') {
            const folderRecord = getFolderRecord(sourceNode);
            const location = getFolderLocation(sourceNode, folderRecord);
            return location.workspaceId === text(targetSpec.workspaceId, location.workspaceId)
                && location.categoryName === text(targetSpec.categoryName, location.categoryName)
                && location.parentId === text(targetSpec.targetParentId, location.parentId);
        }

        return true;
    }

    function computeValidTargetIds(sourceNode) {
        const next = new Set();
        if (!canRewireNode(sourceNode)) return next;
        state.nodes.forEach((node) => {
            const spec = getTargetSpec(sourceNode, node);
            if (spec && !isNoopTarget(sourceNode, spec)) {
                next.add(String(node.id || ''));
            }
        });
        return next;
    }

    function buildSelectionIdFromMove(sourceNode, targetSpec) {
        if (!sourceNode || !targetSpec) return '';
        if (sourceNode.kind === 'link') {
            return 'link_' + text(sourceNode.data?.linkId, '');
        }
        if (sourceNode.kind === 'folder') {
            return 'folder_' + text(targetSpec.workspaceId, '') + '_' + text(targetSpec.categoryName, '') + '_' + text(sourceNode.data?.folderId, '');
        }
        return '';
    }

    function findNearestValidTarget(clientX, clientY, sourceNode) {
        if (!canRewireNode(sourceNode)) return null;

        const directNode = getHitNode(clientX, clientY);
        const directSpec = getTargetSpec(sourceNode, directNode);
        if (directSpec && !isNoopTarget(sourceNode, directSpec)) {
            return { node: directNode, spec: directSpec };
        }

        const point = canvasPointFromClient(clientX, clientY);
        let best = null;
        let bestScore = Infinity;

        state.nodes.forEach((node) => {
            if (String(node.id || '') === String(sourceNode.id || '')) return;
            if (!state.rewire.validTargetIds.has(String(node.id || ''))) return;
            const spec = getTargetSpec(sourceNode, node);
            if (!spec || isNoopTarget(sourceNode, spec)) return;
            const screen = getScreenPoint(node);
            const dx = point.x - screen.x;
            const dy = point.y - screen.y;
            const distSq = (dx * dx) + (dy * dy);
            const threshold = Math.max(96, (Number(node.radius) || 0) * (Number(state.transform.scale) || 1) + 56);
            if (distSq > (threshold * threshold)) return;
            if (distSq < bestScore) {
                best = { node, spec };
                bestScore = distSq;
            }
        });

        return best;
    }

    Object.assign(rewire, {
        getTargetSpec,
        isNoopTarget,
        computeValidTargetIds,
        buildSelectionIdFromMove,
        findNearestValidTarget
    });
})(window.EveConstellationMap);
