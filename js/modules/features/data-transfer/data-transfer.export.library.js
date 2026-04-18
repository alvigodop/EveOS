window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createLibraryHelpers = function createLibraryHelpers(deps) {
        const getAppConfig = deps.getAppConfig;
        const getAppLinks = deps.getAppLinks;

        function buildWorkspacePayload(workspaceId) {
            const payload = {
                metadata: {
                    version: 1,
                    date: new Date().toISOString(),
                    generator: 'EveOS Workspace Backup',
                    workspaceId,
                    type: 'workspace'
                },
                bookmarks: {
                    links: [],
                    config: {
                        ...getAppConfig(),
                        activeWorkspace: workspaceId
                    }
                },
                library: {
                    categories: {},
                    connections: []
                }
            };
            const allLinks = getAppLinks();
            payload.bookmarks.links = allLinks.filter(entry => entry.workspace === workspaceId);
            return payload;
        }

        function buildCardPayload(workspaceId, categoryName) {
            const payload = buildWorkspacePayload(workspaceId);
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            payload.metadata.type = 'card';
            payload.metadata.categoryName = normalizedCategory;
            payload.bookmarks.links = (payload.bookmarks.links || [])
                .filter(entry => String(entry?.category || 'Unsorted') === normalizedCategory);
            return payload;
        }

        function isLocalhostHost() {
            const host = String(window.location.hostname || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
        }

        function buildFallbackConfig(baseConfig, workspaceMeta) {
            const next = { ...(baseConfig || {}) };
            const currentWorkspaces = Array.isArray(next.workspaces) ? next.workspaces : [];
            const filtered = currentWorkspaces.filter(ws => String(ws?.id || '') !== String(workspaceMeta.id));
            next.workspaces = [...filtered, workspaceMeta];
            next.activeWorkspace = workspaceMeta.id;
            return next;
        }

        function walkWorkspaceNodes(workspaces, visit) {
            (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
                if (typeof workspace === 'string') {
                    if (typeof visit === 'function') {
                        visit({ id: workspace, name: workspace, icon: 'folder', subTabs: [] });
                    }
                    return;
                }
                if (!workspace || typeof workspace !== 'object') return;
                if (typeof visit === 'function') visit(workspace);
                walkWorkspaceNodes(workspace.subTabs, visit);
            });
        }

        function normalizeWorkspaceNode(workspace, seenIds) {
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
                name: workspace.name || id,
                icon: workspace.icon || 'folder',
                subTabs: []
            };

            (Array.isArray(workspace.subTabs) ? workspace.subTabs : []).forEach((child) => {
                const normalizedChild = normalizeWorkspaceNode(child, seenIds);
                if (normalizedChild) normalized.subTabs.push(normalizedChild);
            });

            return normalized;
        }

        function buildWorkspaceTreeForFullBackup(state) {
            const config = state?.bookmarks?.config || {};
            const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
            const seenIds = new Set();
            const normalized = [];

            (Array.isArray(config.workspaces) ? config.workspaces : []).forEach((workspace) => {
                const normalizedWorkspace = normalizeWorkspaceNode(workspace, seenIds);
                if (normalizedWorkspace) normalized.push(normalizedWorkspace);
            });

            const ensureWorkspace = (workspaceId) => {
                const id = String(workspaceId || '').trim() || 'main';
                if (!id || seenIds.has(id)) return;
                seenIds.add(id);
                normalized.push({ id, name: id, icon: 'folder', subTabs: [] });
            };

            links.forEach((link) => ensureWorkspace(link?.workspace || 'main'));
            ensureWorkspace(config.activeWorkspace || '');

            if (normalized.length === 0) {
                normalized.push({ id: 'main', name: 'Main', icon: 'folder', subTabs: [] });
            }

            return normalized;
        }

        function buildWorkspaceListForFullBackup(state) {
            const byId = new Map();

            const addWorkspace = function (workspace) {
                const id = String(workspace?.id || '').trim();
                if (!id) return;

                // If a workspace is configured, we MUST use its name/icon from the config
                byId.set(id, {
                    id,
                    name: workspace?.name || id,
                    icon: workspace?.icon || 'folder'
                });
            };

            walkWorkspaceNodes(buildWorkspaceTreeForFullBackup(state), addWorkspace);
            return Array.from(byId.values());
        }

        function groupLinksByWorkspaceAndCategory(links) {
            const byWorkspace = new Map();
            (Array.isArray(links) ? links : []).forEach(rawLink => {
                // Determine workspace: use link property, or default strictly to 'main' for legacy/missing data
                const workspaceId = String(rawLink?.workspace || 'main').trim() || 'main';
                const categoryName = String(rawLink?.category || 'Unsorted').trim() || 'Unsorted';
                const normalizedLink = { ...rawLink, workspace: workspaceId, category: categoryName };

                if (!byWorkspace.has(workspaceId)) byWorkspace.set(workspaceId, new Map());
                const categoriesMap = byWorkspace.get(workspaceId);
                if (!categoriesMap.has(categoryName)) categoriesMap.set(categoryName, []);
                categoriesMap.get(categoryName).push(normalizedLink);
            });
            return byWorkspace;
        }

        function getConnectionCategoryName(conn) {
            return conn?.categoryName || conn?.category || conn?.libraryCategory || '';
        }

        function getConnectionEntryId(conn) {
            return conn?.libraryEntryId || conn?.entryId || '';
        }

        function parseScopedCategoryKey(key) {
            const raw = String(key || '').trim();
            if (!raw.includes('::')) {
                return { workspaceId: 'main', categoryName: raw || 'Unsorted' };
            }
            const [workspaceId, categoryName] = raw.split('::', 2);
            return {
                workspaceId: String(workspaceId || 'main').trim() || 'main',
                categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
            };
        }

        function findScopedCategoryData(allCategories, workspaceId, categoryName) {
            const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
            const targetWorkspaceId = String(workspaceId || 'main').trim() || 'main';
            const targetCategoryName = String(categoryName || 'Unsorted').trim() || 'Unsorted';

            // 1. Try exact match with target workspace scope
            const scopedKey = `${targetWorkspaceId}::${targetCategoryName}`;
            if (Object.prototype.hasOwnProperty.call(categories, scopedKey)) {
                return categories[scopedKey] || null;
            }

            // 2. If workspace is 'main', try unscoped match
            if (targetWorkspaceId === 'main') {
                if (Object.prototype.hasOwnProperty.call(categories, targetCategoryName)) {
                    return categories[targetCategoryName] || null;
                }
            }

            // 3. Heuristic fallback: search all keys
            for (const [key, value] of Object.entries(categories)) {
                const parsed = parseScopedCategoryKey(key);
                if (parsed.categoryName === targetCategoryName && parsed.workspaceId === targetWorkspaceId) {
                    return value || null;
                }
            }
            return null;
        }

        function findLibraryEntryById(allCategories, workspaceId, categoryName, entryId) {
            const targetId = String(entryId || '').trim();
            if (!targetId) return null;

            const scoped = findScopedCategoryData(allCategories, workspaceId, categoryName);
            const scopedEntries = Array.isArray(scoped?.entries) ? scoped.entries : [];
            const scopedMatch = scopedEntries.find(entry => String(entry?.id || '').trim() === targetId);
            if (scopedMatch) return scopedMatch;

            const categories = allCategories && typeof allCategories === 'object' ? allCategories : {};
            for (const value of Object.values(categories)) {
                const entries = Array.isArray(value?.entries) ? value.entries : [];
                const match = entries.find(entry => String(entry?.id || '').trim() === targetId);
                if (match) return match;
            }
            return null;
        }

        function buildConnectionMap(connections) {
            const map = new Map();
            (Array.isArray(connections) ? connections : []).forEach(conn => {
                const linkId = String(conn?.linkId || '').trim();
                if (!linkId) return;
                map.set(linkId, { ...conn });
            });
            return map;
        }

        function sortLinksForExport(links) {
            return (Array.isArray(links) ? links : [])
                .slice()
                .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')));
        }

        function getWorkspaceMeta(workspaceId, configOverride) {
            const appConfig = configOverride && typeof configOverride === 'object' ? configOverride : getAppConfig();
            const workspaces = Array.isArray(appConfig.workspaces) ? appConfig.workspaces : [];
            let match = null;
            walkWorkspaceNodes(workspaces, (workspace) => {
                if (match) return;
                if (String(workspace?.id || '') === String(workspaceId)) {
                    match = workspace;
                }
            });
            return {
                id: workspaceId,
                name: match?.name || workspaceId,
                icon: match?.icon || 'folder'
            };
        }

        return {
            buildWorkspacePayload,
            buildCardPayload,
            isLocalhostHost,
            buildFallbackConfig,
            buildWorkspaceTreeForFullBackup,
            buildWorkspaceListForFullBackup,
            groupLinksByWorkspaceAndCategory,
            getConnectionCategoryName,
            getConnectionEntryId,
            parseScopedCategoryKey,
            findScopedCategoryData,
            findLibraryEntryById,
            buildConnectionMap,
            sortLinksForExport,
            getWorkspaceMeta
        };
    };
})();
