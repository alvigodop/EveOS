window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersFolders) return;

    const shared = ns.IndexShared;
    const folderDiagnostics = ns.IndexRecordFolderDiagnostics;
    if (!shared || !folderDiagnostics) return;

    const {
        text,
        normalizeText,
        toArray,
        getScopedKey,
        getWorkspaceGroupMeta,
        deriveBaseHealth,
        buildFolderPathLabel
    } = shared;

    function createEntityLink(source) {
        const api = window.EveOS?.NebulaJsonLink
            || window.EveOS?.SearchAdvanced?.NebulaJsonLink
            || window.NebulaJsonLink
            || null;
        return api && typeof api.createLink === 'function' ? api.createLink(source) : '';
    }

    function buildLinksByScopedKey(links) {
        const map = new Map();
        toArray(links).forEach(function (link) {
            if (!link) return;
            const scopedKey = getScopedKey(text(link.workspace, 'main'), text(link.category, 'Unsorted'));
            if (!map.has(scopedKey)) map.set(scopedKey, []);
            map.get(scopedKey).push(link);
        });
        return map;
    }

    function countFolderBranch(viewModel, folderId, seen) {
        const id = text(folderId, '');
        if (!id || !viewModel) {
            return { totalBookmarks: 0, childFolderCount: 0 };
        }
        const visited = seen || new Set();
        if (visited.has(id)) {
            return { totalBookmarks: 0, childFolderCount: 0 };
        }
        visited.add(id);

        let totalBookmarks = toArray(viewModel.folderLinks?.get(id)).length;
        let childFolderCount = 0;
        const children = toArray(viewModel.childrenMap?.get(id));
        children.forEach(function (childFolder) {
            const childId = text(childFolder?.id, '');
            if (!childId) return;
            childFolderCount += 1;
            const childCounts = countFolderBranch(viewModel, childId, visited);
            totalBookmarks += Number(childCounts.totalBookmarks || 0);
            childFolderCount += Number(childCounts.childFolderCount || 0);
        });

        return {
            totalBookmarks: totalBookmarks,
            childFolderCount: childFolderCount
        };
    }

    function buildFolderRecords(links, categoryMap) {
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView) return [];

        const locators = ns.Locators || {};
        const knownWorkspaceIds = window.EveOS?.SearchAdvanced?.CacheAggregator?.getKnownWorkspaceIds
            ? window.EveOS.SearchAdvanced.CacheAggregator.getKnownWorkspaceIds()
            : new Set(['main']);
        const linksByScopedKey = buildLinksByScopedKey(links);
        const records = [];

        Array.from(categoryMap.values()).forEach(function (category) {
            const workspaceId = text(category.workspaceId, 'main');
            const categoryName = text(category.categoryName, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            const categoryLinks = linksByScopedKey.get(scopedKey) || [];
            const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks, { skipGhosts: true });
            const folderIntegrity = typeof folderApi.collectFolderIntegrity === 'function'
                ? folderApi.collectFolderIntegrity({ workspaceId, categoryName })
                : null;
            const folderIssuesById = folderDiagnostics.buildFolderIssuesById(folderIntegrity);
            const groupMeta = getWorkspaceGroupMeta(workspaceId);
            const visitedFolderIds = new Set();

            function visit(folderNode, parentFolderId) {
                const folderId = text(folderNode?.id, '');
                if (!folderId || visitedFolderIds.has(folderId)) return;
                visitedFolderIds.add(folderId);

                const folderIssue = folderIssuesById.get(folderId) || { issueTypes: [], reasons: [] };
                const issueFlags = folderDiagnostics.getIssueFlags(folderIssue);
                const folderLabel = buildFolderPathLabel(workspaceId, categoryName, folderId) || text(folderNode?.name, 'Folder');
                const directBookmarkCount = toArray(viewModel.folderLinks?.get(folderId)).length;
                const branchCounts = countFolderBranch(viewModel, folderId);
                const childFolders = toArray(viewModel.childrenMap?.get(folderId));
                const path = locators.buildPathMeta
                    ? locators.buildPathMeta({
                        workspaceId: workspaceId,
                        workspaceIds: [workspaceId],
                        categoryName: categoryName,
                        folderId: folderId,
                        folderLabel: folderLabel
                    })
                    : {
                        workspaceId: workspaceId,
                        workspaceIds: [workspaceId],
                        categoryName: categoryName,
                        folderId: folderId,
                        folderLabel: folderLabel,
                        pathLabel: [workspaceId, categoryName, folderLabel].filter(Boolean).join(' > ')
                    };
                const entityLink = createEntityLink({
                    type: 'folder',
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    folderId: folderId
                });
                const record = {
                    id: 'folder::' + scopedKey + '::' + folderId,
                    type: 'folder',
                    entityLink: entityLink,
                    title: text(folderNode?.name, folderLabel || 'Folder'),
                    url: '',
                    displayUrl: '',
                    description: branchCounts.totalBookmarks
                        ? (branchCounts.totalBookmarks + ' bookmark' + (branchCounts.totalBookmarks === 1 ? '' : 's')
                            + ' in ' + folderLabel)
                        : ('Empty folder in ' + text(path.workspaceLabel, workspaceId)),
                    provider: 'folder',
                    sourceCard: categoryName,
                    sourceIdentity: {
                        kind: 'folder',
                        folderId: folderId,
                        categoryName: categoryName
                    },
                    workspaceId: workspaceId,
                    workspaceIds: [workspaceId],
                    categoryName: categoryName,
                    parentFolderId: text(parentFolderId, ''),
                    path: path,
                    updatedAt: 0,
                    groupId: groupMeta.groupId,
                    groupName: groupMeta.groupName,
                    groupHidden: groupMeta.hidden,
                    provenance: {
                        kind: 'folder',
                        folderId: folderId,
                        entityLink: entityLink,
                        parentFolderId: text(parentFolderId, ''),
                        orphaned: !knownWorkspaceIds.has(workspaceId),
                        missingParent: issueFlags.folderUnreachable || issueFlags.folderParentBroken,
                        folderUnreachable: issueFlags.folderUnreachable,
                        folderParentBroken: issueFlags.folderParentBroken,
                        folderIssueTypes: issueFlags.issueTypes,
                        folderIssueReasons: issueFlags.issueReasons,
                        directBookmarkCount: directBookmarkCount,
                        bookmarkCount: branchCounts.totalBookmarks,
                        childFolderCount: childFolders.length,
                        totalChildFolderCount: branchCounts.childFolderCount
                    }
                };
                record.baseHealth = deriveBaseHealth(record);
                record.searchableText = normalizeText([
                    record.title,
                    folderLabel,
                    record.description,
                    categoryName,
                    path.pathLabel
                ].join(' '));
                records.push(record);

                childFolders.forEach(function (childFolder) {
                    visit(childFolder, folderId);
                });
            }

            toArray(viewModel.topLevelFolders).forEach(function (folderNode) {
                visit(folderNode, '');
            });
            toArray(viewModel.nodes).forEach(function (folderNode) {
                const folderId = text(folderNode?.id, '');
                if (folderId && !visitedFolderIds.has(folderId)) {
                    visit(folderNode, text(folderNode?.parentId, ''));
                }
            });
        });

        return records;
    }

    function buildDerivedGhostId(prefix, parts) {
        const helper = window.EveBookmarkFolders?._ghostRecursionHelpers?.buildDerivedGhostId;
        if (typeof helper === 'function') return helper(prefix, parts);
        return '__ghost_' + prefix + '_' + parts.map(function (part) {
            return String(part || '').replace(/[^a-zA-Z0-9]+/g, '_');
        }).join('_') + '__';
    }

    function buildSmartViewRecords(links, categoryMap) {
        const registry = window.EveSmartViewRegistry;
        const folderApi = window.EveBookmarkFolders;
        if (!registry || !folderApi?.buildFolderView) return [];

        const locators = ns.Locators || {};
        const linksByScopedKey = buildLinksByScopedKey(links);
        const records = [];
        const catalog = typeof registry.getBuiltInCatalog === 'function'
            ? registry.getBuiltInCatalog()
            : [];
        const legacyCategoryIds = {
            linkHealth: '__ghost_cat_linkHealth__',
            domains: '__ghost_cat_domains__',
            readingStatus: '__ghost_cat_readingStatus__',
            taskStatus: '__ghost_cat_taskStatus__',
            maintenance: '__ghost_cat_maintenance__',
            activity: '__ghost_cat_activity__',
            insights: '__ghost_cat_insights__',
            trueValue: '__ghost_cat_trueValue__',
            indexes: '__ghost_cat_indexes__'
        };

        Array.from(categoryMap.values()).forEach(function (category) {
            const workspaceId = text(category.workspaceId, 'main');
            const categoryName = text(category.categoryName, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            const categoryLinks = linksByScopedKey.get(scopedKey) || [];
            const groupMeta = getWorkspaceGroupMeta(workspaceId);
            const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks, { skipGhosts: true });
            const getCachedEntry = function (link) {
                return folderApi?._shared?.getLibraryEntryForLink
                    ? folderApi._shared.getLibraryEntryForLink(workspaceId, categoryName, link?.id)
                    : null;
            };
            const pathBase = locators.buildPathMeta
                ? locators.buildPathMeta({ workspaceId: workspaceId, workspaceIds: [workspaceId], categoryName: categoryName })
                : {
                    workspaceId: workspaceId,
                    workspaceIds: [workspaceId],
                    categoryName: categoryName,
                    pathLabel: [workspaceId, categoryName].filter(Boolean).join(' > ')
                };

            toArray(catalog).forEach(function (item) {
                const folderId = legacyCategoryIds[text(item?.id, '')] || '';
                if (!folderId) return;
                const title = text(item?.label, 'Smart View');
                const record = {
                    id: 'smartView::catalog::' + scopedKey + '::' + text(item?.id, ''),
                    type: 'smartView',
                    title: title,
                    url: '',
                    displayUrl: '',
                    description: 'Built-in Smart View. Criteria: ' + text(item?.criteria, ''),
                    provider: 'smart-view',
                    sourceCard: categoryName,
                    sourceIdentity: { kind: 'smartView', smartViewId: text(item?.id, '') },
                    workspaceId: workspaceId,
                    workspaceIds: [workspaceId],
                    categoryName: categoryName,
                    path: Object.assign({}, pathBase, {
                        folderId: folderId,
                        folderLabel: title,
                        pathLabel: [pathBase.pathLabel || workspaceId, 'System Views', title].filter(Boolean).join(' > ')
                    }),
                    updatedAt: 0,
                    groupId: groupMeta.groupId,
                    groupName: groupMeta.groupName,
                    groupHidden: groupMeta.hidden,
                    provenance: {
                        kind: 'smartView',
                        virtual: true,
                        builtIn: true,
                        smartViewId: text(item?.id, ''),
                        smartViewFolderId: folderId,
                        category: text(item?.category, ''),
                        criteria: text(item?.criteria, ''),
                        matchCount: categoryLinks.length
                    }
                };
                record.baseHealth = deriveBaseHealth(record);
                record.searchableText = normalizeText([
                    record.title,
                    record.description,
                    record.provenance.category,
                    record.provenance.criteria,
                    categoryName,
                    record.path.pathLabel
                ].join(' '));
                records.push(record);
            });

            const groups = typeof registry.buildGhostGroups === 'function'
                ? registry.buildGhostGroups({
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    activeLinks: categoryLinks,
                    scopedNodes: viewModel.nodes || [],
                    getCachedEntry: getCachedEntry
                })
                : [];

            toArray(groups).forEach(function (group, groupIndex) {
                const catKey = text(group?.categoryKey, 'smartViews');
                const groupKey = text(group?.groupKey, 'smartViews');
                toArray(group?.buckets).forEach(function (bucket, bucketIndex) {
                    if (!Array.isArray(bucket?.links) || (!bucket.links.length && !bucket.keepWhenEmpty)) return;
                    const bucketKey = text(bucket?.key || bucketIndex, '');
                    const folderId = buildDerivedGhostId('registry_value', [catKey, groupKey || groupIndex, bucketKey.toLowerCase()]);
                    const title = text(bucket?.label, 'Smart View');
                    const criteriaLabel = typeof registry.describeCriteria === 'function'
                        ? registry.describeCriteria(bucket.criteria || {})
                        : text(bucket?.criteria, '');
                    const record = {
                        id: 'smartView::' + scopedKey + '::' + catKey + '::' + groupKey + '::' + bucketKey,
                        type: 'smartView',
                        title: title,
                        url: '',
                        displayUrl: '',
                        description: bucket.links.length + ' matching bookmark' + (bucket.links.length === 1 ? '' : 's') + '. ' + text(bucket?.why || ('Criteria: ' + criteriaLabel), ''),
                        provider: 'smart-view',
                        sourceCard: categoryName,
                        sourceIdentity: { kind: 'smartView', smartViewId: bucketKey, smartViewGroup: groupKey },
                        workspaceId: workspaceId,
                        workspaceIds: [workspaceId],
                        categoryName: categoryName,
                        path: Object.assign({}, pathBase, {
                            folderId: folderId,
                            folderLabel: title,
                            pathLabel: [pathBase.pathLabel || workspaceId, 'System Views', text(group?.groupLabel, 'Smart Views'), title].filter(Boolean).join(' > ')
                        }),
                        updatedAt: 0,
                        groupId: groupMeta.groupId,
                        groupName: groupMeta.groupName,
                        groupHidden: groupMeta.hidden,
                        provenance: {
                            kind: 'smartView',
                            virtual: true,
                            smartViewId: bucketKey,
                            smartViewFolderId: folderId,
                            smartViewGroup: groupKey,
                            category: catKey,
                            criteria: bucket.criteria || {},
                            criteriaLabel: criteriaLabel,
                            whyIncluded: text(bucket?.why, ''),
                            smartViewUserId: text(bucket?.userSmartViewId, ''),
                            matchCount: bucket.links.length
                        }
                    };
                    record.baseHealth = deriveBaseHealth(record);
                    record.searchableText = normalizeText([
                        record.title,
                        record.description,
                        record.provenance.category,
                        record.provenance.smartViewGroup,
                        criteriaLabel,
                        categoryName,
                        record.path.pathLabel
                    ].join(' '));
                    records.push(record);
                });
            });
        });

        return records;
    }

    ns.IndexRecordBuildersFolders = {
        buildFolderRecords,
        buildSmartViewRecords
    };
})();
