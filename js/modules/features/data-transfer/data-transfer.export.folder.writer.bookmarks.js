// --- Data Transfer Export Folder Writer Bookmark Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderWriterBookmarkHelpers = function createFolderWriterBookmarkHelpers(deps, fsHelpers, treeHelpers) {
        const getConnectionEntryId = deps.getConnectionEntryId;
        const findLibraryEntryById = deps.findLibraryEntryById;
        const sortLinksForExport = deps.sortLinksForExport;
        const buildBookmarkFileName = deps.buildBookmarkFileName;
        const writeJsonFileToFolder = fsHelpers.writeJsonFileToFolder;
        const BACKUP_DIRS = fsHelpers.BACKUP_DIRS;
        const buildFolderDirName = treeHelpers.buildFolderDirName;
        const normalizeClickBehaviorMode = treeHelpers.normalizeClickBehaviorMode;
        const normalizeTaskMode = treeHelpers.normalizeTaskMode;

        async function writeBookmarkPayloadAtPath(
            rootHandle,
            relativePath,
            link,
            categories,
            connectionMap,
            workspaceId,
            categoryName,
            usedEntryIds
        ) {
            const linkId = String(link?.id || '').trim();
            const connection = connectionMap.get(linkId) || null;
            const entryId = getConnectionEntryId(connection);
            if (entryId) usedEntryIds.add(String(entryId));
            const libraryEntry = findLibraryEntryById(categories, workspaceId, categoryName, entryId);
            const bookmarkPayload = {
                schema: 'eveos.bookmark.v1',
                bookmark: link,
                library: {
                    linked: !!libraryEntry,
                    connection,
                    entry: libraryEntry || null
                }
            };
            const fileName = buildBookmarkFileName(link, categoryName);
            await writeJsonFileToFolder(rootHandle, `${relativePath}/${fileName}`, bookmarkPayload);
            return 1;
        }

        async function writeFolderBranch(
            rootHandle,
            cardRootPath,
            childrenByParent,
            folderLinks,
            categories,
            connectionMap,
            workspaceId,
            categoryName,
            usedEntryIds,
            parentId = null
        ) {
            const parentKey = parentId || '__root__';
            const childNodes = childrenByParent.get(parentKey) || [];
            let writtenBookmarks = 0;

            for (const node of childNodes) {
                const folderRootPath = `${cardRootPath}/${BACKUP_DIRS.folders}/${buildFolderDirName(node)}`;
                await writeJsonFileToFolder(rootHandle, `${folderRootPath}/folder.json`, {
                    schema: 'eveos.bookmark-folder.v1',
                    workspaceId,
                    categoryName,
                    id: node.id,
                    parentId: node.parentId,
                    name: node.name,
                    order: node.order,
                    createdAt: node.createdAt || '',
                    updatedAt: node.updatedAt || '',
                    clickBehaviorMode: normalizeClickBehaviorMode(node.clickBehaviorMode),
                    taskMode: normalizeTaskMode(node.taskMode)
                });

                const childLinks = sortLinksForExport(folderLinks.get(node.id) || []);
                for (const link of childLinks) {
                    writtenBookmarks += await writeBookmarkPayloadAtPath(
                        rootHandle,
                        `${folderRootPath}/${BACKUP_DIRS.entries}`,
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
                    folderRootPath,
                    childrenByParent,
                    folderLinks,
                    categories,
                    connectionMap,
                    workspaceId,
                    categoryName,
                    usedEntryIds,
                    node.id
                );
            }

            return writtenBookmarks;
        }

        return {
            writeBookmarkPayloadAtPath,
            writeFolderBranch
        };
    };
})();
