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
        const ws = String(workspaceId || 'main').trim() || 'main';
        const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${ws}::${cat}`;
    }

    function addWorkspaceRecord(workspaceMap, workspaceId, workspaceName, workspaceIcon) {
        const id = String(workspaceId || '').trim();
        if (!id) return;
        workspaceMap.set(id, { id, name: String(workspaceName || id).trim() || id, icon: workspaceIcon || 'folder' });
    }

    function addCategoryEntries(categoriesMap, workspaceId, categoryName, entries, dataType = 'graphicNovels') {
        const scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        if (!categoriesMap.has(scopedKey)) {
            categoriesMap.set(scopedKey, { dataType: dataType || 'graphicNovels', entries: [], entryIds: new Set() });
        }
        const bucket = categoriesMap.get(scopedKey);
        if (!bucket.dataType) bucket.dataType = dataType || 'graphicNovels';
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
                entries: Array.isArray(bucket.entries) ? bucket.entries : []
            };
        }
        return categories;
    }

    function buildUnifiedStateFromParsed(parsedTabs, options = {}) {
        const metadataType = options.metadataType || 'store';
        const inputConfig = options.config && typeof options.config === 'object' ? options.config : {};
        const activeWorkspaceFallback = options.activeWorkspace || parsedTabs[0]?.workspaceId || 'main';
        const workspaceMap = new Map();
        const linkMap = new Map();
        const connectionMap = new Map();
        const categoriesMap = new Map();

        parsedTabs.forEach((tab) => {
            addWorkspaceRecord(workspaceMap, tab.workspaceId, tab.workspaceName, tab.workspaceIcon);
            (Array.isArray(tab.parsedCards) ? tab.parsedCards : []).forEach((card) => {
                (Array.isArray(card.links) ? card.links : []).forEach((link) => {
                    const normalized = { ...link, workspace: card.workspaceId, category: card.categoryName };
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
                addCategoryEntries(categoriesMap, card.workspaceId, card.categoryName, card.categoryEntries, card.dataType || 'graphicNovels');
            });
        });

        const workspaces = workspaceMap.size > 0 ? Array.from(workspaceMap.values()) : [{ id: 'main', name: 'Main', icon: 'folder' }];
        const activeWorkspace = String(inputConfig.activeWorkspace || activeWorkspaceFallback || workspaces[0].id).trim() || workspaces[0].id;
        const config = { ...inputConfig, workspaces, activeWorkspace };

        return {
            metadata: {
                version: 1,
                date: new Date().toISOString(),
                generator: 'EveOS Folder Restore',
                type: metadataType
            },
            bookmarks: { links: Array.from(linkMap.values()), config },
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
