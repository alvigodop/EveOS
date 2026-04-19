// --- Data Transfer Export Folder Writer Backup Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderWriterBackupHelpers = function createFolderWriterBackupHelpers(deps, fsHelpers, treeHelpers, bookmarkHelpers) {
        const buildWorkspaceFolderName = deps.buildWorkspaceFolderName;
        const buildCardFolderName = deps.buildCardFolderName;
        const buildWorkspaceTreeForFullBackup = deps.buildWorkspaceTreeForFullBackup;
        const buildWorkspaceListForFullBackup = deps.buildWorkspaceListForFullBackup;
        const groupLinksByWorkspaceAndCategory = deps.groupLinksByWorkspaceAndCategory;
        const findScopedCategoryData = deps.findScopedCategoryData;
        const buildConnectionMap = deps.buildConnectionMap;
        const sortLinksForExport = deps.sortLinksForExport;
        const sanitizePathSegment = deps.sanitizePathSegment;
        const shortHashHex = deps.shortHashHex;
        const writeJsonFileToFolder = fsHelpers.writeJsonFileToFolder;
        const writeStoreMetaFiles = fsHelpers.writeStoreMetaFiles;
        const BACKUP_DIRS = fsHelpers.BACKUP_DIRS;
        const normalizeClickBehaviorMode = treeHelpers.normalizeClickBehaviorMode;
        const getScopedFolderTree = treeHelpers.getScopedFolderTree;
        const buildFolderChildrenMap = treeHelpers.buildFolderChildrenMap;
        const buildWorkspaceCardEntries = treeHelpers.buildWorkspaceCardEntries;
        const writeBookmarkPayloadAtPath = bookmarkHelpers.writeBookmarkPayloadAtPath;
        const writeFolderBranch = bookmarkHelpers.writeFolderBranch;

        function normalizeKnowledgeContextKey(value) {
            const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
            return normalized || '__global__';
        }

        function filterKnowledgeState(knowledgeState, categoryNames) {
            const normalizedContexts = new Set(
                (Array.isArray(categoryNames) ? categoryNames : [categoryNames])
                    .map((value) => normalizeKnowledgeContextKey(value))
                    .filter((value) => value && value !== '__global__')
            );
            const source = knowledgeState?.scopedStorage && typeof knowledgeState.scopedStorage === 'object'
                ? knowledgeState.scopedStorage
                : {};
            const scopedStorage = {};

            Object.entries(source).forEach(([contextKey, bucket]) => {
                const normalizedContext = normalizeKnowledgeContextKey(contextKey);
                if (!normalizedContexts.has(normalizedContext)) return;
                scopedStorage[normalizedContext] = JSON.parse(JSON.stringify(bucket || {}));
            });

            return { scopedStorage };
        }

        async function writeKnowledgeSnapshot(rootHandle, knowledgeState) {
            const scopedStorage = knowledgeState?.scopedStorage && typeof knowledgeState.scopedStorage === 'object'
                ? knowledgeState.scopedStorage
                : {};
            await writeJsonFileToFolder(rootHandle, `${BACKUP_DIRS.knowledge}/scoped-storage.json`, {
                schema: 'eveos.knowledge.v1',
                scopedStorage
            });
        }

        async function writeScopedCardFolder(rootHandle, cardRootPath, workspaceId, categoryName, links, categories, connectionMap, folderTrees = {}) {
            const sortedLinks = sortLinksForExport(links);
            const scopedLibrary = findScopedCategoryData(categories, workspaceId, categoryName);
            const folderTree = getScopedFolderTree(folderTrees, workspaceId, categoryName);
            const folderNodes = folderTree.nodes;
            const folderIds = new Set(folderNodes.map((node) => node.id));
            const folderLinks = new Map();
            const rootLinks = [];
            sortedLinks.forEach((rawLink) => {
                const link = { ...(rawLink || {}) };
                const folderId = String(link.folderId || '').trim();
                if (folderId && folderIds.has(folderId)) {
                    if (!folderLinks.has(folderId)) folderLinks.set(folderId, []);
                    folderLinks.get(folderId).push(link);
                    return;
                }
                delete link.folderId;
                rootLinks.push(link);
            });
            const childrenByParent = buildFolderChildrenMap(folderNodes);

            await writeJsonFileToFolder(rootHandle, `${cardRootPath}/card.json`, {
                schema: 'eveos.card.v2',
                workspaceId,
                categoryName,
                title: categoryName,
                dataType: scopedLibrary?.dataType || 'graphicNovels',
                libraryFolderView: scopedLibrary?.folderView && typeof scopedLibrary.folderView === 'object'
                    ? { ...scopedLibrary.folderView }
                    : undefined,
                clickBehaviorMode: normalizeClickBehaviorMode(folderTree.settings.clickBehaviorMode),
                bookmarkFolder: BACKUP_DIRS.entries,
                bookmarkCount: sortedLinks.length,
                folderRoot: BACKUP_DIRS.folders,
                folderCount: folderNodes.length
            });

            let writtenBookmarks = 0;
            const usedEntryIds = new Set();
            for (const link of rootLinks) {
                writtenBookmarks += await writeBookmarkPayloadAtPath(
                    rootHandle,
                    `${cardRootPath}/${BACKUP_DIRS.entries}`,
                    link,
                    categories,
                    connectionMap,
                    workspaceId,
                    categoryName,
                    usedEntryIds
                );
            }

            writtenBookmarks += await writeFolderBranch(
                rootHandle,
                cardRootPath,
                childrenByParent,
                folderLinks,
                categories,
                connectionMap,
                workspaceId,
                categoryName,
                usedEntryIds
            );

            const scopedEntries = Array.isArray(scopedLibrary?.entries) ? scopedLibrary.entries : [];
            const unlinkedEntries = scopedEntries.filter((entry) => !usedEntryIds.has(String(entry?.id || '').trim()));
            if (unlinkedEntries.length > 0) {
                await writeJsonFileToFolder(rootHandle, `${cardRootPath}/_library-unlinked.json`, {
                    schema: 'eveos.card-library-unlinked.v1',
                    workspaceId,
                    categoryName,
                    entries: unlinkedEntries
                });
            }

            return writtenBookmarks;
        }

        // Build a filesystem-safe group folder name consistent with workspace/card naming
        function buildGroupFolderName(group) {
            const rawId = String(group?.id || '').trim();
            const rawName = String(group?.name || 'Group').trim() || 'Group';
            const safeName = rawName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 12) || 'group';
            const hash = shortHashHex(`${rawId}::${rawName}`, 3);
            return sanitizePathSegment(`_g_${safeName}-${hash}`, `_g_${hash}`, 16);
        }

        async function writeFullStoreFolderBackup(rootHandle, fullState) {
            const links = sortLinksForExport(fullState?.bookmarks?.links || []);
            const categories = fullState?.library?.categories || {};
            const connections = fullState?.library?.connections || [];
            const config = fullState?.bookmarks?.config || {};
            const folderTrees = fullState?.bookmarks?.folders || {};
            const workspaceTree = buildWorkspaceTreeForFullBackup(fullState);
            const activeWorkspace = String(config.activeWorkspace || workspaceTree[0]?.id || 'main').trim() || 'main';
            const normalizedConfig = await writeStoreMetaFiles(rootHandle, config, workspaceTree, activeWorkspace);
            const connectionMap = buildConnectionMap(connections);
            const linksByWorkspace = groupLinksByWorkspaceAndCategory(links);

            await writeJsonFileToFolder(rootHandle, `${BACKUP_DIRS.state}/eve_state.json`, {
                ...(fullState || {}),
                bookmarks: {
                    ...(fullState?.bookmarks || {}),
                    config: normalizedConfig
                }
            });
            await writeKnowledgeSnapshot(rootHandle, fullState?.knowledge);

            // --- Build group lookup ---
            const sidebarGroups = Array.isArray(config.sidebarGroups) ? config.sidebarGroups : [];
            const groupById = new Map();
            sidebarGroups.forEach((group) => {
                if (group && group.id) groupById.set(String(group.id), group);
            });

            // --- Partition root workspaces into groups vs ungrouped ---
            const groupBuckets = new Map(); // groupId -> [workspace, ...]
            const ungroupedWorkspaces = [];

            for (const workspace of workspaceTree) {
                const groupId = String(workspace?.groupId || '').trim();
                if (groupId && groupById.has(groupId)) {
                    if (!groupBuckets.has(groupId)) groupBuckets.set(groupId, []);
                    groupBuckets.get(groupId).push(workspace);
                } else {
                    ungroupedWorkspaces.push(workspace);
                }
            }

            let tabCount = 0;
            let cardCount = 0;
            let bookmarkCount = 0;

            // --- Shared workspace writer (recurses into subTabs) ---
            const writeWorkspaceBranch = async function (workspaceNodes, parentTabsPath) {
                for (const workspace of Array.isArray(workspaceNodes) ? workspaceNodes : []) {
                    const workspaceId = String(workspace?.id || '').trim() || 'main';
                    const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspace?.name || workspaceId);
                    const tabRootPath = `${parentTabsPath}/${workspaceFolder}`;
                    const categoryMap = linksByWorkspace.get(workspaceId) || new Map();
                    const cardEntries = buildWorkspaceCardEntries(workspaceId, categoryMap, categories, folderTrees);

                    await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
                        schema: 'eveos.tab.v1',
                        id: workspaceId,
                        name: workspace?.name || workspaceId,
                        icon: workspace?.icon || 'folder',
                        groupId: workspace?.groupId || undefined,
                        bookmarkCount: Array.from(categoryMap.values()).reduce((sum, list) => sum + list.length, 0),
                        cardCount: cardEntries.length
                    });

                    tabCount += 1;

                    for (const [categoryName, categoryLinks] of cardEntries) {
                        const cardFolder = buildCardFolderName(categoryName);
                        const cardRootPath = `${tabRootPath}/${BACKUP_DIRS.cards}/${cardFolder}`;
                        const written = await writeScopedCardFolder(
                            rootHandle,
                            cardRootPath,
                            workspaceId,
                            categoryName,
                            categoryLinks,
                            categories,
                            connectionMap,
                            folderTrees
                        );
                        cardCount += 1;
                        bookmarkCount += written;
                    }

                    const childTabs = Array.isArray(workspace?.subTabs) ? workspace.subTabs : [];
                    if (childTabs.length > 0) {
                        await writeWorkspaceBranch(childTabs, `${tabRootPath}/${BACKUP_DIRS.tabs}`);
                    }
                }
            };

            // --- Write grouped workspaces under their group folder ---
            for (const [groupId, workspacesInGroup] of groupBuckets) {
                const group = groupById.get(groupId);
                const groupFolder = buildGroupFolderName(group);
                const groupPath = `${BACKUP_DIRS.tabs}/${groupFolder}`;

                // Write group metadata
                await writeJsonFileToFolder(rootHandle, `${groupPath}/group.json`, {
                    schema: 'eveos.group.v1',
                    id: group.id,
                    name: group.name || 'Unnamed Group',
                    color: group.color || '#00d4ff',
                    collapsed: !!group.collapsed,
                    hidden: !!group.hidden,
                    parentWorkspaceId: group.parentWorkspaceId || ''
                });

                // Write all workspaces assigned to this group
                await writeWorkspaceBranch(workspacesInGroup, groupPath);
            }

            // --- Write ungrouped workspaces directly under tabs/ ---
            await writeWorkspaceBranch(ungroupedWorkspaces, BACKUP_DIRS.tabs);

            // --- Write groups summary to meta ---
            if (sidebarGroups.length > 0) {
                await writeJsonFileToFolder(rootHandle, `${BACKUP_DIRS.meta}/groups.json`, {
                    schema: 'eveos.groups-summary.v1',
                    groups: sidebarGroups,
                    sidebarOrderMode: config.sidebarOrderMode || 'auto',
                    sidebarManualOrder: config.sidebarManualOrder || null
                });
            }

            return {
                tabsCount: tabCount,
                cardsCount: cardCount,
                bookmarksCount: bookmarkCount
            };
        }

        return {
            writeScopedCardFolder,
            writeFullStoreFolderBackup,
            writeKnowledgeSnapshot,
            filterKnowledgeState
        };
    };
})();
