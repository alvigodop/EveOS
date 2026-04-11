/**
 * Unified State Store Capture Scoped Filter Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureScopedFilterHelpers = function createCaptureScopedFilterHelpers(base) {
        const getLibraryStateModule = base.getLibraryStateModule;
        const getLinks = base.getLinks;
        const cloneConnections = base.cloneConnections;

        function filterLinksForWorkspace(workspaceId) {
            if (!workspaceId) return [];
            return getLinks().filter(entry => entry.workspace === workspaceId);
        }

        function filterLinksForCard(workspaceId, categoryName) {
            if (!workspaceId || !categoryName) return [];
            return getLinks().filter(entry => entry.workspace === workspaceId && (entry.category || 'Unsorted') === categoryName);
        }

        function filterConnectionsForWorkspace(workspaceId, workspaceLinks) {
            const currentConnections = cloneConnections();
            const linkIds = new Set(workspaceLinks.map(entry => entry.id));
            return currentConnections.filter(conn => conn.workspace === workspaceId || linkIds.has(conn.linkId));
        }

        function getConnectionCategoryName(conn) {
            return conn?.categoryName || conn?.category || conn?.libraryCategory || null;
        }

        function getConnectionEntryId(conn) {
            return conn?.libraryEntryId || conn?.entryId || null;
        }

        function parseLibraryKey(key) {
            const stateModule = getLibraryStateModule();
            if (stateModule?.parseScopedCategoryKey) {
                return stateModule.parseScopedCategoryKey(key);
            }
            return {
                key,
                categoryName: key,
                workspaceId: '',
                scoped: false
            };
        }

        function buildScopedCategoryKey(workspaceId, categoryName) {
            if (window.EveBookmarkFolders?.buildScopedKey) {
                return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
            }
            const stateModule = getLibraryStateModule();
            if (stateModule?.buildScopedCategoryKey) {
                // Note: EveLibrary.State.buildScopedCategoryKey uses (categoryName, workspaceId)
                return stateModule.buildScopedCategoryKey(categoryName, workspaceId);
            }
            const ws = String(workspaceId || 'main').trim() || 'main';
            const cat = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            return `${ws}::${cat}`;
        }

        function filterFolderTreesForWorkspace(folderTrees, workspaceId) {
            const trees = folderTrees && typeof folderTrees === 'object' ? folderTrees : {};
            const filtered = {};
            Object.entries(trees).forEach(([key, value]) => {
                const parsed = parseLibraryKey(key);
                if (String(parsed.workspaceId || 'main') !== String(workspaceId || 'main')) return;
                filtered[buildScopedCategoryKey(parsed.workspaceId || 'main', parsed.categoryName || 'Unsorted')] = value;
            });
            return filtered;
        }

        function filterFolderTreesForCard(folderTrees, workspaceId, categoryName) {
            const trees = folderTrees && typeof folderTrees === 'object' ? folderTrees : {};
            const key = buildScopedCategoryKey(workspaceId, categoryName);
            return Object.prototype.hasOwnProperty.call(trees, key)
                ? { [key]: trees[key] }
                : {};
        }

        function getScopedFolderNodes(folderTrees, workspaceId, categoryName) {
            const scoped = filterFolderTreesForCard(folderTrees, workspaceId, categoryName);
            const key = buildScopedCategoryKey(workspaceId, categoryName);
            const tree = scoped[key];
            if (Array.isArray(tree?.nodes)) return tree.nodes.map((node) => ({ ...(node || {}) }));
            if (Array.isArray(tree)) return tree.map((node) => ({ ...(node || {}) }));
            return [];
        }

        return {
            filterLinksForWorkspace,
            filterLinksForCard,
            filterConnectionsForWorkspace,
            getConnectionCategoryName,
            getConnectionEntryId,
            parseLibraryKey,
            buildScopedCategoryKey,
            filterFolderTreesForWorkspace,
            filterFolderTreesForCard,
            getScopedFolderNodes
        };
    };
})();
