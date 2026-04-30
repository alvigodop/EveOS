window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordBuildersLocal) return;

    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        normalizeText,
        toArray,
        readConfig,
        readBookmarkFolders,
        getScopedKey,
        getWorkspaceGroupMeta,
        getLinkedLibraryMeta,
        deriveBaseHealth,
        buildFolderPathLabel
    } = shared;

    function buildCategoryMap(links) {
        const map = new Map();
        links.forEach(function (link) {
            if (!link) return;
            const workspaceId = text(link.workspace, 'main');
            const categoryName = text(link.category, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            if (!map.has(scopedKey)) {
                map.set(scopedKey, {
                    scopedKey: scopedKey,
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            const entry = map.get(scopedKey);
            entry.workspaceIds.add(workspaceId);
            entry.linkCount += 1;
        });

        const libraryState = window.EveLibrary?.State;
        const libraries = libraryState?.getAllLibraries ? libraryState.getAllLibraries() : {};
        const parseScopedKey = libraryState?.parseScopedCategoryKey;
        const isEmptyTransientLibrary = typeof libraryState?.isEmptyTransientLibraryBucket === 'function'
            ? libraryState.isEmptyTransientLibraryBucket
            : function (value) {
                const source = value && typeof value === 'object' ? value : {};
                const entries = Array.isArray(source.entries) ? source.entries : [];
                const folderView = source.folderView && typeof source.folderView === 'object' ? source.folderView : {};
                const chain = Array.isArray(folderView.chain) ? folderView.chain : [];
                return entries.length === 0
                    && String(source.dataType || 'graphicNovels') === 'graphicNovels'
                    && String(folderView.root || 'all') === 'all'
                    && chain.length === 0
                    && folderView.expanded !== true;
            };
        Object.keys(libraries || {}).forEach(function (key) {
            if (isEmptyTransientLibrary(libraries[key])) return;
            const parsed = parseScopedKey
                ? parseScopedKey(key)
                : { workspaceId: 'main', categoryName: key };
            const workspaceId = text(parsed.workspaceId, 'main');
            const categoryName = text(parsed.categoryName, 'Unsorted');
            const scopedKey = getScopedKey(workspaceId, categoryName);
            if (!map.has(scopedKey)) {
                map.set(scopedKey, {
                    scopedKey: scopedKey,
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            map.get(scopedKey).workspaceIds.add(workspaceId);
        });

        const folderStore = readBookmarkFolders();
        Object.keys(folderStore || {}).forEach(function (scopedKey) {
            const parts = String(scopedKey || '').split('::');
            const workspaceId = text(parts?.[0], 'main');
            const categoryName = text(parts?.slice(1).join('::'), 'Unsorted');
            const tree = folderStore[scopedKey];
            if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return;
            if (!map.has(scopedKey)) {
                map.set(scopedKey, {
                    scopedKey: scopedKey,
                    workspaceId: workspaceId,
                    categoryName: categoryName,
                    workspaceIds: new Set(),
                    linkCount: 0
                });
            }
            map.get(scopedKey).workspaceIds.add(workspaceId);
        });

        return map;
    }

    function buildCardRecords(categoryMap) {
        const locators = ns.Locators || {};
        const activeWorkspace = text(readConfig().activeWorkspace, 'main');
        const records = [];

        Array.from(categoryMap.values()).forEach(function (category) {
            const workspaceIds = Array.from(category.workspaceIds);
            const preferredWorkspaceId = workspaceIds.includes(activeWorkspace) ? activeWorkspace : workspaceIds[0];
            const path = locators.buildPathMeta
                ? locators.buildPathMeta({
                    workspaceIds: workspaceIds,
                    workspaceId: preferredWorkspaceId,
                    categoryName: category.categoryName
                })
                : {
                    workspaceId: preferredWorkspaceId,
                    workspaceIds: workspaceIds,
                    categoryName: category.categoryName,
                    pathLabel: category.categoryName
                };
            const groupMeta = getWorkspaceGroupMeta(preferredWorkspaceId);
            const record = {
                id: 'card::' + category.scopedKey,
                type: 'card',
                title: category.categoryName,
                url: '',
                displayUrl: '',
                description: 'Card in ' + text(path.workspaceLabel, preferredWorkspaceId),
                provider: 'card',
                sourceCard: category.categoryName,
                sourceIdentity: {
                    kind: 'card',
                    scopedKey: category.scopedKey
                },
                workspaceId: preferredWorkspaceId,
                workspaceIds: workspaceIds,
                categoryName: category.categoryName,
                path: path,
                updatedAt: 0,
                groupId: groupMeta.groupId,
                groupName: groupMeta.groupName,
                groupHidden: groupMeta.hidden,
                provenance: {
                    kind: 'card',
                    scopedKey: category.scopedKey,
                    linkCount: category.linkCount
                }
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                path.workspaceLabel,
                category.scopedKey
            ].join(' '));
            records.push(record);
        });

        return records;
    }

    function hasFolderNode(workspaceId, categoryName, folderId) {
        const normalizedFolderId = text(folderId, '');
        if (!normalizedFolderId) return true;
        const tree = readBookmarkFolders()[getScopedKey(workspaceId, categoryName)];
        const nodes = Array.isArray(tree?.nodes)
            ? tree.nodes
            : (Array.isArray(tree) ? tree : []);
        return nodes.some(function (node) {
            return text(node?.id, '') === normalizedFolderId;
        });
    }

    function getFolderIntegrityEntry(cache, workspaceId, categoryName) {
        const key = getScopedKey(workspaceId, categoryName);
        if (cache.has(key)) return cache.get(key);
        const folderApi = window.EveBookmarkFolders;
        const report = typeof folderApi?.collectFolderIntegrity === 'function'
            ? folderApi.collectFolderIntegrity({ workspaceId, categoryName })
            : null;
        const folderIssuesById = new Map();
        toArray(report?.folders).forEach(function (issue) {
            const folderId = text(issue?.folderId, '');
            if (!folderId) return;
            if (!folderIssuesById.has(folderId)) {
                folderIssuesById.set(folderId, {
                    issueTypes: [],
                    reasons: []
                });
            }
            const entry = folderIssuesById.get(folderId);
            entry.issueTypes = entry.issueTypes.concat(toArray(issue?.issueTypes));
            entry.reasons = entry.reasons.concat(toArray(issue?.reasons));
        });
        folderIssuesById.forEach(function (entry) {
            entry.issueTypes = Array.from(new Set(entry.issueTypes.map(function (value) { return text(value, ''); }).filter(Boolean)));
            entry.reasons = Array.from(new Set(entry.reasons.map(function (value) { return text(value, ''); }).filter(Boolean)));
        });
        const entry = {
            report,
            folderIssuesById
        };
        cache.set(key, entry);
        return entry;
    }

    function getBookmarkFolderDiagnostic(cache, workspaceId, categoryName, folderId) {
        const normalizedFolderId = text(folderId, '');
        if (!normalizedFolderId) {
            return {
                missingFolder: false,
                missingParent: false,
                folderUnreachable: false,
                folderParentBroken: false,
                folderIssueTypes: [],
                folderIssueReasons: []
            };
        }

        const missingFolder = !hasFolderNode(workspaceId, categoryName, normalizedFolderId);
        const integrity = getFolderIntegrityEntry(cache, workspaceId, categoryName);
        const issue = integrity.folderIssuesById.get(normalizedFolderId) || {};
        const issueTypes = toArray(issue.issueTypes).map(function (value) { return text(value, ''); }).filter(Boolean);
        const issueReasons = toArray(issue.reasons).map(function (value) { return text(value, ''); }).filter(Boolean);
        const folderUnreachable = issueTypes.includes('unreachable_folder')
            || issueTypes.includes('missing_parent_folder')
            || issueTypes.includes('folder_parent_cycle')
            || issueTypes.includes('self_parent');
        const folderParentBroken = issueTypes.includes('missing_parent_folder')
            || issueTypes.includes('folder_parent_cycle')
            || issueTypes.includes('self_parent');

        return {
            missingFolder,
            missingParent: missingFolder || folderUnreachable || folderParentBroken,
            folderUnreachable,
            folderParentBroken,
            folderIssueTypes: issueTypes,
            folderIssueReasons: issueReasons
        };
    }

    function normalizeQuickLinksForIndex(value) {
        const source = Array.isArray(value) ? value : [];
        return source.map(function (entry) {
            return {
                workspaceId: text(entry?.workspaceId || entry?.workspace || entry?.tabId, 'main'),
                categoryName: text(entry?.categoryName || entry?.category || entry?.cardName, 'Unsorted')
            };
        }).filter(function (entry) {
            return !!(entry.workspaceId && entry.categoryName);
        });
    }

    function buildBookmarkIdentifierMap() {
        const cfg = readConfig();
        const apiDefinitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : null;
        const definitions = Array.isArray(apiDefinitions) && apiDefinitions.length
            ? apiDefinitions
            : (Array.isArray(cfg.bookmarkIdentifiers) ? cfg.bookmarkIdentifiers : []);
        return new Map(definitions.filter(Boolean).map(function (definition) {
            return [text(definition.id, ''), {
                id: text(definition.id, ''),
                label: text(definition.label || definition.id, ''),
                description: text(definition.description, ''),
                icon: text(definition.icon, ''),
                quickLinks: normalizeQuickLinksForIndex(definition.quickLinks)
            }];
        }).filter(function (entry) {
            return !!entry[0];
        }));
    }

    function buildBookmarkIdentifierMeta(identifierIds, identifierMap) {
        const ids = toArray(identifierIds).map(function (value) { return text(value, ''); }).filter(Boolean);
        const labels = [];
        const descriptions = [];
        const quickLinkTargets = [];
        ids.forEach(function (id) {
            const definition = identifierMap.get(id);
            if (!definition) return;
            if (definition.label) labels.push(definition.label);
            if (definition.description) descriptions.push(definition.description);
            normalizeQuickLinksForIndex(definition.quickLinks).forEach(function (target) {
                quickLinkTargets.push(target.categoryName + ' ' + target.workspaceId);
            });
        });
        return {
            ids,
            labels,
            descriptions,
            quickLinkTargets
        };
    }

    function buildBookmarkRecords(links) {
        const locators = ns.Locators || {};
        const knownWorkspaceIds = window.EveOS?.SearchAdvanced?.CacheAggregator?.getKnownWorkspaceIds
            ? window.EveOS.SearchAdvanced.CacheAggregator.getKnownWorkspaceIds()
            : new Set(['main']);
        const identifierMap = buildBookmarkIdentifierMap();
        const folderIntegrityCache = new Map();
        return links.filter(Boolean).map(function (link) {
            const path = locators.buildBookmarkPath
                ? locators.buildBookmarkPath(link)
                : {
                    workspaceId: text(link.workspace, 'main'),
                    workspaceIds: [text(link.workspace, 'main')],
                    categoryName: text(link.category, 'Unsorted'),
                    folderId: text(link.folderId, ''),
                    folderLabel: buildFolderPathLabel(text(link.workspace, 'main'), text(link.category, 'Unsorted'), text(link.folderId, '')),
                    linkId: text(link.id, ''),
                    pathLabel: text(link.category, 'Unsorted')
                };
            const library = getLinkedLibraryMeta(link.id);
            const groupMeta = getWorkspaceGroupMeta(path.workspaceId);
            const tags = toArray(link.tags).map(function (tag) { return text(tag, ''); }).filter(Boolean);
            const folderId = text(path.folderId || link.folderId, '');
            const folderDiagnostic = getBookmarkFolderDiagnostic(folderIntegrityCache, path.workspaceId, path.categoryName, folderId);
            const identifierMeta = buildBookmarkIdentifierMeta(link.identifiers, identifierMap);
            const record = {
                id: 'bookmark::' + text(link.id, Math.random().toString(36).slice(2, 8)),
                type: 'bookmark',
                title: text(link.title || link.name || link.url, 'Untitled'),
                url: text(link.url, ''),
                displayUrl: text(link.url, ''),
                description: text(link.notes || library.summary, ''),
                provider: 'bookmark',
                sourceCard: text(link.category, 'Unsorted'),
                sourceIdentity: {
                    kind: 'bookmark',
                    linkId: text(link.id, '')
                },
                workspaceId: path.workspaceId,
                workspaceIds: [path.workspaceId],
                categoryName: path.categoryName,
                path: path,
                updatedAt: 0,
                groupId: groupMeta.groupId,
                groupName: groupMeta.groupName,
                groupHidden: groupMeta.hidden,
                provenance: {
                    kind: 'bookmark',
                    linkId: text(link.id, ''),
                    done: !!link.done,
                    orphaned: !knownWorkspaceIds.has(path.workspaceId),
                    missingFolder: folderDiagnostic.missingFolder,
                    missingParent: folderDiagnostic.missingParent,
                    folderUnreachable: folderDiagnostic.folderUnreachable,
                    folderParentBroken: folderDiagnostic.folderParentBroken,
                    folderIssueTypes: folderDiagnostic.folderIssueTypes,
                    folderIssueReasons: folderDiagnostic.folderIssueReasons,
                    tags: tags,
                    identifiers: identifierMeta.ids,
                    identifierLabels: identifierMeta.labels,
                    identifierDescriptions: identifierMeta.descriptions,
                    identifierQuickLinkTargets: identifierMeta.quickLinkTargets,
                    icon: text(link.icon, ''),
                    coverImage: text(link.coverImage, ''),
                    priority: text(link.priority, ''),
                    libraryLinked: !!library.linked,
                    libraryEntryId: library.entryId
                },
                library: library
            };
            record.baseHealth = deriveBaseHealth(record);
            record.searchableText = normalizeText([
                record.title,
                record.url,
                record.description,
                tags.join(' '),
                identifierMeta.ids.join(' '),
                identifierMeta.labels.join(' '),
                identifierMeta.descriptions.join(' '),
                identifierMeta.quickLinkTargets.join(' '),
                library.title,
                library.summary,
                library.author,
                library.genre,
                library.status,
                library.mediaType,
                library.aliases.join(' '),
                path.pathLabel
            ].join(' '));
            return record;
        });
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
            const folderIssuesById = new Map();
            toArray(folderIntegrity?.folders).forEach(function (issue) {
                const folderId = text(issue?.folderId, '');
                if (!folderId) return;
                if (!folderIssuesById.has(folderId)) {
                    folderIssuesById.set(folderId, {
                        issueTypes: [],
                        reasons: []
                    });
                }
                const entry = folderIssuesById.get(folderId);
                entry.issueTypes = entry.issueTypes.concat(toArray(issue?.issueTypes));
                entry.reasons = entry.reasons.concat(toArray(issue?.reasons));
            });
            folderIssuesById.forEach(function (entry) {
                entry.issueTypes = Array.from(new Set(entry.issueTypes.map(function (value) { return text(value, ''); }).filter(Boolean)));
                entry.reasons = Array.from(new Set(entry.reasons.map(function (value) { return text(value, ''); }).filter(Boolean)));
            });
            const groupMeta = getWorkspaceGroupMeta(workspaceId);
            const visitedFolderIds = new Set();

            function visit(folderNode, parentFolderId) {
                const folderId = text(folderNode?.id, '');
                if (!folderId) return;
                if (visitedFolderIds.has(folderId)) return;
                visitedFolderIds.add(folderId);
                const folderIssue = folderIssuesById.get(folderId) || { issueTypes: [], reasons: [] };
                const folderIssueTypes = toArray(folderIssue.issueTypes);
                const folderParentBroken = folderIssueTypes.includes('missing_parent_folder')
                    || folderIssueTypes.includes('folder_parent_cycle')
                    || folderIssueTypes.includes('self_parent');
                const folderUnreachable = folderIssueTypes.includes('unreachable_folder') || folderParentBroken;
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
                const record = {
                    id: 'folder::' + scopedKey + '::' + folderId,
                    type: 'folder',
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
                        parentFolderId: text(parentFolderId, ''),
                        orphaned: !knownWorkspaceIds.has(workspaceId),
                        missingParent: folderUnreachable || folderParentBroken,
                        folderUnreachable: folderUnreachable,
                        folderParentBroken: folderParentBroken,
                        folderIssueTypes: folderIssueTypes,
                        folderIssueReasons: toArray(folderIssue.reasons),
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

    const libraryBuilders = ns.IndexRecordBuildersLibrary;
    if (!libraryBuilders) return;
    const {
        normalizeEntryTimestamp,
        buildLibraryRecords
    } = libraryBuilders;
    ns.IndexRecordBuildersLocal = {
        buildCategoryMap,
        buildCardRecords,
        buildBookmarkRecords,
        buildFolderRecords,
        normalizeEntryTimestamp,
        buildLibraryRecords
    };
})();
