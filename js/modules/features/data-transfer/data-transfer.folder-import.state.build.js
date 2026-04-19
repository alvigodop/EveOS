// --- Data Transfer Folder Import State Build Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.importParseStateBuildReady) return;
    if (!ns.sharedReady || !ns.importParseStateInferReady) {
        console.warn('[DataTransfer] Shared or infer helpers missing; import state build helpers not initialized.');
        return;
    }

    const getWorkspaceMeta = ns.getWorkspaceMeta;

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function normalizeWorkspaceNode(rawWorkspace, seenIds) {
        let workspace = rawWorkspace;
        if (typeof workspace === 'string') {
            workspace = { id: workspace, name: workspace, icon: 'folder', subTabs: [] };
        }
        if (!workspace || typeof workspace !== 'object') return null;

        const id = String(workspace.id || '').trim() || 'main';
        if (seenIds.has(id)) return null;
        seenIds.add(id);

        const normalized = {
            ...workspace,
            id,
            name: String(workspace.name || id).trim() || id,
            icon: workspace.icon || 'folder',
            subTabs: []
        };

        (Array.isArray(workspace.subTabs) ? workspace.subTabs : []).forEach((child) => {
            const normalizedChild = normalizeWorkspaceNode(child, seenIds);
            if (normalizedChild) normalized.subTabs.push(normalizedChild);
        });

        return normalized;
    }

    function normalizeWorkspaceTree(workspaces) {
        const seenIds = new Set();
        const normalized = [];
        (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
            const normalizedWorkspace = normalizeWorkspaceNode(workspace, seenIds);
            if (normalizedWorkspace) normalized.push(normalizedWorkspace);
        });
        return normalized;
    }

    function walkWorkspaceTree(workspaces, visit) {
        (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
            if (!workspace || typeof workspace !== 'object') return;
            if (typeof visit === 'function') visit(workspace);
            walkWorkspaceTree(workspace.subTabs, visit);
        });
    }

    function mergeParsedTabsIntoWorkspaceTree(configWorkspaces, parsedTabs) {
        const merged = normalizeWorkspaceTree(configWorkspaces);
        const nodeById = new Map();
        walkWorkspaceTree(merged, (workspace) => {
            nodeById.set(String(workspace?.id || '').trim(), workspace);
        });

        (Array.isArray(parsedTabs) ? parsedTabs : []).forEach((tab) => {
            const workspaceId = String(tab?.workspaceId || '').trim() || 'main';
            const parentWorkspaceId = String(tab?.parentWorkspaceId || '').trim();
            const existing = nodeById.get(workspaceId);
            if (existing) {
                existing.name = String(tab?.workspaceName || existing.name || workspaceId).trim() || workspaceId;
                existing.icon = tab?.workspaceIcon || existing.icon || 'folder';
                if (tab?.groupId) existing.groupId = tab.groupId;
                if (!Array.isArray(existing.subTabs)) existing.subTabs = [];
                return;
            }

            const nextNode = {
                id: workspaceId,
                name: String(tab?.workspaceName || workspaceId).trim() || workspaceId,
                icon: tab?.workspaceIcon || 'folder',
                groupId: tab?.groupId || undefined,
                subTabs: []
            };
            const parentNode = parentWorkspaceId ? nodeById.get(parentWorkspaceId) : null;
            if (parentNode) {
                if (!Array.isArray(parentNode.subTabs)) parentNode.subTabs = [];
                parentNode.subTabs.push(nextNode);
            } else {
                merged.push(nextNode);
            }
            nodeById.set(workspaceId, nextNode);
        });

        return merged.length > 0
            ? merged
            : [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }];
    }

    function normalizeFolderView(folderView) {
        const source = folderView && typeof folderView === 'object' ? folderView : {};
        return {
            root: String(source.root || 'all').trim() || 'all',
            chain: Array.isArray(source.chain)
                ? source.chain
                    .map((step) => {
                        if (!step || typeof step !== 'object') return null;
                        const selection = String(step.selection || '').trim();
                        return selection ? { selection } : null;
                    })
                    .filter(Boolean)
                : [],
            expanded: !!source.expanded
        };
    }

    function addCategoryEntries(categoriesMap, workspaceId, categoryName, entries, dataType = 'graphicNovels', folderView = null) {
        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        if (!categoriesMap.has(scopedKey)) {
            categoriesMap.set(scopedKey, {
                dataType: dataType || 'graphicNovels',
                entries: [],
                entryIds: new Set(),
                folderView: normalizeFolderView(folderView)
            });
        }
        const bucket = categoriesMap.get(scopedKey);
        if (!bucket.dataType) bucket.dataType = dataType || 'graphicNovels';
        if (folderView && typeof folderView === 'object') bucket.folderView = normalizeFolderView(folderView);
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            const normalized = { ...(entry || {}) };
            const entryId = String(normalized.id || '').trim();
            if (entryId) {
                if (bucket.entryIds.has(entryId)) return;
                bucket.entryIds.add(entryId);
            }
            bucket.entries.push(normalized);
        });
    }

    function finalizeCategories(categoriesMap) {
        const categories = {};
        for (const [key, bucket] of categoriesMap.entries()) {
            categories[key] = {
                dataType: bucket.dataType || 'graphicNovels',
                entries: Array.isArray(bucket.entries) ? bucket.entries : [],
                folderView: normalizeFolderView(bucket.folderView)
            };
        }
        return categories;
    }

    function normalizeFolderNode(rawNode, fallbackIndex = 0) {
        const source = rawNode && typeof rawNode === 'object' ? rawNode : {};
        const parentId = String(source.parentId || '').trim();
        const name = String(source.name || source.title || 'Folder').trim() || 'Folder';
        const parsedOrder = Number(source.order);
        const order = Number.isFinite(parsedOrder) ? parsedOrder : 0;
        let id = String(source.id || '').trim();
        if (!id) id = `folder-${fallbackIndex}`;
        const clickBehaviorMode = String(source.clickBehaviorMode || '').trim().toLowerCase();
        const taskMode = String(source.taskMode || '').trim().toLowerCase();
        return {
            id,
            parentId: parentId || null,
            name,
            order,
            createdAt: String(source.createdAt || '').trim(),
            updatedAt: String(source.updatedAt || '').trim(),
            clickBehaviorMode: ['inherit', 'invert', 'focus_only', 'internal_only', 'open_and_focus', 'open_only'].includes(clickBehaviorMode)
                ? clickBehaviorMode
                : 'inherit',
            taskMode: ['inherit', 'task', 'non_task'].includes(taskMode)
                ? taskMode
                : 'inherit'
        };
    }

    function normalizeTreeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        const clickBehaviorMode = String(source.clickBehaviorMode || '').trim().toLowerCase();
        return {
            clickBehaviorMode: ['inherit', 'invert', 'focus_only', 'internal_only', 'open_and_focus', 'open_only'].includes(clickBehaviorMode)
                ? clickBehaviorMode
                : 'inherit'
        };
    }

    function addFolderTree(folderMap, workspaceId, categoryName, folderTree) {
        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        const rawNodes = Array.isArray(folderTree?.nodes)
            ? folderTree.nodes
            : (Array.isArray(folderTree) ? folderTree : []);
        const nextSettings = normalizeTreeSettings(folderTree?.settings);
        if (rawNodes.length === 0 && nextSettings.clickBehaviorMode === 'inherit') return;
        if (!folderMap.has(scopedKey)) {
            folderMap.set(scopedKey, {
                nodes: [],
                nodeIds: new Set(),
                settings: normalizeTreeSettings({})
            });
        }
        const bucket = folderMap.get(scopedKey);
        bucket.settings = nextSettings.clickBehaviorMode !== 'inherit'
            ? nextSettings
            : normalizeTreeSettings(bucket.settings);
        rawNodes.forEach((rawNode, index) => {
            const node = normalizeFolderNode(rawNode, index + 1);
            if (bucket.nodeIds.has(node.id)) return;
            bucket.nodeIds.add(node.id);
            bucket.nodes.push(node);
        });
    }

    function finalizeFolderTrees(folderMap) {
        const folders = {};
        for (const [key, bucket] of folderMap.entries()) {
            const nodes = Array.isArray(bucket?.nodes) ? bucket.nodes.map((node) => ({ ...(node || {}) })) : [];
            const settings = normalizeTreeSettings(bucket?.settings);
            const validIds = new Set(nodes.map((node) => String(node?.id || '').trim()).filter(Boolean));
            nodes.forEach((node) => {
                const parentId = String(node?.parentId || '').trim();
                if (!parentId || parentId === node.id || !validIds.has(parentId)) {
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
            if (nodes.length > 0 || settings.clickBehaviorMode !== 'inherit') {
                folders[key] = { nodes, settings };
            }
        }
        return folders;
    }

    function deriveLegacyPinsFromLinks(links) {
        return (Array.isArray(links) ? links : [])
            .filter((link) => !!link?.pinned && String(link?.id || '').trim())
            .map((link, index) => ({
                id: `pin-bookmark-${String(link.id).trim()}`,
                targetType: 'bookmark',
                targetId: String(link.id).trim(),
                scopeType: 'tab',
                order: index
            }));
    }

    function buildUnifiedStateFromParsed(parsedTabs, options = {}) {
        const metadataType = options.metadataType || 'store';
        const inputConfig = options.config && typeof options.config === 'object' ? options.config : {};
        const activeWorkspaceFallback = options.activeWorkspace || parsedTabs[0]?.workspaceId || 'main';
        const linkMap = new Map();
        const connectionMap = new Map();
        const categoriesMap = new Map();
        const folderMap = new Map();

        parsedTabs.forEach((tab) => {
            (Array.isArray(tab.parsedCards) ? tab.parsedCards : []).forEach((card) => {
                (Array.isArray(card.links) ? card.links : []).forEach((link) => {
                    const normalized = { ...link, workspace: card.workspaceId, category: card.categoryName };
                    delete normalized.pinned;
                    const linkId = String(normalized.id || '').trim();
                    if (!linkId) return;
                    linkMap.set(linkId, normalized);
                });
                (Array.isArray(card.connections) ? card.connections : []).forEach((conn) => {
                    const linkId = String(conn?.linkId || '').trim();
                    if (!linkId) return;
                    connectionMap.set(linkId, {
                        ...conn,
                        linkId,
                        workspace: card.workspaceId,
                        categoryName: conn?.categoryName || card.categoryName
                    });
                });
                addCategoryEntries(
                    categoriesMap,
                    card.workspaceId,
                    card.categoryName,
                    card.categoryEntries,
                    card.dataType || 'graphicNovels',
                    card.folderView
                );
                addFolderTree(folderMap, card.workspaceId, card.categoryName, card.folderTree);
            });
        });

        const workspaces = mergeParsedTabsIntoWorkspaceTree(inputConfig.workspaces, parsedTabs);
        const activeWorkspace = String(inputConfig.activeWorkspace || activeWorkspaceFallback || workspaces[0].id).trim() || workspaces[0].id;
        const config = { ...inputConfig, workspaces, activeWorkspace };
        const links = Array.from(linkMap.values());
        const pins = Array.isArray(options.quickPins)
            ? options.quickPins.map((pin) => ({ ...(pin || {}) }))
            : deriveLegacyPinsFromLinks(links);

        return {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Folder Restore',
                type: metadataType
            },
            bookmarks: {
                links,
                config,
                folders: finalizeFolderTrees(folderMap),
                pins
            },
            library: {
                categories: finalizeCategories(categoriesMap),
                connections: Array.from(connectionMap.values())
            }
        };
    }

    function summarizeStateCounts(state) {
        const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
        const cards = new Set();
        const tabs = new Set();
        links.forEach((link) => {
            const workspaceId = String(link?.workspace || 'main').trim() || 'main';
            const categoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            tabs.add(workspaceId);
            cards.add(`${workspaceId}::${categoryName}`);
        });
        Object.keys(state?.library?.categories || {}).forEach((scopedKey) => {
            cards.add(scopedKey);
            const [workspaceId] = String(scopedKey || '').split('::', 2);
            tabs.add(String(workspaceId || 'main').trim() || 'main');
        });
        Object.keys(state?.bookmarks?.folders || {}).forEach((scopedKey) => {
            cards.add(scopedKey);
            const [workspaceId] = String(scopedKey || '').split('::', 2);
            tabs.add(String(workspaceId || 'main').trim() || 'main');
        });
        const configTabs = Array.isArray(state?.bookmarks?.config?.workspaces) ? state.bookmarks.config.workspaces.length : 0;
        return { tabs: Math.max(tabs.size, configTabs), cards: cards.size, bookmarks: links.length };
    }

    function buildParsedTabsFromCards(parsedCards) {
        const tabsByWorkspace = new Map();
        (Array.isArray(parsedCards) ? parsedCards : []).forEach((card) => {
            const workspaceId = String(card?.workspaceId || 'main').trim() || 'main';
            if (!tabsByWorkspace.has(workspaceId)) {
                const meta = getWorkspaceMeta(workspaceId);
                tabsByWorkspace.set(workspaceId, { workspaceId, workspaceName: meta.name || workspaceId, workspaceIcon: meta.icon || 'folder', parsedCards: [] });
            }
            tabsByWorkspace.get(workspaceId).parsedCards.push(card);
        });
        return Array.from(tabsByWorkspace.values());
    }

    Object.assign(ns, {
        buildUnifiedStateFromParsed,
        summarizeStateCounts,
        buildParsedTabsFromCards
    });
    ns.importParseStateBuildReady = true;
})();
