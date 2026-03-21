window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const graph = ns._graph || {};
    const render = ns._render || {};
    const physics = ns._physics || {};
    const view = ns._view || {};
    const detached = ns._detached || {};

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
        if (sourceNode.data?.detached) return false;

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

    function refreshGraphAfterMove(selectionId, options = {}) {
        if (!state.scope) return;
        const previousInfoCollapsed = !!state.infoCollapsed;
        const previousSelectionIds = new Set(state.selectionIds instanceof Set ? state.selectionIds : []);
        const previousNodePositions = new Map(
            state.nodes.map((node) => [String(node.id || ''), {
                x: Number(node.x) || 0,
                y: Number(node.y) || 0,
                vx: Number(node.vx) || 0,
                vy: Number(node.vy) || 0,
                manualAnchor: node?.manualAnchor && typeof node.manualAnchor === 'object'
                    ? {
                        x: Number(node.manualAnchor.x) || 0,
                        y: Number(node.manualAnchor.y) || 0,
                        driftRadius: Number(node.manualAnchor.driftRadius) || 0,
                        pullStrength: Number(node.manualAnchor.pullStrength) || 0,
                        damping: Number(node.manualAnchor.damping) || 0,
                        speed: Number(node.manualAnchor.speed) || 0,
                        phase: Number(node.manualAnchor.phase) || 0
                    }
                    : null,
                staticAnchor: node?.staticAnchor && typeof node.staticAnchor === 'object'
                    ? {
                        x: Number(node.staticAnchor.x) || 0,
                        y: Number(node.staticAnchor.y) || 0
                    }
                    : null
            }])
        );
        buildGraphData(state.scope, { preserveLocks: true });
        state.infoCollapsed = previousInfoCollapsed;
        state.selectionIds = new Set(
            Array.from(previousSelectionIds).filter((nodeId) => state.nodes.some((node) => node.id === nodeId))
        );
        state.nodes.forEach((node) => {
            const prior = previousNodePositions.get(String(node.id || ''));
            if (!prior) return;
            if (selectionId && String(node.id || '') === String(selectionId || '')) return;
            node.x = prior.x;
            node.y = prior.y;
            node.vx = prior.vx;
            node.vy = prior.vy;
            node.manualAnchor = prior.manualAnchor
                ? {
                    x: prior.manualAnchor.x,
                    y: prior.manualAnchor.y,
                    driftRadius: prior.manualAnchor.driftRadius,
                    pullStrength: prior.manualAnchor.pullStrength,
                    damping: prior.manualAnchor.damping,
                    speed: prior.manualAnchor.speed,
                    phase: prior.manualAnchor.phase
                }
                : null;
            node.staticAnchor = prior.staticAnchor
                ? {
                    x: prior.staticAnchor.x,
                    y: prior.staticAnchor.y
                }
                : null;
        });
        syncMotionAnchors(true);
        renderHeader();
        if (selectionId) {
            state.selected = state.nodes.find((node) => node.id === selectionId) || null;
            if (state.selected && options.snapToTargetNodeId) {
                const targetNode = state.nodes.find((node) => node.id === options.snapToTargetNodeId) || null;
                if (targetNode) {
                    state.selected.x = targetNode.x + Math.max(targetNode.radius + 24, 42);
                    state.selected.y = targetNode.y + 6;
                    state.selected.vx = 0;
                    state.selected.vy = 0;
                }
            }
        }
        renderInspector();
        renderToolbarState();
        requestDraw();
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
    }

    function resetTransientRewireState() {
        if (!state.rewire) return;
        state.rewire.dragging = false;
        state.rewire.sourceNodeId = '';
        state.rewire.sourceNodeIds = [];
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

    function getGroupedSourceNodes(node) {
        const selectionIds = state.selectionIds instanceof Set ? state.selectionIds : new Set();
        if (!node || !selectionIds.has(String(node.id || ''))) {
            return [node].filter(Boolean);
        }
        const selectedNodes = Array.from(selectionIds)
            .map((nodeId) => state.nodes.find((entry) => entry.id === nodeId) || null)
            .filter(Boolean);
        const liveLinkNodes = selectedNodes.filter((entry) => entry.kind === 'link' && !entry.data?.detached);
        if (liveLinkNodes.length >= 2 && liveLinkNodes.some((entry) => entry.id === node.id)) {
            return liveLinkNodes;
        }
        return [node];
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
        const sourceNodes = getGroupedSourceNodes(node);
        state.selected = node;
        state.rewire.dragging = false;
        state.rewire.sourceNodeId = text(node.id, '');
        state.rewire.sourceNodeIds = sourceNodes.map((entry) => text(entry.id, ''));
        state.rewire.targetNodeId = '';
        state.rewire.validTargetIds = computeValidTargetIds(node);
        state.rewire.canDetachToRoot = canDetachNodeToRoot(node);
        state.rewire.previewWorldX = Number(node.x) || 0;
        state.rewire.previewWorldY = Number(node.y) || 0;
        state.rewire.sourceStartX = Number(node.x) || 0;
        state.rewire.sourceStartY = Number(node.y) || 0;
        state.rewire.hint = sourceNodes.length > 1
            ? ('Move ' + sourceNodes.length + ' selected bookmarks onto a card or folder.')
            : getDetachHint(node);
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
        if (node.data?.detached) return false;
        const folderApi = getFolderApi();
        if (!folderApi) return false;

        let changed = false;
        let selectionId = '';
        let message = '';

        if (node.kind === 'link') {
            const linkNodes = getGroupedSourceNodes(node)
                .filter((entry) => entry?.kind === 'link' && !entry.data?.detached);
            const links = linkNodes
                .map((entry) => getLiveLinkByNode(entry))
                .filter(Boolean);
            const primaryLink = links[0] || null;
            const detachableLinks = links.filter((entry) => !!text(entry?.folderId, ''));
            if (!primaryLink || !detachableLinks.length) return false;
            changed = !!folderApi.moveLinksToFolderTarget?.(
                detachableLinks.map((entry) => text(entry?.id, '')).filter(Boolean),
                text(primaryLink.workspace, 'main'),
                text(primaryLink.category, 'Unsorted'),
                '',
                { skipRender: true, skipSuggestions: true }
            );
            selectionId = 'link_' + text(detachableLinks[0]?.id, '');
            message = detachableLinks.length > 1
                ? ('Detached ' + detachableLinks.length + ' bookmarks to the card root.')
                : 'Bookmark detached to the card root.';
        } else if (node.kind === 'folder') {
            const folderRecord = getFolderRecord(node);
            if (!folderRecord || !text(folderRecord.parentId, '')) return false;
            changed = !!folderApi.moveFolder?.(
                text(node.data?.workspaceId, 'main'),
                text(node.data?.categoryName, 'Unsorted'),
                text(node.data?.folderId, ''),
                '',
                { skipRender: true, skipSuggestions: true }
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

    function commitArmedSourceToTarget(targetSpec, options = {}) {
        const sourceNode = getSourceNode();
        if (!sourceNode || !targetSpec) return false;
        const result = sourceNode.kind === 'link'
            ? moveLinkToTarget(sourceNode, targetSpec)
            : moveFolderToTarget(sourceNode, targetSpec);
        if (!result) return false;

        resetTransientRewireState();
        refreshGraphAfterMove(result.selectionId, {
            snapToTargetNodeId: text(options.snapToTargetNodeId || targetSpec.targetNodeId, '')
        });
        if (!options.silent) {
            showRewireToast(result.message);
        }
        return true;
    }

    function detachNodeToParking(node, options = {}) {
        if (!canDetachNodeToParking(node)) return false;

        let entry = null;
        if (node.kind === 'folder') {
            entry = detached.parkFolderSubtree?.(
                text(node.data?.workspaceId, 'main'),
                text(node.data?.categoryName, 'Unsorted'),
                text(node.data?.folderId, '')
            ) || null;
        } else if (node.kind === 'link') {
            const link = getLiveLinkByNode(node);
            entry = detached.parkLink?.(link) || null;
        }

        if (!entry) return false;

        resetTransientRewireState();
        refreshGraphAfterMove(entry.kind === 'folder'
            ? 'detached_folder_' + text(entry.id, '') + '_' + text(entry.folder?.rootId, '')
            : 'detached_link_' + text(entry.id, ''));
        if (!options.silent) {
            showRewireToast('Chain detached into parking.');
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
        if (sourceNode?.data?.detached) {
            return detached.restoreDetachedEntry?.(text(sourceNode.data?.detachedEntryId, ''), targetSpec) || null;
        }
        const folderApi = getFolderApi();
        if (!folderApi?.moveLinksToFolderTarget) return null;
        const sourceNodes = getSourceNodes().filter((node) => node.kind === 'link' && !node.data?.detached);
        const linkIds = sourceNodes.length > 1
            ? sourceNodes.map((node) => text(node.data?.linkId, '')).filter(Boolean)
            : [text(sourceNode.data?.linkId, '')].filter(Boolean);
        if (!linkIds.length || isNoopTarget(sourceNode, targetSpec)) return null;
        const changed = !!folderApi.moveLinksToFolderTarget(
            linkIds,
            text(targetSpec.workspaceId, 'main'),
            text(targetSpec.categoryName, 'Unsorted'),
            text(targetSpec.folderId, ''),
            { skipRender: true, skipSuggestions: true }
        );
        if (!changed) return null;
        return {
            selectionId: 'link_' + linkIds[0],
            message: linkIds.length > 1
                ? ('Moved ' + linkIds.length + ' bookmarks to a new chain.')
                : (targetSpec.folderId ? 'Bookmark moved to a new folder chain.' : 'Bookmark moved to a new card root.')
        };
    }

    function moveFolderToTarget(sourceNode, targetSpec) {
        if (sourceNode?.data?.detached) {
            return detached.restoreDetachedEntry?.(text(sourceNode.data?.detachedEntryId, ''), targetSpec) || null;
        }
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
                text(targetSpec.targetParentId, ''),
                { skipRender: true, skipSuggestions: true }
            );
        } else {
            changed = !!folderApi.transferFolderToCategory?.(
                folderId,
                workspaceId,
                categoryName,
                text(targetSpec.workspaceId, workspaceId),
                text(targetSpec.categoryName, categoryName),
                text(targetSpec.targetParentId, ''),
                { skipRender: true, skipSuggestions: true }
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
            if (commitArmedSourceToTarget(targetSpec, {
                snapToTargetNodeId: text(targetNode?.id, '')
            })) {
                return true;
            }
        }

        sourceNode.x = sourceStartX;
        sourceNode.y = sourceStartY;
        sourceNode.vx = 0;
        sourceNode.vy = 0;

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
        return 'Drag or click a bookmark or folder to arm it, then drop or click a card or folder target. Use Detach to Parking when you want a floating orphan chain. In workspace or Unidex scope, target another card to transfer chains across cards.';
    }

    ns._coreRewire = ns._coreRewire || {};
    Object.assign(ns._coreRewire, {
        canRewireNode,
        canDetachNodeToRoot,
        canDetachNodeToParking,
        hasArmedSource,
        getArmedSourceCount,
        getRewireSummary,
        setRewireEnabled,
        armNodeForRewire,
        cancelRewire,
        beginRewireDrag,
        updateRewireDrag,
        finishRewireDrag,
        detachNodeToRoot,
        detachNodeToParking,
        refreshGraphAfterMove,
        commitArmedSourceToTarget
    });

    ns._canConstellationRewireNode = canRewireNode;
    ns._setConstellationRewireEnabled = setRewireEnabled;
    ns._armConstellationRewireNode = armNodeForRewire;
    ns._cancelConstellationRewire = cancelRewire;
    ns._beginConstellationRewireDrag = beginRewireDrag;
    ns._updateConstellationRewireDrag = updateRewireDrag;
    ns._finishConstellationRewireDrag = finishRewireDrag;
    ns._detachConstellationNodeToRoot = detachNodeToRoot;
    ns._detachConstellationNodeToParking = detachNodeToParking;
    ns._refreshConstellationGraphAfterMove = refreshGraphAfterMove;
    ns._commitConstellationRewireTarget = commitArmedSourceToTarget;
    ns._getConstellationRewireSummary = getRewireSummary;
})(window.EveConstellationMap);
