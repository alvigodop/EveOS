window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const graph = ns._graph || {};
    const render = ns._render || {};
    const physics = ns._physics || {};
    const view = ns._view || {};

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

    function canRewireNode(node) {
        return !!node && (node.kind === 'link' || node.kind === 'folder');
    }

    function getSourceNode() {
        const sourceNodeId = text(state.rewire?.sourceNodeId, '');
        if (!sourceNodeId) return null;
        return state.nodes.find((node) => node.id === sourceNodeId) || null;
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
        if (node.kind === 'link') {
            return !!text(getLiveLinkByNode(node)?.folderId, '');
        }
        if (node.kind === 'folder') {
            return !!text(getFolderRecord(node)?.parentId, '');
        }
        return false;
    }

    function getDropLabel(targetNode, targetSpec) {
        if (!targetNode || !targetSpec) return '';
        if (targetSpec.folderId) return 'Attach to folder: ' + text(targetNode.label, 'Folder');
        if (targetNode.kind === 'category') return 'Attach to card: ' + text(targetNode.label, 'Card');
        return 'Attach to ' + text(targetNode.label, 'target');
    }

    function getDetachHint(node) {
        if (!node) return 'Drag or click a bookmark or folder to rewire this chain.';
        if (canDetachNodeToRoot(node)) {
            return 'Drag or click onto a card or folder to rewire. Drop on empty space to detach to the card root.';
        }
        return 'Drag or click onto a card or folder to rewire this chain.';
    }

    function getTargetSpec(sourceNode, targetNode) {
        if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return null;
        if (!canRewireNode(sourceNode)) return null;

        const targetWorkspaceId = text(targetNode.data?.workspaceId, '');
        const targetCategoryName = text(targetNode.data?.categoryName, '');

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
                    folderId: text(targetNode.data?.folderId, ''),
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, { folderId: text(targetNode.data?.folderId, '') })
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
                    targetParentId: text(targetNode.data?.folderId, ''),
                    targetNodeId: targetNode.id,
                    label: getDropLabel(targetNode, { folderId: text(targetNode.data?.folderId, '') })
                };
            }
        }

        return null;
    }

    function isNoopTarget(sourceNode, targetSpec) {
        if (!sourceNode || !targetSpec) return true;

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

    function refreshGraphAfterMove(selectionId) {
        if (!state.scope) return;
        buildGraphData(state.scope, { preserveLocks: true });
        syncMotionAnchors(true);
        renderHeader();
        if (selectionId) {
            state.selected = state.nodes.find((node) => node.id === selectionId) || null;
        }
        renderInspector();
        requestDraw();
    }

    function resetTransientRewireState() {
        if (!state.rewire) return;
        state.rewire.dragging = false;
        state.rewire.sourceNodeId = '';
        state.rewire.targetNodeId = '';
        state.rewire.validTargetIds = new Set();
        state.rewire.previewWorldX = 0;
        state.rewire.previewWorldY = 0;
        state.rewire.sourceStartX = 0;
        state.rewire.sourceStartY = 0;
        state.rewire.canDetachToRoot = false;
        state.rewire.hint = '';
    }

    function showRewireToast(message, level) {
        if (!message) return;
        if (typeof window.showToast === 'function') {
            window.showToast(message, level || 'success');
        }
    }

    function setRewireEnabled(force) {
        const nextValue = typeof force === 'boolean' ? force : !state.rewire.enabled;
        state.rewire.enabled = nextValue;
        if (!nextValue) {
            const sourceNode = getSourceNode();
            if (sourceNode && state.rewire.dragging) {
                sourceNode.x = Number(state.rewire.sourceStartX) || sourceNode.x;
                sourceNode.y = Number(state.rewire.sourceStartY) || sourceNode.y;
                sourceNode.vx = 0;
                sourceNode.vy = 0;
            }
            resetTransientRewireState();
        } else if (canRewireNode(state.selected)) {
            armNodeForRewire(state.selected, { keepEnabled: true });
        } else {
            state.rewire.hint = 'Drag or click a bookmark or folder to rewire its chain.';
        }
        renderToolbarState();
        renderInspector();
        requestDraw();
        return state.rewire.enabled;
    }

    function armNodeForRewire(node, options = {}) {
        if (!canRewireNode(node)) return false;
        if (!options.keepEnabled) {
            state.rewire.enabled = true;
        }
        state.selected = node;
        state.rewire.dragging = false;
        state.rewire.sourceNodeId = text(node.id, '');
        state.rewire.targetNodeId = '';
        state.rewire.validTargetIds = computeValidTargetIds(node);
        state.rewire.canDetachToRoot = canDetachNodeToRoot(node);
        state.rewire.previewWorldX = Number(node.x) || 0;
        state.rewire.previewWorldY = Number(node.y) || 0;
        state.rewire.sourceStartX = Number(node.x) || 0;
        state.rewire.sourceStartY = Number(node.y) || 0;
        state.rewire.hint = getDetachHint(node);
        renderToolbarState();
        renderInspector();
        requestDraw();
        return true;
    }

    function cancelRewire(options = {}) {
        const sourceNode = getSourceNode();
        if (sourceNode && state.rewire.dragging && options.restoreSource !== false) {
            sourceNode.x = Number(state.rewire.sourceStartX) || sourceNode.x;
            sourceNode.y = Number(state.rewire.sourceStartY) || sourceNode.y;
            sourceNode.vx = 0;
            sourceNode.vy = 0;
        }
        resetTransientRewireState();
        if (options.disableMode) {
            state.rewire.enabled = false;
        }
        renderToolbarState();
        renderInspector();
        requestDraw();
    }

    function detachNodeToRoot(node, options = {}) {
        if (!canRewireNode(node)) return false;
        const folderApi = getFolderApi();
        if (!folderApi) return false;

        let changed = false;
        let selectionId = '';
        let message = '';

        if (node.kind === 'link') {
            const link = getLiveLinkByNode(node);
            if (!link || !text(link.folderId, '')) return false;
            changed = !!folderApi.moveLinksToFolderTarget?.(
                [text(node.data?.linkId, '')],
                text(link.workspace, 'main'),
                text(link.category, 'Unsorted'),
                ''
            );
            selectionId = 'link_' + text(node.data?.linkId, '');
            message = 'Bookmark detached to the card root.';
        } else if (node.kind === 'folder') {
            const folderRecord = getFolderRecord(node);
            if (!folderRecord || !text(folderRecord.parentId, '')) return false;
            changed = !!folderApi.moveFolder?.(
                text(node.data?.workspaceId, 'main'),
                text(node.data?.categoryName, 'Unsorted'),
                text(node.data?.folderId, ''),
                ''
            );
            selectionId = 'folder_' + text(node.data?.workspaceId, 'main') + '_' + text(node.data?.categoryName, 'Unsorted') + '_' + text(node.data?.folderId, '');
            message = 'Folder branch detached to the card root.';
        }

        if (!changed) return false;

        resetTransientRewireState();
        refreshGraphAfterMove(selectionId);
        if (!options.silent) {
            showRewireToast(message);
        }
        return true;
    }

    function beginRewireDrag(node, worldPoint) {
        if (!canRewireNode(node)) return false;
        armNodeForRewire(node, { keepEnabled: true });
        state.rewire.dragging = true;
        state.rewire.sourceStartX = Number(node.x) || 0;
        state.rewire.sourceStartY = Number(node.y) || 0;
        state.rewire.previewWorldX = Number(worldPoint?.x) || Number(node.x) || 0;
        state.rewire.previewWorldY = Number(worldPoint?.y) || Number(node.y) || 0;
        state.rewire.hint = 'Move toward a card or folder, or click a valid target, to rewire this chain.';
        renderToolbarState();
        renderInspector();
        requestDraw();
        return true;
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

    function updateRewireDrag(clientX, clientY, worldPoint) {
        const sourceNode = getSourceNode();
        if (!sourceNode || !state.rewire.dragging) return false;

        sourceNode.x = Number(worldPoint?.x) || sourceNode.x;
        sourceNode.y = Number(worldPoint?.y) || sourceNode.y;
        sourceNode.vx = 0;
        sourceNode.vy = 0;
        state.rewire.previewWorldX = Number(worldPoint?.x) || 0;
        state.rewire.previewWorldY = Number(worldPoint?.y) || 0;

        const target = findNearestValidTarget(clientX, clientY, sourceNode);
        state.rewire.targetNodeId = text(target?.node?.id, '');
        state.rewire.hint = target?.spec?.label || getDetachHint(sourceNode);
        requestDraw();
        renderInspector();
        return true;
    }

    function moveLinkToTarget(sourceNode, targetSpec) {
        const folderApi = getFolderApi();
        if (!folderApi?.moveLinksToFolderTarget) return null;
        const linkId = text(sourceNode.data?.linkId, '');
        if (!linkId || isNoopTarget(sourceNode, targetSpec)) return null;
        const changed = !!folderApi.moveLinksToFolderTarget(
            [linkId],
            text(targetSpec.workspaceId, 'main'),
            text(targetSpec.categoryName, 'Unsorted'),
            text(targetSpec.folderId, '')
        );
        if (!changed) return null;
        return {
            selectionId: 'link_' + linkId,
            message: targetSpec.folderId
                ? 'Bookmark moved to a new folder chain.'
                : 'Bookmark moved to a new card root.'
        };
    }

    function moveFolderToTarget(sourceNode, targetSpec) {
        const folderApi = getFolderApi();
        if (!folderApi) return null;
        const workspaceId = text(sourceNode.data?.workspaceId, 'main');
        const categoryName = text(sourceNode.data?.categoryName, 'Unsorted');
        const folderId = text(sourceNode.data?.folderId, '');
        if (!folderId || isNoopTarget(sourceNode, targetSpec)) return null;

        let changed = false;
        if (workspaceId === text(targetSpec.workspaceId, workspaceId) && categoryName === text(targetSpec.categoryName, categoryName)) {
            changed = !!folderApi.moveFolder?.(
                workspaceId,
                categoryName,
                folderId,
                text(targetSpec.targetParentId, '')
            );
        } else {
            changed = !!folderApi.transferFolderToCategory?.(
                folderId,
                workspaceId,
                categoryName,
                text(targetSpec.workspaceId, workspaceId),
                text(targetSpec.categoryName, categoryName),
                text(targetSpec.targetParentId, '')
            );
        }

        if (!changed) return null;

        return {
            selectionId: buildSelectionIdFromMove(sourceNode, targetSpec),
            message: text(targetSpec.targetParentId, '')
                ? 'Folder branch moved to a new parent folder.'
                : 'Folder branch moved to a new card root.'
        };
    }

    function finishRewireDrag(clientX, clientY) {
        const sourceNode = getSourceNode();
        if (!sourceNode) {
            cancelRewire({ restoreSource: false });
            return false;
        }

        const sourceStartX = Number(state.rewire.sourceStartX) || sourceNode.x;
        const sourceStartY = Number(state.rewire.sourceStartY) || sourceNode.y;
        const releaseTarget = Number.isFinite(clientX) && Number.isFinite(clientY)
            ? findNearestValidTarget(clientX, clientY, sourceNode)
            : null;
        const targetNode = releaseTarget?.node || state.nodes.find((node) => node.id === state.rewire.targetNodeId) || null;
        const targetSpec = releaseTarget?.spec || getTargetSpec(sourceNode, targetNode);

        if (targetSpec && !isNoopTarget(sourceNode, targetSpec)) {
            const result = sourceNode.kind === 'link'
                ? moveLinkToTarget(sourceNode, targetSpec)
                : moveFolderToTarget(sourceNode, targetSpec);

            resetTransientRewireState();

            if (result) {
                refreshGraphAfterMove(result.selectionId);
                showRewireToast(result.message);
                return true;
            }
        }

        sourceNode.x = sourceStartX;
        sourceNode.y = sourceStartY;
        sourceNode.vx = 0;
        sourceNode.vy = 0;

        if (!targetNode && canDetachNodeToRoot(sourceNode)) {
            const detached = detachNodeToRoot(sourceNode, { silent: true });
            if (detached) {
                showRewireToast('Chain detached to the card root.');
                return true;
            }
        }

        cancelRewire({ restoreSource: false });
        return false;
    }

    function getRewireSummary() {
        const sourceNode = getSourceNode();
        if (!state.rewire.enabled) return 'Chain Surgery is off. Turn it on to move bookmarks and folders between cards and folders.';
        if (state.rewire.dragging && text(state.rewire.targetNodeId, '')) {
            return text(state.rewire.hint, 'Drop to rewire this chain.');
        }
        if (sourceNode) {
            return text(state.rewire.hint, getDetachHint(sourceNode));
        }
        return 'Drag or click a bookmark or folder to arm it, then drop or click a card or folder target. In Unidex or workspace scope, target another card to transfer chains across cards.';
    }

    ns._coreRewire = ns._coreRewire || {};
    Object.assign(ns._coreRewire, {
        canRewireNode,
        canDetachNodeToRoot,
        getRewireSummary,
        setRewireEnabled,
        armNodeForRewire,
        cancelRewire,
        beginRewireDrag,
        updateRewireDrag,
        finishRewireDrag,
        detachNodeToRoot
    });

    ns._canConstellationRewireNode = canRewireNode;
    ns._setConstellationRewireEnabled = setRewireEnabled;
    ns._armConstellationRewireNode = armNodeForRewire;
    ns._cancelConstellationRewire = cancelRewire;
    ns._beginConstellationRewireDrag = beginRewireDrag;
    ns._updateConstellationRewireDrag = updateRewireDrag;
    ns._finishConstellationRewireDrag = finishRewireDrag;
    ns._detachConstellationNodeToRoot = detachNodeToRoot;
    ns._getConstellationRewireSummary = getRewireSummary;
})(window.EveConstellationMap);
