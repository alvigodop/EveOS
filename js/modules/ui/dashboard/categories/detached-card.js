window.EveDetachedDashboardCard = window.EveDetachedDashboardCard || {};

(function (ns) {
    function getDetachedApi() {
        return window.EveConstellationMap?._detached || null;
    }

    function getParkingCategoryName() {
        return String(getDetachedApi()?.PARKING_CATEGORY_NAME || 'Detached Nodes').trim() || 'Detached Nodes';
    }

    function normalizeWorkspaceId(workspaceId) {
        return String(workspaceId || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
    }

    function getDetachedEntriesForWorkspace(workspaceId) {
        const detachedApi = getDetachedApi();
        return typeof detachedApi?.getDetachedEntriesForScope === 'function'
            ? detachedApi.getDetachedEntriesForScope({ scope: 'workspace', workspaceId: normalizeWorkspaceId(workspaceId) })
            : [];
    }

    function isDetachedParkingCategory(categoryName, workspaceId) {
        const normalizedCategoryName = String(categoryName || '').trim();
        if (!normalizedCategoryName || normalizedCategoryName !== getParkingCategoryName()) return false;
        const entries = getDetachedEntriesForWorkspace(workspaceId);
        return Array.isArray(entries) && entries.length > 0;
    }

    function buildDetachedDashboardModel(workspaceId) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const parkingCategoryName = getParkingCategoryName();
        const entries = getDetachedEntriesForWorkspace(normalizedWorkspaceId);
        if (!Array.isArray(entries) || !entries.length) return null;

        const nodes = [];
        const rootLinks = [];
        const folderLinks = new Map();
        const childrenMap = new Map();
        const topLevelFolders = [];

        function pushChild(parentId, node) {
            const key = parentId || null;
            if (!childrenMap.has(key)) childrenMap.set(key, []);
            childrenMap.get(key).push(node);
        }

        entries.forEach(function (entry) {
            if (!entry || entry.workspaceId !== normalizedWorkspaceId) return;
            if (entry.kind === 'link') {
                const liveishLink = Object.assign({}, entry.link || {}, {
                    workspace: normalizedWorkspaceId,
                    category: parkingCategoryName,
                    detached: true,
                    detachedEntryId: String(entry.id || '')
                });
                rootLinks.push(liveishLink);
                return;
            }

            const folderData = entry.folder || {};
            const folderNodes = Array.isArray(folderData.nodes) ? folderData.nodes : [];
            const folderLinksRaw = Array.isArray(folderData.links) ? folderData.links : [];
            const idMap = new Map();

            folderNodes.forEach(function (node) {
                const originalId = String(node?.id || '');
                if (!originalId) return;
                idMap.set(originalId, 'detached::' + String(entry.id || '') + '::' + originalId);
            });

            folderNodes.forEach(function (node) {
                const originalId = String(node?.id || '');
                const syntheticId = idMap.get(originalId);
                if (!syntheticId) return;
                const syntheticNode = Object.assign({}, node, {
                    id: syntheticId,
                    parentId: idMap.get(String(node?.parentId || '')) || null,
                    detachedEntryId: String(entry.id || ''),
                    detachedOriginalId: originalId,
                    detachedEntryRoot: originalId === String(folderData?.rootId || '')
                });
                nodes.push(syntheticNode);
                if (!syntheticNode.parentId) topLevelFolders.push(syntheticNode);
                pushChild(syntheticNode.parentId, syntheticNode);
            });

            folderLinksRaw.forEach(function (link) {
                const syntheticFolderId = idMap.get(String(link?.folderId || '')) || '';
                const liveishLink = Object.assign({}, link || {}, {
                    workspace: normalizedWorkspaceId,
                    category: parkingCategoryName,
                    folderId: syntheticFolderId,
                    detached: true,
                    detachedEntryId: String(entry.id || '')
                });
                if (!folderLinks.has(syntheticFolderId)) folderLinks.set(syntheticFolderId, []);
                folderLinks.get(syntheticFolderId).push(liveishLink);
            });
        });

        topLevelFolders.sort(function (left, right) {
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        });
        childrenMap.forEach(function (items) {
            items.sort(function (left, right) {
                return String(left?.name || '').localeCompare(String(right?.name || ''));
            });
        });

        return {
            categoryName: parkingCategoryName,
            links: rootLinks.concat(Array.from(folderLinks.values()).flat()),
            viewModel: {
                nodes: nodes,
                rootLinks: rootLinks,
                topLevelFolders: topLevelFolders,
                childrenMap: childrenMap,
                folderLinks: folderLinks
            }
        };
    }

    function openDetachedParkingMap(workspaceId) {
        const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
        if (window.EveConstellationMap?.openWorkspaceMap) {
            window.EveConstellationMap.openWorkspaceMap(normalizedWorkspaceId);
            return true;
        }
        return false;
    }

    function buildDetachedContextMenuHtml(categoryName, workspaceId) {
        if (!isDetachedParkingCategory(categoryName, workspaceId)) return '';
        const safeWorkspace = String(normalizeWorkspaceId(workspaceId)).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeCategory = String(getParkingCategoryName()).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return ''
            + `<div class="ctx-item" onclick="if(window.EveDetachedDashboardCard) window.EveDetachedDashboardCard.openDetachedParkingMap('${safeWorkspace}')">&#127756; Open Detached Map</div>`
            + `<div class="ctx-item" onclick="setFocus('${safeCategory}')">&#127919; Focus</div>`
            + '<div class="ctx-item" onclick="bulkToggleCardScopeSelection(\'' + safeCategory + '\', \'' + safeWorkspace + '\')">&#9745; Select Card</div>';
    }

    Object.assign(ns, {
        getParkingCategoryName,
        isDetachedParkingCategory,
        buildDetachedDashboardModel,
        openDetachedParkingMap,
        buildDetachedContextMenuHtml
    });
})(window.EveDetachedDashboardCard);
