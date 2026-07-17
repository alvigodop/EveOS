window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    const shared = ns.localContextShared;
    if (!shared) throw new Error('[ModularStateSync] Local context shared helpers missing.');
    const { text, asArray, clone } = shared;
    function scopedKey(workspace, category) {
        return `${text(workspace, 'main')}::${text(category, 'Unsorted')}`;
    }

    function splitScopedKey(value) {
        const raw = text(value, '');
        const idx = raw.indexOf('::');
        return idx >= 0
            ? { workspace: raw.slice(0, idx) || 'main', category: raw.slice(idx + 2) || 'Unsorted' }
            : { workspace: 'main', category: raw || 'Unsorted' };
    }

    function getStoreState() {
        const store = ns.getStore?.() || window.EveDataStore?.Store;
        if (store?.captureState) {
            try {
                return store.captureState();
            } catch (error) {
                console.warn('[ModularStateSync] Local Gemini context capture failed:', error);
            }
        }
        return {
            metadata: { source: 'browser-runtime-fallback' },
            bookmarks: {
                links: Array.isArray(window.eveState?.links) ? window.eveState.links : (Array.isArray(window.links) ? window.links : []),
                config: window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}),
                folders: window.eveState?.folders || window.bookmarkFolders || {},
                pins: window.eveState?.pins || window.bookmarkPins || []
            },
            library: {
                categories: window.eveState?.library?.categories || window.libraryCategories || {},
                connections: window.eveState?.library?.connections || window.libraryConnections || []
            },
            knowledge: window.eveState?.knowledge || {}
        };
    }

    function getConfig(state) {
        return state?.bookmarks?.config || window.eveState?.config || window.config || {};
    }

    function getLinks(state) {
        return Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
    }

    function findWorkspace(workspaceId, nodes) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (text(node?.id, '').toLowerCase() === target) return node;
            const nested = findWorkspace(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function collectBranchIds(workspace) {
        const ids = new Set();
        function visit(node) {
            const id = text(node?.id, '');
            if (id) ids.add(id);
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach(visit);
        }
        visit(workspace);
        return ids;
    }

    function collectAllWorkspaceIds(nodes) {
        const ids = new Set();
        function visit(node) {
            const id = text(node?.id, '');
            if (id) ids.add(id);
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach(visit);
        }
        (Array.isArray(nodes) ? nodes : []).forEach(visit);
        return ids;
    }

    function workspacePath(workspaceId, nodes, trail = []) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            const id = text(node?.id, '');
            const name = text(node?.name || node?.title, id || 'Tab');
            const nextTrail = trail.concat([{ id, name }]);
            if (id.toLowerCase() === target) return nextTrail;
            const nested = workspacePath(workspaceId, node?.subTabs, nextTrail);
            // A miss returns [] (falsy-looking but TRUTHY as an array). Guard on length, or the
            // first node's empty subtree short-circuits the search and every path comes back blank.
            if (nested && nested.length) return nested;
        }
        return [];
    }

    function collectWorkspaceMeta(config, scope) {
        const nodes = Array.isArray(config?.workspaces) ? config.workspaces : [];
        const selectedIds = new Set((scope.workspaceIds?.length ? scope.workspaceIds : [scope.workspaceId]).map((id) => text(id, '')).filter(Boolean));
        const root = findWorkspace(scope.workspaceId, nodes);
        const branchIds = root ? collectBranchIds(root) : new Set([scope.workspaceId]);
        const ids = scope.scope === 'all'
            ? (scope.workspaceIds?.length ? scope.workspaceIds : Array.from(collectAllWorkspaceIds(nodes)))
            : Array.from(new Set([scope.workspaceId].concat(Array.from(selectedIds))));
        const listedOnlyIds = scope.source === 'manual-tab-current'
            ? Array.from(branchIds).filter((id) => id && id !== scope.workspaceId)
            : [];
        return {
            activeWorkspaceId: scope.workspaceId,
            selectedWorkspaceIds: Array.from(selectedIds),
            tabs: ids.map((id) => {
                const node = findWorkspace(id, nodes) || {};
                const path = workspacePath(id, nodes);
                // No parentPath: it is `path` minus its last segment.
                return {
                    id,
                    name: text(node.name || node.title, id || 'Main'),
                    path: path.map((part) => part.name).join(' / '),
                    contentsIncluded: scope.scope === 'all' || selectedIds.has(id)
                };
            }),
            subTabsListedOnly: listedOnlyIds.map((id) => {
                const node = findWorkspace(id, nodes) || {};
                return {
                    id,
                    name: text(node.name || node.title, id),
                    path: workspacePath(id, nodes).map((part) => part.name).join(' / ')
                };
            })
        };
    }

    function getWorkspaceGroupId(workspaceId, nodes) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (text(node?.id, '').toLowerCase() === target) return text(node?.groupId, '');
            const nested = getWorkspaceGroupId(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return '';
    }

    function normalizeScope(scope) {
        const value = text(scope, 'workspace').toLowerCase();
        if (value === 'group') return 'group';
        if (['all', 'store', 'datapack'].includes(value)) return 'all';
        if (['card', 'category'].includes(value)) return 'card';
        return 'workspace';
    }

    function normalizeScopeOptions(state, options = {}) {
        const cfg = getConfig(state);
        const raw = options?.scope && typeof options.scope === 'object' ? options.scope : (options || {});
        const scope = normalizeScope(raw.scope);
        const workspaceId = text(raw.workspaceId, cfg.activeWorkspace || 'main');
        const source = text(raw.source, 'browser-local-fallback');
        const label = text(raw.label, scope === 'all' ? 'Whole datapack' : (scope === 'group' ? 'Current group' : (scope === 'card' ? 'Specific card' : 'Current tab branch')));
        const currentTabOnly = source === 'manual-tab-current'
            || label.toLowerCase().includes('current tab only')
            || raw.includeBranch === false;
        let workspaceIds = asArray(raw.workspaceIds).map((id) => text(id, '')).filter(Boolean);
        if (scope === 'group' && !workspaceIds.length) {
            const groupId = text(cfg?.groupOverviewId, '') || getWorkspaceGroupId(workspaceId, cfg.workspaces);
            if (groupId) {
                const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
                if (typeof groupsApi?.getGroupRoots === 'function') {
                    const ids = new Set();
                    (groupsApi.getGroupRoots(groupId, cfg) || []).forEach((root) => {
                        if (!root?.id) return;
                        const rootNode = findWorkspace(root.id, cfg.workspaces);
                        if (rootNode) {
                            collectBranchIds(rootNode).forEach((id) => ids.add(id));
                        } else {
                            ids.add(root.id);
                        }
                    });
                    workspaceIds = Array.from(ids);
                }
            }
        }
        if (scope !== 'all' && scope !== 'group' && (scope === 'card' || currentTabOnly)) {
            workspaceIds = [workspaceId];
        } else if (!workspaceIds.length && scope !== 'all' && scope !== 'group') {
            const root = findWorkspace(workspaceId, cfg.workspaces);
            workspaceIds = Array.from(root ? collectBranchIds(root) : new Set([workspaceId]));
        }
        return {
            scope,
            workspaceId,
            workspaceIds,
            categoryName: text(raw.categoryName, ''),
            label,
            source
        };
    }

    function categoryMatches(scoped, scope) {
        const parsed = splitScopedKey(scoped);
        if (scope.scope !== 'all' && !scope.workspaceIds.includes(parsed.workspace)) return false;
        return !(scope.scope === 'card' && scope.categoryName && parsed.category !== scope.categoryName);
    }

    function connectionEntryId(conn) {
        return text(conn?.entryId || conn?.libraryEntryId || conn?.targetEntryId || conn?.targetId || conn?.entry);
    }

    function buildLibraryIndexes(categories, connections) {
        const entriesById = {};
        const linkToEntry = {};
        Object.values(categories || {}).forEach((data) => {
            (Array.isArray(data?.entries) ? data.entries : []).forEach((entry) => {
                const id = text(entry?.id, '');
                if (id) entriesById[id] = entry;
            });
        });
        (connections || []).forEach((conn) => {
            const linkId = text(conn?.linkId || conn?.bookmarkId, '');
            const entry = entriesById[connectionEntryId(conn)];
            if (linkId && entry) linkToEntry[linkId] = entry;
        });
        return { entriesById, linkToEntry };
    }

    function filterStateForScope(state, scope) {
        if (scope.scope === 'all' && !scope.workspaceIds.length) {
            const full = clone(state, state);
            full.metadata = Object.assign({}, full.metadata || {}, { geminiScope: scope });
            return full;
        }
        const workspaceSet = new Set(scope.workspaceIds.length ? scope.workspaceIds : [scope.workspaceId]);
        const targetCategory = scope.scope === 'card' ? scope.categoryName : '';
        const links = getLinks(state).filter((link) => {
            const workspace = text(link?.workspace, 'main');
            const category = text(link?.category, 'Unsorted');
            return workspaceSet.has(workspace) && (!targetCategory || category === targetCategory);
        }).map((link) => clone(link, link));
        const linkIds = new Set(links.map((link) => text(link?.id, '')).filter(Boolean));
        const categories = {};
        Object.entries(state?.library?.categories || {}).forEach(([key, value]) => {
            if (categoryMatches(key, scope)) categories[key] = clone(value, value);
        });
        const entryIds = new Set();
        Object.values(categories).forEach((data) => {
            (Array.isArray(data?.entries) ? data.entries : []).forEach((entry) => {
                const id = text(entry?.id, '');
                if (id) entryIds.add(id);
            });
        });
        const connections = (state?.library?.connections || []).filter((conn) => {
            return workspaceSet.has(text(conn?.workspaceId || conn?.workspace, ''))
                || linkIds.has(text(conn?.linkId || conn?.bookmarkId, ''))
                || entryIds.has(connectionEntryId(conn));
        }).map((conn) => clone(conn, conn));
        const folders = {};
        Object.entries(state?.bookmarks?.folders || {}).forEach(([key, value]) => {
            if (categoryMatches(key, scope)) folders[key] = clone(value, value);
        });
        return {
            metadata: Object.assign({}, clone(state?.metadata || {}, {}), { geminiScope: scope }),
            bookmarks: {
                links,
                config: clone(getConfig(state), {}),
                folders,
                pins: clone(state?.bookmarks?.pins || [], [])
            },
            library: { categories, connections },
            knowledge: clone(state?.knowledge || {}, {})
        };
    }

    ns.localContextScope = {
        scopedKey,
        splitScopedKey,
        getStoreState,
        getConfig,
        getLinks,
        findWorkspace,
        collectBranchIds,
        collectAllWorkspaceIds,
        workspacePath,
        collectWorkspaceMeta,
        getWorkspaceGroupId,
        normalizeScope,
        normalizeScopeOptions,
        categoryMatches,
        connectionEntryId,
        buildLibraryIndexes,
        filterStateForScope
    };
})();