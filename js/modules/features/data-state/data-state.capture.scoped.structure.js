/**
 * Unified State Store Capture Scoped Structure Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureScopedStructureHelpers = function createCaptureScopedStructureHelpers(base, filterHelpers) {
        const getConfig = base.getConfig;
        const getConnectionCategoryName = filterHelpers.getConnectionCategoryName;
        const getConnectionEntryId = filterHelpers.getConnectionEntryId;
        const parseLibraryKey = filterHelpers.parseLibraryKey;

        function buildFolderMaps(nodes) {
            const list = Array.isArray(nodes) ? nodes.map((node) => ({ ...(node || {}) })) : [];
            const nodeById = new Map();
            const childrenByParent = new Map();
            list.forEach((node) => {
                const id = String(node?.id || '').trim();
                if (!id) return;
                const normalized = {
                    ...node,
                    id,
                    parentId: String(node?.parentId || '').trim() || null,
                    name: String(node?.name || node?.title || 'Folder').trim() || 'Folder',
                    order: Number.isFinite(Number(node?.order)) ? Number(node.order) : 0
                };
                nodeById.set(id, normalized);
                const parentKey = normalized.parentId || '__root__';
                if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
                childrenByParent.get(parentKey).push(normalized);
            });
            childrenByParent.forEach((childNodes) => {
                childNodes.sort((a, b) => {
                    if (a.order !== b.order) return a.order - b.order;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                });
            });
            return { nodeById, childrenByParent };
        }

        function collectFolderSubtreeIds(folderId, childrenByParent) {
            const targetId = String(folderId || '').trim();
            if (!targetId) return new Set();
            const pending = [targetId];
            const seen = new Set();
            while (pending.length) {
                const currentId = pending.pop();
                if (!currentId || seen.has(currentId)) continue;
                seen.add(currentId);
                (childrenByParent.get(currentId) || []).forEach((child) => {
                    const childId = String(child?.id || '').trim();
                    if (childId && !seen.has(childId)) pending.push(childId);
                });
            }
            return seen;
        }

        function buildFolderSubtree(nodes, folderId) {
            const normalizedFolderId = String(folderId || '').trim();
            const { nodeById, childrenByParent } = buildFolderMaps(nodes);
            if (!nodeById.has(normalizedFolderId)) return [];
            const subtreeIds = collectFolderSubtreeIds(normalizedFolderId, childrenByParent);
            return (Array.isArray(nodes) ? nodes : [])
                .map((node) => ({ ...(node || {}) }))
                .filter((node) => subtreeIds.has(String(node?.id || '').trim()))
                .map((node) => (
                    String(node?.id || '').trim() === normalizedFolderId
                        ? { ...node, parentId: null }
                        : node
                ));
        }

        function filterCategoriesForConnections(categories, workspaceConnections) {
            if (!categories || typeof categories !== 'object') return {};
            if (!Array.isArray(workspaceConnections) || workspaceConnections.length === 0) return {};

            const entryIds = new Set();
            const normalizedConnections = workspaceConnections.map(conn => ({
                categoryName: getConnectionCategoryName(conn),
                workspaceId: conn?.workspace ? String(conn.workspace) : '',
                entryId: getConnectionEntryId(conn)
            }));
            normalizedConnections.forEach(conn => {
                if (conn.entryId) entryIds.add(conn.entryId);
            });

            const filtered = {};
            Object.entries(categories).forEach(([libraryKey, categoryData]) => {
                if (!categoryData || typeof categoryData !== 'object') return;
                const entries = Array.isArray(categoryData.entries) ? categoryData.entries : [];
                const parsedKey = parseLibraryKey(libraryKey);

                const hasMatchingConnection = normalizedConnections.some(conn => {
                    if (!conn.categoryName) return false;
                    if (String(conn.categoryName) !== String(parsedKey.categoryName)) return false;
                    if (!parsedKey.workspaceId || !conn.workspaceId) return true;
                    return String(conn.workspaceId) === String(parsedKey.workspaceId);
                });

                if (hasMatchingConnection) {
                    filtered[libraryKey] = {
                        ...categoryData,
                        entries: entries.filter(entry => entryIds.size === 0 || entryIds.has(entry.id))
                    };
                    return;
                }

                if (entryIds.size > 0) {
                    const matched = entries.filter(entry => entryIds.has(entry.id));
                    if (matched.length > 0) {
                        filtered[libraryKey] = { ...categoryData, entries: matched };
                    }
                }
            });

            return filtered;
        }

        function getWorkspaceName(workspaceId) {
            const ws = (getConfig().workspaces || []).find(w => w.id === workspaceId);
            return ws ? ws.name : workspaceId;
        }

        function parseCardTargetId(value) {
            const raw = String(value || '').trim();
            if (!raw.includes('::')) {
                return { workspaceId: 'main', categoryName: String(raw || 'Unsorted').trim() || 'Unsorted' };
            }
            const [workspaceId, categoryName] = raw.split('::', 2);
            return {
                workspaceId: String(workspaceId || 'main').trim() || 'main',
                categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
            };
        }

        function parseFolderTargetId(value) {
            const raw = String(value || '').trim();
            const parts = raw.split('::');
            return {
                workspaceId: String(parts[0] || 'main').trim() || 'main',
                categoryName: String(parts[1] || 'Unsorted').trim() || 'Unsorted',
                folderId: String(parts.slice(2).join('::') || '').trim()
            };
        }

        return {
            buildFolderMaps,
            collectFolderSubtreeIds,
            buildFolderSubtree,
            filterCategoriesForConnections,
            getWorkspaceName,
            parseCardTargetId,
            parseFolderTargetId
        };
    };
})();
