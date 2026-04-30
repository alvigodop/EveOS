window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexGraphProjection) return;

    function create(deps) {
        const shared = deps?.shared || {};
        const runtimeIntegrity = deps?.runtimeIntegrity || {};
        const ensureFresh = deps?.ensureFresh;
        const {
            text,
            toArray,
            readConfig,
            buildFolderPathLabel,
            computeFreshness
        } = shared;
        const {
            matchesScope,
            buildScopeRecordMatcher,
            computeVisibility,
            computeHealth
        } = runtimeIntegrity;
    function findWorkspaceMeta(workspaceId, fallbackLabel, fallbackFullLabel) {
        const workspaces = toArray(readConfig().workspaces);
        const helpers = window.EveWorkspaceHelpers;
        const match = helpers?.findById
            ? helpers.findById(workspaces, workspaceId)
            : workspaces.find(function (workspace) {
                return text(workspace?.id, '') === text(workspaceId, '');
            }) || null;
        const parent = helpers?.findParent
            ? helpers.findParent(workspaces, workspaceId)
            : null;

        return {
            label: text(match?.name, fallbackLabel || workspaceId),
            fullLabel: text(fallbackFullLabel, text(match?.name, fallbackLabel || workspaceId)),
            parentWorkspaceId: text(parent?.id, ''),
            hiddenInParent: !!match?.hiddenInParent
        };
    }

    async function buildGraphProjection(options) {
        const snapshot = options?.snapshot || await ensureFresh();
        const scope = options?.scope || null;
        const inScope = typeof buildScopeRecordMatcher === 'function'
            ? buildScopeRecordMatcher(snapshot, scope)
            : function (record) { return matchesScope(record, scope); };
        const records = toArray(snapshot?.records).filter(function (record) {
            return inScope(record);
        });
        const nodes = [];
        const edges = [];
        const nodeById = new Map();
        const edgeKeys = new Set();
        const folderNodeMeta = new Map();
        const workspaceNodeMeta = new Map();

        function ensureNode(id, payload) {
            const normalizedPayload = {};
            Object.keys(payload || {}).forEach(function (key) {
                if (typeof payload[key] !== 'undefined') normalizedPayload[key] = payload[key];
            });
            if (nodeById.has(id)) {
                const existing = nodeById.get(id);
                Object.assign(existing, normalizedPayload);
                return existing;
            }
            const node = Object.assign({ id: id }, normalizedPayload);
            nodeById.set(id, node);
            nodes.push(node);
            return node;
        }

        function addEdge(sourceId, targetId, type) {
            const source = text(sourceId, '');
            const target = text(targetId, '');
            if (!source || !target || source === target) return;
            const edgeType = text(type, 'hierarchy');
            const key = source + '::' + target + '::' + edgeType;
            if (edgeKeys.has(key)) return;
            edgeKeys.add(key);
            edges.push({ source: source, target: target, type: edgeType });
        }

        function getWorkspaceNodeId(workspaceId) {
            return 'workspace::' + text(workspaceId, 'main');
        }

        function getCardNodeId(workspaceId, categoryName) {
            return 'card::' + text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
        }

        function getFolderNodeId(workspaceId, categoryName, folderId) {
            return 'folder::' + text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted') + '::' + text(folderId, '');
        }

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;
            const visibility = computeVisibility(record);
            const health = computeHealth(record);
            const freshness = computeFreshness(record.updatedAt);
            const workspaceMeta = findWorkspaceMeta(
                workspaceId,
                record?.path?.workspaceTrail?.slice?.(-1)?.[0]?.name,
                record?.path?.workspaceLabel
            );

            const workspaceNodeId = getWorkspaceNodeId(workspaceId);
            const cardNodeId = getCardNodeId(workspaceId, categoryName);

            workspaceNodeMeta.set(workspaceNodeId, workspaceMeta);
            ensureNode(workspaceNodeId, {
                kind: 'workspace',
                label: workspaceMeta.label,
                workspaceId: workspaceId,
                workspaceLabel: workspaceMeta.fullLabel,
                hiddenInParent: workspaceMeta.hiddenInParent
            });
            ensureNode(cardNodeId, {
                kind: 'card',
                label: categoryName,
                workspaceId: workspaceId,
                categoryName: categoryName,
                pathLabel: text(record?.path?.pathLabel, categoryName),
                visibilityState: record?.type === 'card' ? visibility.state : undefined,
                healthState: record?.type === 'card' ? health.state : undefined,
                orphaned: !!record?.provenance?.orphaned
            });

            if (record.type === 'folder' && text(record?.path?.folderId, '')) {
                const folderId = text(record.path.folderId, '');
                const folderNodeId = getFolderNodeId(workspaceId, categoryName, folderId);
                folderNodeMeta.set(folderNodeId, {
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId,
                    parentFolderId: text(record?.parentFolderId || record?.provenance?.parentFolderId, ''),
                    label: text(record.title, record?.path?.folderLabel || buildFolderPathLabel(workspaceId, categoryName, folderId) || folderId)
                });
                ensureNode(folderNodeId, {
                    kind: 'folder',
                    label: text(record.title, record?.path?.folderLabel || 'Folder'),
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId,
                    pathLabel: text(record?.path?.pathLabel, ''),
                    visibilityState: visibility.state,
                    healthState: health.state,
                    freshnessState: freshness.state,
                    orphaned: !!record?.provenance?.orphaned
                });
                return;
            }

            if (text(record?.path?.folderId, '')) {
                const folderId = text(record.path.folderId, '');
                const folderNodeId = getFolderNodeId(workspaceId, categoryName, folderId);
                ensureNode(folderNodeId, {
                    kind: 'folder',
                    label: text(record?.path?.folderLabel, buildFolderPathLabel(workspaceId, categoryName, folderId) || 'Folder'),
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId
                });
            }

            if (record.type === 'card') return;

            ensureNode(record.id, {
                kind: record.type,
                sourceType: record.type,
                label: text(record.title, 'Untitled'),
                workspaceId: workspaceId,
                categoryName: categoryName,
                folderId: text(record?.path?.folderId, ''),
                linkId: text(record?.path?.linkId || record?.provenance?.linkId, ''),
                url: text(record?.url, ''),
                healthState: text(record?.healthState || record?.baseHealth?.state, 'healthy'),
                visibilityState: text(record?.visibilityState || visibility.state, 'visible'),
                freshnessState: freshness.state,
                orphaned: !!record?.provenance?.orphaned,
                pathLabel: text(record?.path?.pathLabel, ''),
                meta: text(record?.description, '')
            });
        });

        workspaceNodeMeta.forEach(function (meta, workspaceNodeId) {
            const workspaceId = text(nodeById.get(workspaceNodeId)?.workspaceId, '');
            if (!workspaceId) return;
            if (meta.parentWorkspaceId) {
                const parentWorkspaceMeta = findWorkspaceMeta(meta.parentWorkspaceId, meta.parentWorkspaceId, meta.parentWorkspaceId);
                const parentWorkspaceNodeId = getWorkspaceNodeId(meta.parentWorkspaceId);
                ensureNode(parentWorkspaceNodeId, {
                    kind: 'workspace',
                    label: parentWorkspaceMeta.label,
                    workspaceId: meta.parentWorkspaceId,
                    workspaceLabel: parentWorkspaceMeta.fullLabel,
                    hiddenInParent: parentWorkspaceMeta.hiddenInParent
                });
                addEdge(parentWorkspaceNodeId, workspaceNodeId, 'hierarchy');
            }
        });

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName) return;
            addEdge(getWorkspaceNodeId(workspaceId), getCardNodeId(workspaceId, categoryName), 'hierarchy');
        });

        folderNodeMeta.forEach(function (meta, folderNodeId) {
            const parentFolderId = text(meta.parentFolderId, '');
            const parentNodeId = parentFolderId
                ? getFolderNodeId(meta.workspaceId, meta.categoryName, parentFolderId)
                : getCardNodeId(meta.workspaceId, meta.categoryName);

            if (parentFolderId) {
                ensureNode(parentNodeId, {
                    kind: 'folder',
                    label: buildFolderPathLabel(meta.workspaceId, meta.categoryName, parentFolderId) || parentFolderId,
                    workspaceId: meta.workspaceId,
                    categoryName: meta.categoryName,
                    folderId: parentFolderId
                });
            }
            addEdge(parentNodeId, folderNodeId, 'hierarchy');
        });

        records.forEach(function (record) {
            const workspaceId = text(record?.workspaceId, '');
            const categoryName = text(record?.categoryName, '');
            if (!workspaceId || !categoryName || record.type === 'card' || record.type === 'folder') return;
            const folderId = text(record?.path?.folderId, '');
            const parentNodeId = folderId
                ? getFolderNodeId(workspaceId, categoryName, folderId)
                : getCardNodeId(workspaceId, categoryName);
            addEdge(parentNodeId, record.id, 'membership');
        });

        let preferredRootIds = [];
        const scopeType = text(scope?.scope, '');
        const scopeWorkspaceId = text(scope?.workspaceId, '');
        const scopeCategoryName = text(scope?.categoryName, '');
        const scopeFolderId = text(scope?.folderId, '');

        function uniqueRootIds(ids) {
            return Array.from(new Set(toArray(ids).map(function (value) { return text(value, ''); }).filter(Boolean)));
        }

        if (scopeType === 'workspace' && scopeWorkspaceId) {
            const workspaceNodeId = getWorkspaceNodeId(scopeWorkspaceId);
            preferredRootIds = edges
                .filter(function (edge) { return edge.source === workspaceNodeId; })
                .map(function (edge) { return edge.target; });
            if (!preferredRootIds.length && nodeById.has(workspaceNodeId)) preferredRootIds = [workspaceNodeId];
        } else if (scopeType === 'card' && scopeWorkspaceId && scopeCategoryName) {
            const cardNodeId = getCardNodeId(scopeWorkspaceId, scopeCategoryName);
            if (nodeById.has(cardNodeId)) preferredRootIds = [cardNodeId];
        } else if (scopeType === 'folder' && scopeWorkspaceId && scopeCategoryName && scopeFolderId) {
            const folderNodeId = getFolderNodeId(scopeWorkspaceId, scopeCategoryName, scopeFolderId);
            if (nodeById.has(folderNodeId)) preferredRootIds = [folderNodeId];
        } else if (scopeType === 'derived' && scopeWorkspaceId && scopeCategoryName) {
            const cardNodeId = getCardNodeId(scopeWorkspaceId, scopeCategoryName);
            if (nodeById.has(cardNodeId)) preferredRootIds = [cardNodeId];
        }

        preferredRootIds = uniqueRootIds(preferredRootIds);

        return {
            builtAt: snapshot?.builtAt || 0,
            scope: scope || null,
            nodes: nodes,
            edges: edges,
            preferredRootIds: preferredRootIds
        };
    }
        return {
            buildGraphProjection
        };
    }

    ns.IndexGraphProjection = { create };
})();