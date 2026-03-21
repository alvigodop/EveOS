window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const rewire = ns._coreRewire = ns._coreRewire || {};
    const {
        state,
        text,
        detached,
        requestDraw,
        renderInspector,
        renderToolbarState,
        canRewireNode,
        canDetachNodeToRoot,
        canDetachNodeToParking,
        getSourceNode,
        getSourceNodes,
        getDetachHint,
        computeValidTargetIds,
        getTargetSpec,
        isNoopTarget,
        buildSelectionIdFromMove,
        findNearestValidTarget,
        getLiveLinkByNode,
        getFolderRecord,
        getFolderApi,
        getGroupedSourceNodes,
        resetTransientRewireState,
        refreshGraphAfterMove,
        showRewireToast
    } = rewire;

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

    function moveLinkToTarget(sourceNode, targetSpec) {
        if (sourceNode?.data?.detached) {
            return detached.restoreDetachedEntry?.(text(sourceNode.data?.detachedEntryId, ''), targetSpec) || null;
        }
        if (text(targetSpec?.detachedEntryId, '')) {
            const sourceNodes = getSourceNodes().filter((node) => node.kind === 'link' && !node.data?.detached);
            const linkIds = sourceNodes.length > 1
                ? sourceNodes.map((node) => text(node.data?.linkId, '')).filter(Boolean)
                : [text(sourceNode.data?.linkId, '')].filter(Boolean);
            return detached.attachLiveLinksToEntry?.(
                text(targetSpec.detachedEntryId, ''),
                linkIds,
                text(targetSpec.folderId, '')
            ) || null;
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
        if (text(targetSpec?.detachedEntryId, '')) {
            return detached.attachLiveFolderToEntry?.(
                text(targetSpec.detachedEntryId, ''),
                text(sourceNode.data?.workspaceId, 'main'),
                text(sourceNode.data?.categoryName, 'Unsorted'),
                text(sourceNode.data?.folderId, ''),
                text(targetSpec.targetParentId || targetSpec.folderId, '')
            ) || null;
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

    Object.assign(rewire, {
        setRewireEnabled,
        armNodeForRewire,
        cancelRewire,
        moveLinkToTarget,
        moveFolderToTarget,
        commitArmedSourceToTarget,
        detachNodeToRoot,
        detachNodeToParking,
        beginRewireDrag,
        updateRewireDrag,
        finishRewireDrag,
        getRewireSummary
    });
})(window.EveConstellationMap);
