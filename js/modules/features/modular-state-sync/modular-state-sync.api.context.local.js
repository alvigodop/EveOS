// --- Modular State Sync API: Local Gemini Context Fallback ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextLocalReady) return;

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
        return [];
    }

    function clone(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return fallback;
        }
    }

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

    function normalizeScope(scope) {
        const value = text(scope, 'workspace').toLowerCase();
        if (['all', 'store', 'datapack'].includes(value)) return 'all';
        if (['card', 'category'].includes(value)) return 'card';
        return 'workspace';
    }

    function normalizeScopeOptions(state, options = {}) {
        const cfg = getConfig(state);
        const raw = options?.scope && typeof options.scope === 'object' ? options.scope : (options || {});
        const scope = normalizeScope(raw.scope);
        const workspaceId = text(raw.workspaceId, cfg.activeWorkspace || 'main');
        let workspaceIds = asArray(raw.workspaceIds).map((id) => text(id, '')).filter(Boolean);
        if (!workspaceIds.length && scope !== 'all') {
            const root = findWorkspace(workspaceId, cfg.workspaces);
            workspaceIds = Array.from(root ? collectBranchIds(root) : new Set([workspaceId]));
        }
        return {
            scope,
            workspaceId,
            workspaceIds,
            categoryName: text(raw.categoryName, ''),
            label: text(raw.label, scope === 'all' ? 'Whole datapack' : (scope === 'card' ? 'Specific card' : 'Current tab branch')),
            source: text(raw.source, 'browser-local-fallback')
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

    function first(source, keys) {
        for (const key of keys) {
            if (source?.[key] != null && source[key] !== '') return source[key];
        }
        return '';
    }

    function progress(source) {
        return {
            chapter: first(source, ['chapter', 'graphicChapter', 'novelChapter']),
            episode: first(source, ['episode']),
            season: first(source, ['season']),
            volume: first(source, ['volume']),
            progress: first(source, ['progress', 'progressUnits'])
        };
    }

    function timestamp(source) {
        return first(source, ['lastEdited', 'lastUpdated', 'updatedAt', 'dateAdded', 'createdAt', 'lastVisited']);
    }

    function relatedUrls(link) {
        const out = [];
        asArray(link?.relatedUrls).forEach((item) => out.push(text(item?.url || item?.href || item, '')));
        ['mirrorUrl', 'sourceUrl', 'wikiUrl', 'alternateUrl'].forEach((key) => out.push(text(link?.[key], '')));
        return Array.from(new Set(out.filter(Boolean))).slice(0, 8);
    }

    function bookmarkContext(link, linkedEntry) {
        const entry = linkedEntry || {};
        return {
            id: link?.id,
            title: text(link?.title, 'Untitled'),
            urls: { primary: text(link?.url || link?.href, '') },
            relatedUrls: relatedUrls(link),
            workspace: text(link?.workspace, 'main'),
            category: text(link?.category, 'Unsorted'),
            folderId: text(link?.folderId, ''),
            taskStatus: link?.done ? 'Done' : 'Pending',
            done: !!link?.done,
            pinned: !!link?.pinned,
            status: text(entry.status || link?.status || link?.readingStatus || link?.mediaStatus, ''),
            notes: text(link?.personalNotes || link?.notes || entry.notes || entry.summary, '').slice(0, 900),
            progress: progress(Object.assign({}, entry, link)),
            timestamps: {
                updated: timestamp(link) || timestamp(entry),
                dateAdded: text(link?.dateAdded || entry.dateAdded, ''),
                lastEdited: text(link?.lastEdited || entry.lastEdited, ''),
                lastVisited: text(link?.lastVisited, '')
            },
            tags: asArray(link?.tags).concat(asArray(entry.tags)).slice(0, 24),
            library: {
                linked: !!linkedEntry,
                title: text(entry.title, ''),
                aliases: asArray(entry.aliases || entry.alternativeTitles || entry.otherNames).slice(0, 12),
                entryId: text(entry.id, '')
            }
        };
    }

    function countFolders(tree) {
        const nodes = Array.isArray(tree) ? tree : (tree?.nodes || tree?.folders || []);
        let count = 0;
        const stack = nodes.slice();
        while (stack.length) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            count += 1;
            stack.push(...(node.children || node.subFolders || []));
        }
        return count;
    }

    function summarizeState(state, limit, scope) {
        const links = getLinks(state);
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const folders = state?.bookmarks?.folders || {};
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const byWorkspace = {};
        const byCard = {};
        links.forEach((link) => {
            const workspace = text(link?.workspace, 'main');
            const category = text(link?.category, 'Unsorted');
            byWorkspace[workspace] = (byWorkspace[workspace] || 0) + 1;
            byCard[scopedKey(workspace, category)] = (byCard[scopedKey(workspace, category)] || 0) + 1;
        });
        const folderOverview = {};
        let folderTotal = 0;
        Object.entries(folders).forEach(([key, tree]) => {
            const count = countFolders(tree);
            folderTotal += count;
            folderOverview[key] = { folderCount: count };
        });
        return {
            kind: 'eveos_modular_summary',
            generatedAt: new Date().toISOString(),
            scope,
            counts: {
                bookmarks: links.length,
                libraryEntries: Object.values(categories).reduce((sum, data) => sum + (data?.entries || []).length, 0),
                connections: connections.length,
                workspaces: Object.keys(byWorkspace).length,
                cards: Object.keys(byCard).length
            },
            breakdown: {
                bookmarksByWorkspace: byWorkspace,
                bookmarksByCard: byCard,
                folders: { totalFolders: folderTotal, byCard: folderOverview },
                nexusSignals: {
                    health: {
                        withNotes: links.filter((link) => text(link?.notes || link?.personalNotes, '')).length,
                        withRelatedUrls: links.filter((link) => relatedUrls(link).length).length,
                        libraryLinked: connections.length,
                        done: links.filter((link) => !!link?.done).length,
                        pending: links.filter((link) => !link?.done).length
                    }
                }
            },
            samples: {
                bookmarks: links.slice(0, limit).map((link) => bookmarkContext(link, linkToEntry[text(link?.id, '')])),
                folders: Object.entries(folders).slice(0, limit).map(([key, tree]) => ({
                    scopedKey: key,
                    folderCount: countFolders(tree)
                }))
            },
            localFallback: true
        };
    }

    function buildLocalGeminiContext(mode = 'summary', limit = 25, options = {}) {
        const state = getStoreState();
        if (!state || !state.bookmarks) return { ok: false, error: 'No in-browser EveOS state is available.' };
        const safeMode = text(mode, 'summary').toLowerCase() === 'full' ? 'full' : 'summary';
        const safeLimit = Math.max(5, Math.min(200, Number(limit) || 25));
        const scope = normalizeScopeOptions(state, options?.scope || options);
        const scopedState = filterStateForScope(state, scope);
        const payload = safeMode === 'full' ? scopedState : summarizeState(scopedState, safeLimit, scope);
        const header = safeMode === 'full'
            ? '[SYSTEM CONTEXT: EveOS in-browser scoped state snapshot follows as JSON. Use it as reference context.]'
            : '[SYSTEM CONTEXT: EveOS in-browser scoped state summary follows as JSON. Use it as reference context.]';
        return {
            ok: true,
            mode: safeMode,
            contextText: `${header}\n${JSON.stringify(payload, null, 2)}`,
            payload,
            localFallback: true
        };
    }

    Object.assign(ns, { buildLocalGeminiContext });
    ns.apiContextLocalReady = true;
})();
