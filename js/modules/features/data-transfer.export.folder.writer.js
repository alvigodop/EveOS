// --- Data Transfer Export Folder Writer Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportFolderWriterReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady) {
        console.warn('[DataTransfer] Shared or export utils missing; export folder writers not initialized.');
        return;
    }

    const sanitizePathSegment = ns.sanitizePathSegment;
    const buildWorkspaceFolderName = ns.buildWorkspaceFolderName;
    const buildCardFolderName = ns.buildCardFolderName;
    const buildFallbackConfig = ns.buildFallbackConfig;
    const buildWorkspaceListForFullBackup = ns.buildWorkspaceListForFullBackup;
    const groupLinksByWorkspaceAndCategory = ns.groupLinksByWorkspaceAndCategory;
    const getConnectionEntryId = ns.getConnectionEntryId;
    const findScopedCategoryData = ns.findScopedCategoryData;
    const findLibraryEntryById = ns.findLibraryEntryById;
    const buildConnectionMap = ns.buildConnectionMap;
    const sortLinksForExport = ns.sortLinksForExport;
    const buildBookmarkFileName = ns.buildBookmarkFileName;

    async function writeTextFileToFolder(rootHandle, relativePath, content) {
        const segments = String(relativePath || '')
            .replace(/\\/g, '/')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean);
        if (!segments.length) return;

        try {
            let currentHandle = rootHandle;
            for (let i = 0; i < segments.length - 1; i += 1) {
                const dirName = sanitizePathSegment(segments[i], 'folder', 40);
                currentHandle = await currentHandle.getDirectoryHandle(dirName, { create: true });
            }

            const fileName = sanitizePathSegment(segments[segments.length - 1], 'file.txt', 64);
            const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
        } catch (error) {
            const detail = error?.message ? ` ${error.message}` : '';
            throw new Error(`Failed to write backup file "${segments.join('/')}".${
                detail ? detail : ''
            }`);
        }
    }

    async function writeJsonFileToFolder(rootHandle, relativePath, payload) {
        await writeTextFileToFolder(rootHandle, relativePath, JSON.stringify(payload, null, 2));
    }

    async function writeStoreMetaFiles(rootHandle, scopedConfig, workspaces, activeWorkspaceId) {
        const workspaceList = Array.isArray(workspaces) && workspaces.length > 0
            ? workspaces.map((ws) => ({
                id: String(ws?.id || '').trim() || 'main',
                name: ws?.name || String(ws?.id || 'main'),
                icon: ws?.icon || 'folder'
            }))
            : [{ id: 'main', name: 'Main', icon: 'folder' }];
        const activeWorkspace = String(activeWorkspaceId || scopedConfig?.activeWorkspace || workspaceList[0]?.id || 'main').trim() || 'main';
        const normalizedConfig = {
            ...(scopedConfig || {}),
            workspaces: workspaceList,
            activeWorkspace
        };
        await writeJsonFileToFolder(rootHandle, '_meta/store.json', {
            format: 'eveos.modular-state.v1',
            version: 1,
            updatedAt: new Date().toISOString(),
            activeWorkspace,
            workspaces: workspaceList
        });
        await writeJsonFileToFolder(rootHandle, '_meta/config.json', normalizedConfig);
        return normalizedConfig;
    }

    async function writeFallbackMetaFiles(rootHandle, scopedConfig, workspaceMeta) {
        return writeStoreMetaFiles(rootHandle, scopedConfig, [workspaceMeta], workspaceMeta.id);
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function parseScopedCategoryKey(scopedKey) {
        const raw = String(scopedKey || '').trim();
        if (!raw) return { workspaceId: 'main', categoryName: 'Unsorted' };
        if (!raw.includes('::')) return { workspaceId: 'main', categoryName: raw };
        const [workspaceId, categoryName] = raw.split('::', 2);
        return {
            workspaceId: String(workspaceId || 'main').trim() || 'main',
            categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
        };
    }

    function normalizeClickBehaviorMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return ['inherit', 'invert', 'focus_only', 'open_and_focus', 'open_only'].includes(normalized)
            ? normalized
            : 'inherit';
    }

    function normalizeTreeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return {
            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)
        };
    }

    function normalizeFolderNode(rawNode, fallbackIndex = 0) {
        const source = rawNode && typeof rawNode === 'object' ? rawNode : {};
        const parentId = String(source.parentId || '').trim();
        const name = String(source.name || source.title || 'Folder').trim() || 'Folder';
        const parsedOrder = Number(source.order);
        const order = Number.isFinite(parsedOrder) ? parsedOrder : 0;
        let id = String(source.id || '').trim();
        if (!id) {
            id = `folder-${sanitizePathSegment(`${parentId || 'root'}-${name}-${fallbackIndex}`, 'folder', 40)}`;
        }
        return {
            id,
            parentId: parentId || null,
            name,
            order,
            createdAt: String(source.createdAt || '').trim(),
            updatedAt: String(source.updatedAt || '').trim(),
            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)
        };
    }

    function getScopedFolderTree(folderTrees, workspaceId, categoryName) {
        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const rawTree = folderTrees && typeof folderTrees === 'object' ? folderTrees[scopedKey] : null;
        const settings = normalizeTreeSettings(rawTree?.settings);
        const rawNodes = Array.isArray(rawTree?.nodes)
            ? rawTree.nodes
            : (Array.isArray(rawTree) ? rawTree : []);
        const nodes = [];
        const seenIds = new Set();
        rawNodes.forEach((rawNode, index) => {
            const node = normalizeFolderNode(rawNode, index + 1);
            if (seenIds.has(node.id)) return;
            seenIds.add(node.id);
            nodes.push(node);
        });
        const validIds = new Set(nodes.map((node) => node.id));
        nodes.forEach((node) => {
            if (!node.parentId || node.parentId === node.id || !validIds.has(node.parentId)) {
                node.parentId = null;
            }
        });
        nodes.sort((a, b) => {
            const parentA = String(a.parentId || '');
            const parentB = String(b.parentId || '');
            if (parentA !== parentB) return parentA.localeCompare(parentB);
            if (a.order !== b.order) return a.order - b.order;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
        return { nodes, settings };
    }

    function buildFolderChildrenMap(nodes) {
        const childrenByParent = new Map();
        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
            const parentKey = node?.parentId || '__root__';
            if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
            childrenByParent.get(parentKey).push(node);
        });
        childrenByParent.forEach((childNodes) => {
            childNodes.sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        });
        return childrenByParent;
    }

    function buildFolderDirName(node) {
        const orderPrefix = String(Number.isFinite(Number(node?.order)) ? Number(node.order) : 0).padStart(3, '0');
        return sanitizePathSegment(`${orderPrefix}-${node?.name || 'Folder'}-${node?.id || 'folder'}`, 'folder', 48);
    }

    function buildWorkspaceCardEntries(workspaceId, categoryMap, categories, folderTrees) {
        const cards = new Map();
        if (categoryMap instanceof Map) {
            categoryMap.forEach((links, categoryName) => {
                cards.set(String(categoryName || 'Unsorted').trim() || 'Unsorted', Array.isArray(links) ? links : []);
            });
        }
        Object.keys(categories || {}).forEach((scopedKey) => {
            const parsed = parseScopedCategoryKey(scopedKey);
            if (parsed.workspaceId !== workspaceId) return;
            if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
        });
        Object.keys(folderTrees || {}).forEach((scopedKey) => {
            const parsed = parseScopedCategoryKey(scopedKey);
            if (parsed.workspaceId !== workspaceId) return;
            if (!cards.has(parsed.categoryName)) cards.set(parsed.categoryName, []);
        });
        return Array.from(cards.entries()).sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
    }

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
            const folderRootPath = `${cardRootPath}/folders/${buildFolderDirName(node)}`;
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
                clickBehaviorMode: normalizeClickBehaviorMode(node.clickBehaviorMode)
            });

            const childLinks = sortLinksForExport(folderLinks.get(node.id) || []);
            for (const link of childLinks) {
                writtenBookmarks += await writeBookmarkPayloadAtPath(
                    rootHandle,
                    `${folderRootPath}/entries`,
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
            bookmarkFolder: 'entries',
            bookmarkCount: sortedLinks.length,
            folderRoot: 'folders',
            folderCount: folderNodes.length
        });

        let writtenBookmarks = 0;
        const usedEntryIds = new Set();
        for (const link of rootLinks) {
            writtenBookmarks += await writeBookmarkPayloadAtPath(
                rootHandle,
                `${cardRootPath}/entries`,
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

    async function writeFullStoreFolderBackup(rootHandle, fullState) {
        const links = sortLinksForExport(fullState?.bookmarks?.links || []);
        const categories = fullState?.library?.categories || {};
        const connections = fullState?.library?.connections || [];
        const config = fullState?.bookmarks?.config || {};
        const folderTrees = fullState?.bookmarks?.folders || {};
        const workspaces = buildWorkspaceListForFullBackup(fullState);
        const activeWorkspace = String(config.activeWorkspace || workspaces[0]?.id || 'main').trim() || 'main';
        const normalizedConfig = await writeStoreMetaFiles(rootHandle, config, workspaces, activeWorkspace);
        const connectionMap = buildConnectionMap(connections);
        const linksByWorkspace = groupLinksByWorkspaceAndCategory(links, activeWorkspace);

        await writeJsonFileToFolder(rootHandle, 'state/eve_state.json', {
            ...(fullState || {}),
            bookmarks: {
                ...(fullState?.bookmarks || {}),
                config: normalizedConfig
            }
        });

        let tabCount = 0;
        let cardCount = 0;
        let bookmarkCount = 0;

        for (const workspace of workspaces) {
            const workspaceId = String(workspace?.id || '').trim() || 'main';
            const workspaceFolder = buildWorkspaceFolderName(workspaceId, workspace?.name || workspaceId);
            const tabRootPath = `tabs/${workspaceFolder}`;
            const categoryMap = linksByWorkspace.get(workspaceId) || new Map();
            const cardEntries = buildWorkspaceCardEntries(workspaceId, categoryMap, categories, folderTrees);

            await writeJsonFileToFolder(rootHandle, `${tabRootPath}/tab.json`, {
                schema: 'eveos.tab.v1',
                id: workspaceId,
                name: workspace?.name || workspaceId,
                icon: workspace?.icon || 'folder',
                bookmarkCount: Array.from(categoryMap.values()).reduce((sum, list) => sum + list.length, 0),
                cardCount: cardEntries.length
            });
            tabCount += 1;

            for (const [categoryName, categoryLinks] of cardEntries) {
                const cardFolder = buildCardFolderName(categoryName);
                const cardRootPath = `${tabRootPath}/cards/${cardFolder}`;
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
        }

        return {
            tabsCount: tabCount,
            cardsCount: cardCount,
            bookmarksCount: bookmarkCount
        };
    }

    Object.assign(ns, {
        writeJsonFileToFolder,
        writeStoreMetaFiles,
        writeFallbackMetaFiles,
        writeScopedCardFolder,
        writeFullStoreFolderBackup,
        buildFallbackConfig,
        sortLinksForExport,
        buildConnectionMap,
        getConnectionEntryId,
        findLibraryEntryById,
        buildCardFolderName,
        buildWorkspaceFolderName,
        buildBookmarkFileName
    });
    ns.exportFolderWriterReady = true;
})();
