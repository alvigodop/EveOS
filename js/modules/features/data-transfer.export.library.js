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

        function buildWorkspaceListForFullBackup(state) {
            const config = state?.bookmarks?.config || {};
            const links = Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
            const activeWorkspace = String(config.activeWorkspace || '').trim();
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

            const configured = Array.isArray(config.workspaces) ? config.workspaces : [];
            configured.forEach(addWorkspace);
            
            // Only add placeholders for workspaces found in links that AREN'T in the formal config
            links.forEach(link => {
                const id = String(link?.workspace || 'main').trim() || 'main';
                if (!byId.has(id)) {
                    byId.set(id, { id, name: id, icon: 'folder' });
                }
            });
            if (activeWorkspace && !byId.has(activeWorkspace)) {
                byId.set(activeWorkspace, { id: activeWorkspace, name: activeWorkspace, icon: 'folder' });
            }
            if (byId.size === 0) {
                byId.set('main', { id: 'main', name: 'Main', icon: 'folder' });
            }
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
            const match = workspaces.find(ws => String(ws?.id) === String(workspaceId));
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
