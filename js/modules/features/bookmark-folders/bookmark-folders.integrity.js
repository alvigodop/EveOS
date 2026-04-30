window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared || {};
    if (ns.folderIntegrityReady) return;

    const {
        getFolderStore,
        getLiveLinks,
        setLiveLinks,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        buildScopedKey,
        getScopedTreeByKey,
        cloneStore,
        writeStore,
        dedupeNodes,
        invalidateFolderViewModel
    } = shared;

    if (!getFolderStore || !getLiveLinks || !normalizeWorkspaceId || !buildScopedKey || !getScopedTreeByKey) {
        return;
    }

    function parseScopedKey(scopedKey) {
        const parts = String(scopedKey || '').split('::');
        return {
            workspaceId: normalizeWorkspaceId(parts.shift() || 'main'),
            categoryName: normalizeCategoryName(parts.join('::') || 'Unsorted')
        };
    }

    function buildScopeMatcher(options) {
        const scope = options?.scope && typeof options.scope === 'object' ? options.scope : options || {};
        const workspaceIds = new Set((Array.isArray(scope.workspaceIds) ? scope.workspaceIds : [])
            .map((value) => normalizeWorkspaceId(value))
            .filter(Boolean));
        const workspaceId = normalizeWorkspaceId(scope.workspaceId || '');
        const categoryName = String(scope.categoryName || '').trim();

        return function matches(workspace, category) {
            const ws = normalizeWorkspaceId(workspace);
            const cat = normalizeCategoryName(category);
            if (workspaceIds.size && !workspaceIds.has(ws)) return false;
            if (scope.workspaceId && ws !== workspaceId) return false;
            if (categoryName && cat !== normalizeCategoryName(categoryName)) return false;
            return true;
        };
    }

    function makeFolderIssue(workspaceId, categoryName, node, issueTypes, reasons) {
        return {
            workspaceId,
            categoryName,
            folderId: normalizeFolderId(node?.id),
            parentId: normalizeFolderId(node?.parentId),
            name: String(node?.name || 'Folder').trim() || 'Folder',
            issueTypes: Array.from(new Set(issueTypes.filter(Boolean))),
            reasons: Array.from(new Set(reasons.filter(Boolean)))
        };
    }

    function analyzeNodes(workspaceId, categoryName, nodes) {
        const nodeMap = new Map();
        dedupeNodes(nodes).forEach((node) => nodeMap.set(node.id, node));
        const folderIssues = [];
        const brokenFolderIds = new Set();
        const unreachableFolderIds = new Set();

        nodeMap.forEach((node, folderId) => {
            const issueTypes = [];
            const reasons = [];
            const parentId = normalizeFolderId(node.parentId);

            if (parentId === folderId) {
                issueTypes.push('self_parent');
                reasons.push('Folder parent points to itself.');
            } else if (parentId && !nodeMap.has(parentId)) {
                issueTypes.push('missing_parent_folder');
                reasons.push('Folder parent no longer exists.');
            }

            const seen = new Set([folderId]);
            let cursor = parentId ? nodeMap.get(parentId) : null;
            while (cursor) {
                const cursorId = normalizeFolderId(cursor.id);
                if (!cursorId) break;
                if (seen.has(cursorId)) {
                    issueTypes.push('folder_parent_cycle');
                    reasons.push('Folder parent chain contains a cycle.');
                    break;
                }
                seen.add(cursorId);
                cursor = cursor.parentId ? nodeMap.get(normalizeFolderId(cursor.parentId)) : null;
            }

            if (issueTypes.length) {
                brokenFolderIds.add(folderId);
                unreachableFolderIds.add(folderId);
                folderIssues.push(makeFolderIssue(workspaceId, categoryName, node, issueTypes, reasons));
            }
        });

        let changed = true;
        while (changed) {
            changed = false;
            nodeMap.forEach((node, folderId) => {
                const parentId = normalizeFolderId(node.parentId);
                if (parentId && unreachableFolderIds.has(parentId) && !unreachableFolderIds.has(folderId)) {
                    unreachableFolderIds.add(folderId);
                    folderIssues.push(makeFolderIssue(workspaceId, categoryName, node, ['unreachable_folder'], [
                        'Folder is below an unreachable parent folder.'
                    ]));
                    changed = true;
                }
            });
        }

        return {
            nodeMap,
            folderIssues,
            brokenFolderIds,
            unreachableFolderIds
        };
    }

    function collectFolderIntegrity(options = {}) {
        const matches = buildScopeMatcher(options);
        const store = getFolderStore();
        const allLinks = getLiveLinks();
        const report = {
            scopedCards: 0,
            folderCount: 0,
            brokenFolderCount: 0,
            unreachableFolderCount: 0,
            missingParentFolderCount: 0,
            cycleFolderCount: 0,
            selfParentFolderCount: 0,
            missingFolderBookmarkCount: 0,
            unreachableBookmarkCount: 0,
            folders: [],
            bookmarks: []
        };
        const scopedKeys = new Set(Object.keys(store || {}));
        allLinks.forEach((link) => {
            const workspaceId = normalizeWorkspaceId(link?.workspace || 'main');
            const categoryName = normalizeCategoryName(link?.category || 'Unsorted');
            if (matches(workspaceId, categoryName)) scopedKeys.add(buildScopedKey(workspaceId, categoryName));
        });

        scopedKeys.forEach((scopedKey) => {
            const { workspaceId, categoryName } = parseScopedKey(scopedKey);
            if (!matches(workspaceId, categoryName)) return;
            const nodes = getScopedTreeByKey(scopedKey).nodes || [];
            const analysis = analyzeNodes(workspaceId, categoryName, nodes);
            report.scopedCards += 1;
            report.folderCount += analysis.nodeMap.size;
            report.folders.push(...analysis.folderIssues);

            const scopedLinks = allLinks.filter((link) => (
                normalizeWorkspaceId(link?.workspace || 'main') === workspaceId
                && normalizeCategoryName(link?.category || 'Unsorted') === categoryName
            ));
            scopedLinks.forEach((link) => {
                const folderId = normalizeFolderId(link?.folderId);
                if (!folderId) return;
                if (!analysis.nodeMap.has(folderId)) {
                    report.bookmarks.push({
                        workspaceId,
                        categoryName,
                        folderId,
                        linkId: String(link?.id || '').trim(),
                        title: String(link?.title || link?.url || 'Untitled').trim(),
                        issueTypes: ['missing_folder'],
                        reasons: ['Bookmark points to a folder id that does not exist in this card.']
                    });
                    return;
                }
                if (analysis.unreachableFolderIds.has(folderId)) {
                    report.bookmarks.push({
                        workspaceId,
                        categoryName,
                        folderId,
                        linkId: String(link?.id || '').trim(),
                        title: String(link?.title || link?.url || 'Untitled').trim(),
                        issueTypes: ['unreachable_folder'],
                        reasons: ['Bookmark is inside a folder branch that cannot be reached from the card root.']
                    });
                }
            });
        });

        report.brokenFolderCount = report.folders.filter((issue) => issue.issueTypes.some((type) => type !== 'unreachable_folder')).length;
        report.unreachableFolderCount = report.folders.filter((issue) => issue.issueTypes.includes('unreachable_folder')).length;
        report.missingParentFolderCount = report.folders.filter((issue) => issue.issueTypes.includes('missing_parent_folder')).length;
        report.cycleFolderCount = report.folders.filter((issue) => issue.issueTypes.includes('folder_parent_cycle')).length;
        report.selfParentFolderCount = report.folders.filter((issue) => issue.issueTypes.includes('self_parent')).length;
        report.missingFolderBookmarkCount = report.bookmarks.filter((issue) => issue.issueTypes.includes('missing_folder')).length;
        report.unreachableBookmarkCount = report.bookmarks.filter((issue) => issue.issueTypes.includes('unreachable_folder')).length;
        report.issueCount = report.folders.length + report.bookmarks.length;
        return report;
    }

    function repairFolderIntegrity(options = {}) {
        const matches = buildScopeMatcher(options);
        const nextStore = cloneStore ? cloneStore() : {};
        const links = getLiveLinks();
        let rootedFolders = 0;
        let movedBookmarksToRoot = 0;
        const repairedScopes = new Set();

        Object.keys(nextStore || {}).forEach((scopedKey) => {
            const { workspaceId, categoryName } = parseScopedKey(scopedKey);
            if (!matches(workspaceId, categoryName)) return;
            const tree = nextStore[scopedKey] || {};
            const nodes = dedupeNodes(tree.nodes || []);
            const analysis = analyzeNodes(workspaceId, categoryName, nodes);
            if (!analysis.folderIssues.length) return;
            const repairIds = new Set(analysis.folderIssues
                .filter((issue) => issue.issueTypes.some((type) => type !== 'unreachable_folder'))
                .map((issue) => issue.folderId));
            if (!repairIds.size) return;
            nextStore[scopedKey] = Object.assign({}, tree, {
                nodes: nodes.map((node) => {
                    if (!repairIds.has(normalizeFolderId(node.id))) return node;
                    rootedFolders += 1;
                    return Object.assign({}, node, {
                        parentId: null,
                        updatedAt: Date.now()
                    });
                })
            });
            repairedScopes.add(scopedKey);
        });

        links.forEach((link) => {
            const workspaceId = normalizeWorkspaceId(link?.workspace || 'main');
            const categoryName = normalizeCategoryName(link?.category || 'Unsorted');
            if (!matches(workspaceId, categoryName)) return;
            const folderId = normalizeFolderId(link?.folderId);
            if (!folderId) return;
            const scopedKey = buildScopedKey(workspaceId, categoryName);
            const nodes = dedupeNodes((nextStore[scopedKey] || getScopedTreeByKey(scopedKey)).nodes || []);
            if (nodes.some((node) => normalizeFolderId(node.id) === folderId)) return;
            delete link.folderId;
            movedBookmarksToRoot += 1;
            repairedScopes.add(scopedKey);
        });

        if (repairedScopes.size) {
            if (setLiveLinks) setLiveLinks(links);
            if (writeStore) {
                writeStore(nextStore, options.persist !== false, {
                    source: 'bookmark-folder-integrity-repair',
                    meta: {
                        kind: 'folder-integrity-repair',
                        repairedScopes: Array.from(repairedScopes),
                        rootedFolders,
                        movedBookmarksToRoot
                    }
                });
            }
            repairedScopes.forEach((scopedKey) => {
                const parsed = parseScopedKey(scopedKey);
                if (invalidateFolderViewModel) invalidateFolderViewModel(parsed.workspaceId, parsed.categoryName);
            });
        }

        return {
            repairedScopes: Array.from(repairedScopes),
            rootedFolders,
            movedBookmarksToRoot
        };
    }

    ns.collectFolderIntegrity = collectFolderIntegrity;
    ns.repairFolderIntegrity = repairFolderIntegrity;
    ns.folderIntegrityReady = true;
})(window.EveBookmarkFolders);
