// --- Data Transfer Export Folder Writer Tree Helpers ---
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createFolderWriterTreeHelpers = function createFolderWriterTreeHelpers(deps) {
        const sanitizePathSegment = deps.sanitizePathSegment;
        const shortHashHex = deps.shortHashHex;

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

        function normalizeTaskMode(value) {
            const normalized = String(value || '').trim().toLowerCase();
            return ['inherit', 'task', 'non_task'].includes(normalized)
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
                clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode),
                taskMode: normalizeTaskMode(source.taskMode)
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
            const orderPrefix = String(Number.isFinite(Number(node?.order)) ? Number(node.order) : 0).padStart(2, '0');
            const namePart = sanitizePathSegment(node?.name || 'Folder', 'folder', 2);
            const hashPart = shortHashHex(String(node?.id || node?.name || 'folder'), 2);
            return sanitizePathSegment(`${orderPrefix}-${namePart}-${hashPart}`, 'folder', 8);
        }

        function buildWorkspaceCardEntries(workspaceId, categoryMap, categories, folderTrees) {
            const cards = new Map();
            const targetWorkspaceId = String(workspaceId || 'main').trim() || 'main';

            // 1. Populate from links already grouped by workspace
            if (categoryMap instanceof Map) {
                categoryMap.forEach((links, categoryName) => {
                    const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
                    // Only add "Unsorted" if it has actual links
                    if (normalizedCategory === 'Unsorted' && (!links || links.length === 0)) return;
                    cards.set(normalizedCategory, Array.isArray(links) ? links : []);
                });
            }

            // Helper to check if a scoped key belongs to the current workspace
            const keyBelongsToWorkspace = (key) => {
                const raw = String(key || '').trim();
                if (!raw) return false;
                if (raw.includes('::')) {
                    const [wsId] = raw.split('::', 2);
                    return String(wsId || 'main').trim() === targetWorkspaceId;
                }
                // Unscoped keys default strictly to 'main'
                return targetWorkspaceId === 'main';
            };

            const extractCategoryName = (key) => {
                const raw = String(key || '').trim();
                if (raw.includes('::')) return raw.split('::', 2)[1] || 'Unsorted';
                return raw || 'Unsorted';
            };



            return Array.from(cards.entries()).sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
        }

        return {
            buildScopedCategoryKey,
            parseScopedCategoryKey,
            normalizeClickBehaviorMode,
            normalizeTaskMode,
            normalizeTreeSettings,
            normalizeFolderNode,
            getScopedFolderTree,
            buildFolderChildrenMap,
            buildFolderDirName,
            buildWorkspaceCardEntries
        };
    };
})();
