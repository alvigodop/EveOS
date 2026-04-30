window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexRecordFolderDiagnostics) return;

    const shared = ns.IndexShared;
    if (!shared) return;

    const {
        text,
        toArray,
        readBookmarkFolders,
        getScopedKey
    } = shared;

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

    function buildFolderIssuesById(report) {
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
        return folderIssuesById;
    }

    function getFolderIntegrityEntry(cache, workspaceId, categoryName) {
        const key = getScopedKey(workspaceId, categoryName);
        if (cache.has(key)) return cache.get(key);
        const folderApi = window.EveBookmarkFolders;
        const report = typeof folderApi?.collectFolderIntegrity === 'function'
            ? folderApi.collectFolderIntegrity({ workspaceId, categoryName })
            : null;
        const entry = {
            report,
            folderIssuesById: buildFolderIssuesById(report)
        };
        cache.set(key, entry);
        return entry;
    }

    function getIssueFlags(issue) {
        const issueTypes = toArray(issue?.issueTypes).map(function (value) { return text(value, ''); }).filter(Boolean);
        const folderParentBroken = issueTypes.includes('missing_parent_folder')
            || issueTypes.includes('folder_parent_cycle')
            || issueTypes.includes('self_parent');
        const folderUnreachable = issueTypes.includes('unreachable_folder') || folderParentBroken;
        return {
            issueTypes,
            issueReasons: toArray(issue?.reasons).map(function (value) { return text(value, ''); }).filter(Boolean),
            folderUnreachable,
            folderParentBroken
        };
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
        const flags = getIssueFlags(integrity.folderIssuesById.get(normalizedFolderId) || {});

        return {
            missingFolder,
            missingParent: missingFolder || flags.folderUnreachable || flags.folderParentBroken,
            folderUnreachable: flags.folderUnreachable,
            folderParentBroken: flags.folderParentBroken,
            folderIssueTypes: flags.issueTypes,
            folderIssueReasons: flags.issueReasons
        };
    }

    ns.IndexRecordFolderDiagnostics = {
        hasFolderNode,
        buildFolderIssuesById,
        getIssueFlags,
        getBookmarkFolderDiagnostic
    };
})();
