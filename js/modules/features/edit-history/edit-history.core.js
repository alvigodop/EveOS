// --- EveOS Scoped Edit History Core ---
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    const ns = window.EveEditHistory;
    if (ns.coreReady) return;

    const STORAGE_KEY = 'eveV22EditHistory';
    const SCHEMA = 'eveos.edit-history.v1';
    const MAX_PER_SCOPE = 5;
    const MAX_TOTAL = 800;
    // Above this link count, the whole-datapack and per-tab "data" layers store
    // full before/after copies of the entire state on every save — multi-MB JSON
    // clone+stringify that freezes large datapacks. We auto-skip those heavy
    // layers above the cap and keep the cheap scoped card/folder/bookmark layers
    // (the ones used for granular restore). Override via config.editHistoryFullStateMaxLinks.
    const FULL_STATE_LINK_CAP_DEFAULT = 2500;
    let store = { schema: SCHEMA, maxPerScope: MAX_PER_SCOPE, buckets: {} };
    let loaded = false;
    let persistTimer = 0;

    function nowIso() {
        return new Date().toISOString();
    }

    function text(value, fallback = '') {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value == null ? null : value));
        } catch {
            return value == null ? null : value;
        }
    }

    function signature(value) {
        try {
            return JSON.stringify(value == null ? null : value);
        } catch {
            return `unstable:${Date.now()}:${Math.random()}`;
        }
    }

    function getCoreStorageSafe() {
        try {
            return typeof getCoreStorage === 'function' ? getCoreStorage() : (window.EveCoreStorage || null);
        } catch {
            return window.EveCoreStorage || null;
        }
    }

    function normalizeStore(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const buckets = source.buckets && typeof source.buckets === 'object' ? source.buckets : {};
        const normalized = { schema: SCHEMA, maxPerScope: MAX_PER_SCOPE, buckets: {} };
        Object.entries(buckets).forEach(([key, list]) => {
            normalized.buckets[key] = (Array.isArray(list) ? list : []).slice(-MAX_PER_SCOPE);
        });
        return normalized;
    }

    function persistStore(options = {}) {
        const payload = normalizeStore(store);
        store = payload;
        if (!options.immediate) {
            if (persistTimer) clearTimeout(persistTimer);
            persistTimer = setTimeout(() => {
                persistTimer = 0;
                persistStore({ immediate: true });
            }, 450);
            return;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {}
        const storage = getCoreStorageSafe();
        if (storage?.saveJson) {
            void storage.saveJson(STORAGE_KEY, payload, {
                localFallbackKey: STORAGE_KEY,
                cleanupLocalKeys: [],
                mirrorPruneRatio: 0.05
            }).catch((error) => console.warn('[EditHistory] Failed to persist edit history:', error));
        }
    }

    function flushPersistStore() {
        if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = 0;
        }
        persistStore({ immediate: true });
    }

    function loadStore() {
        if (loaded) return store;
        loaded = true;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) store = normalizeStore(JSON.parse(raw));
        } catch {
            store = normalizeStore(null);
        }
        const storage = getCoreStorageSafe();
        if (storage?.loadJson) {
            void storage.loadJson(STORAGE_KEY, store, { legacyKeys: [STORAGE_KEY] })
                .then((value) => { store = normalizeStore(value); })
                .catch((error) => console.warn('[EditHistory] Failed to load edit history:', error));
        }
        return store;
    }

    function bucketKey(scope) {
        return `${text(scope?.layer, 'datapack')}::${text(scope?.key, '__all__')}`;
    }

    function entryId(scope) {
        return `eh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}_${bucketKey(scope).replace(/[^a-z0-9]+/gi, '_')}`;
    }

    function pinKey(pin) {
        return `${text(pin?.targetType, 'bookmark')}::${text(pin?.targetId, '')}`;
    }

    function scopedKey(workspaceId, categoryName) {
        return `${text(workspaceId, 'main')}::${text(categoryName, 'Unsorted')}`;
    }

    function splitScopedKey(key) {
        const parts = String(key || '').split('::');
        return { workspaceId: text(parts.shift(), 'main'), categoryName: text(parts.join('::'), 'Unsorted') };
    }

    function parseCardTargetId(value) {
        const parts = text(value, '').split('::');
        return parts.length >= 2
            ? { workspaceId: text(parts[0], 'main'), categoryName: text(parts.slice(1).join('::'), 'Unsorted') }
            : { workspaceId: 'main', categoryName: text(value, 'Unsorted') };
    }

    function parseFolderTargetId(value) {
        const parts = text(value, '').split('::');
        return parts.length >= 3
            ? { workspaceId: text(parts[0], 'main'), categoryName: text(parts[1], 'Unsorted'), folderId: text(parts.slice(2).join('::'), '') }
            : { workspaceId: 'main', categoryName: 'Unsorted', folderId: '' };
    }

    function buildLinkMap(snapshot) {
        const map = new Map();
        (Array.isArray(snapshot?.links) ? snapshot.links : []).forEach((link) => {
            const id = text(link?.id, '');
            if (id) map.set(id, link);
        });
        return map;
    }

    function getPinContext(pin, linkMap) {
        const type = text(pin?.targetType, 'bookmark').toLowerCase();
        if (type === 'bookmark') {
            const link = linkMap.get(text(pin?.targetId, ''));
            return link ? { workspaceId: text(link.workspace, 'main'), categoryName: text(link.category, 'Unsorted'), folderId: text(link.folderId, '') } : null;
        }
        if (type === 'card') return parseCardTargetId(pin.targetId);
        if (type === 'folder') return parseFolderTargetId(pin.targetId);
        return null;
    }

    function filterPins(snapshot, predicate) {
        const linkMap = buildLinkMap(snapshot);
        return (Array.isArray(snapshot?.quickPins) ? snapshot.quickPins : [])
            .filter((pin) => predicate(pin, getPinContext(pin, linkMap)))
            .map(clone);
    }

    function getFolderNodes(snapshot, workspaceId, categoryName) {
        const tree = snapshot?.bookmarkFolders?.[scopedKey(workspaceId, categoryName)];
        if (Array.isArray(tree?.nodes)) return tree.nodes;
        if (Array.isArray(tree)) return tree;
        return [];
    }

    function collectFolderSubtreeIds(snapshot, workspaceId, categoryName, folderId) {
        const target = text(folderId, '');
        const nodes = getFolderNodes(snapshot, workspaceId, categoryName);
        const children = new Map();
        nodes.forEach((node) => {
            const parent = text(node?.parentId, '');
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(node);
        });
        const ids = new Set();
        const pending = target ? [target] : [];
        while (pending.length) {
            const id = pending.shift();
            if (!id || ids.has(id)) continue;
            ids.add(id);
            (children.get(id) || []).forEach((node) => pending.push(text(node?.id, '')));
        }
        return ids;
    }

    function captureWorkspaceData(snapshot, workspaceId) {
        const ws = text(workspaceId, 'main');
        const folderTrees = {};
        Object.entries(snapshot?.bookmarkFolders || {}).forEach(([key, value]) => {
            if (splitScopedKey(key).workspaceId === ws) folderTrees[key] = clone(value);
        });
        return {
            workspaceId: ws,
            links: clone((snapshot?.links || []).filter((link) => text(link?.workspace, 'main') === ws)),
            bookmarkFolders: folderTrees,
            quickPins: filterPins(snapshot, (_pin, context) => context?.workspaceId === ws)
        };
    }

    function captureCardData(snapshot, workspaceId, categoryName) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const key = scopedKey(ws, cat);
        return {
            workspaceId: ws,
            categoryName: cat,
            scopedKey: key,
            links: clone((snapshot?.links || []).filter((link) => text(link?.workspace, 'main') === ws && text(link?.category, 'Unsorted') === cat)),
            folderTree: clone(snapshot?.bookmarkFolders?.[key] || null),
            quickPins: filterPins(snapshot, (_pin, context) => context?.workspaceId === ws && context?.categoryName === cat)
        };
    }

    function captureBookmarkData(snapshot, linkId) {
        const id = text(linkId, '');
        const link = (snapshot?.links || []).find((entry) => text(entry?.id, '') === id) || null;
        return {
            linkId: id,
            link: clone(link),
            quickPins: filterPins(snapshot, (pin) => text(pin?.targetType, 'bookmark').toLowerCase() === 'bookmark' && text(pin?.targetId, '') === id)
        };
    }

    function captureFolderData(snapshot, workspaceId, categoryName, folderId) {
        const ws = text(workspaceId, 'main');
        const cat = text(categoryName, 'Unsorted');
        const id = text(folderId, '');
        const ids = collectFolderSubtreeIds(snapshot, ws, cat, id);
        const nodes = getFolderNodes(snapshot, ws, cat).filter((node) => ids.has(text(node?.id, ''))).map(clone);
        return {
            workspaceId: ws,
            categoryName: cat,
            folderId: id,
            scopedKey: scopedKey(ws, cat),
            folderIds: Array.from(ids),
            nodes,
            links: clone((snapshot?.links || []).filter((link) => text(link?.workspace, 'main') === ws && text(link?.category, 'Unsorted') === cat && ids.has(text(link?.folderId, '')))),
            quickPins: filterPins(snapshot, (_pin, context) => context?.workspaceId === ws && context?.categoryName === cat && ids.has(text(context?.folderId, '')))
        };
    }

    function findWorkspaceNode(workspaces, workspaceId) {
        const target = text(workspaceId, '');
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            if (text(workspace?.id, '') === target) return workspace;
            const found = findWorkspaceNode(workspace?.subTabs, target);
            if (found) return found;
        }
        return null;
    }

    function captureWorkspaceConfig(sourceConfig, workspaceId) {
        return {
            workspaceId: text(workspaceId, 'main'),
            node: clone(findWorkspaceNode(sourceConfig?.workspaces, workspaceId))
        };
    }

    function changedScopesFromDelta(delta) {
        const scopes = new Map();
        (Array.isArray(delta?.affectedScopes) ? delta.affectedScopes : []).forEach((scope) => {
            const ws = text(scope?.workspaceId, '');
            const cat = text(scope?.categoryName, '');
            if (ws && cat) scopes.set(scopedKey(ws, cat), { workspaceId: ws, categoryName: cat });
        });
        return Array.from(scopes.values());
    }


    function getFullStateLinkCap() {
        const cfg = (window.config && typeof window.config === 'object')
            ? window.config
            : (typeof config !== 'undefined' && config ? config : {});
        const raw = Number(cfg?.editHistoryFullStateMaxLinks);
        if (Number.isFinite(raw) && raw >= 0) return raw;
        return FULL_STATE_LINK_CAP_DEFAULT;
    }

    function countLinksForWorkspace(snapshot, workspaceId) {
        const ws = text(workspaceId, 'main');
        const list = Array.isArray(snapshot?.links) ? snapshot.links : [];
        let count = 0;
        for (let i = 0; i < list.length; i += 1) {
            if (text(list[i]?.workspace, 'main') === ws) count += 1;
        }
        return count;
    }

    function pushEntry(entry, options = {}) {
        if (!entry?.scope) return false;
        // The equality guard re-stringifies before+after; for whole-state layers
        // that's a redundant multi-MB pass since the caller already knows the
        // state is dirty. Callers pass skipEqualityCheck for those layers.
        if (!options.skipEqualityCheck && signature(entry.before) === signature(entry.after)) return false;
        loadStore();
        const key = bucketKey(entry.scope);
        const list = Array.isArray(store.buckets[key]) ? store.buckets[key] : [];
        list.push(entry);
        store.buckets[key] = list.slice(-MAX_PER_SCOPE);
        pruneTotal();
        if (options.persist !== false) persistStore(options);
        return true;
    }

    function pruneTotal() {
        const all = getEntries().sort((a, b) => String(a.at).localeCompare(String(b.at)));
        const overflow = all.length - MAX_TOTAL;
        if (overflow <= 0) return;
        const removeIds = new Set(all.slice(0, overflow).map((entry) => entry.id));
        Object.keys(store.buckets).forEach((key) => {
            store.buckets[key] = store.buckets[key].filter((entry) => !removeIds.has(entry.id));
            if (!store.buckets[key].length) delete store.buckets[key];
        });
    }

    function makeEntry(kind, scope, before, after, source, meta) {
        return {
            id: entryId(scope),
            schema: SCHEMA,
            at: nowIso(),
            mutationKind: kind,
            source: text(source, kind),
            scope,
            meta: clone(meta || {}),
            before: clone(before),
            after: clone(after)
        };
    }

    function recordDataMutation(args = {}) {
        if (args?.meta?.skipEditHistory || !args.before || !args.after) return false;
        const delta = args.delta || {};
        const source = args.source || 'saveData';
        const meta = args.meta || {};
        const historyOptions = meta.editHistory && typeof meta.editHistory === 'object' ? meta.editHistory : {};
        const scopedOnly = !!historyOptions.scopedOnly || !!meta.scopedOnlyEditHistory;

        // Scale guard: skip the heavy whole-state layers when the datapack is
        // large. `historyOptions.datapack === true` (explicit) still forces it.
        const fullStateCap = getFullStateLinkCap();
        const afterLinkCount = Array.isArray(args.after?.links) ? args.after.links.length : 0;
        const datapackTooLarge = afterLinkCount > fullStateCap;

        const includeDatapack = !scopedOnly
            && (historyOptions.datapack === true || (historyOptions.datapack !== false && !datapackTooLarge));
        const includeWorkspaces = !scopedOnly && historyOptions.workspaces !== false;
        const includeCards = historyOptions.cards !== false;
        const includeFolders = !scopedOnly && historyOptions.folders !== false;
        const includeBookmarks = !scopedOnly && historyOptions.bookmarks !== false;
        const changedScopes = changedScopesFromDelta(delta);
        let recorded = false;
        if (includeDatapack) {
            recorded = pushEntry(makeEntry('data', { layer: 'datapack', key: '__all__', label: 'Data Pack' }, args.before, args.after, source, meta), { persist: false, skipEqualityCheck: true });
        }

        const workspaceIds = new Set(delta.workspaceIds || []);
        changedScopes.forEach((scope) => workspaceIds.add(scope.workspaceId));
        if (includeWorkspaces) {
            const forceWorkspaces = historyOptions.workspaces === true;
            workspaceIds.forEach((workspaceId) => {
                // Per-tab data layer is gated individually so modest tabs keep
                // their history even inside a huge datapack, while a single
                // oversized tab is skipped instead of cloned wholesale.
                if (!forceWorkspaces && countLinksForWorkspace(args.after, workspaceId) > fullStateCap) return;
                recorded = pushEntry(makeEntry('data', { layer: 'workspace', key: workspaceId, label: `Tab ${workspaceId}` }, captureWorkspaceData(args.before, workspaceId), captureWorkspaceData(args.after, workspaceId), source, meta), { persist: false, skipEqualityCheck: true }) || recorded;
            });
        }
        if (includeCards || includeFolders) {
            changedScopes.forEach((scope) => {
                const key = scopedKey(scope.workspaceId, scope.categoryName);
                if (includeCards) {
                    recorded = pushEntry(makeEntry('data', { layer: 'card', key, label: `Card ${key}` }, captureCardData(args.before, scope.workspaceId, scope.categoryName), captureCardData(args.after, scope.workspaceId, scope.categoryName), source, meta), { persist: false }) || recorded;
                }
                if (includeFolders) {
                    (delta.folderIds || []).forEach((folderId) => {
                        const folderKey = `${key}::${folderId}`;
                        recorded = pushEntry(makeEntry('data', { layer: 'folder', key: folderKey, label: `Folder ${folderKey}` }, captureFolderData(args.before, scope.workspaceId, scope.categoryName, folderId), captureFolderData(args.after, scope.workspaceId, scope.categoryName, folderId), source, meta), { persist: false }) || recorded;
                    });
                }
            });
        }
        if (includeBookmarks) {
            (delta.linkIds || []).forEach((linkId) => {
                recorded = pushEntry(makeEntry('data', { layer: 'bookmark', key: linkId, label: `Bookmark ${linkId}` }, captureBookmarkData(args.before, linkId), captureBookmarkData(args.after, linkId), source, meta), { persist: false }) || recorded;
            });
        }
        if (recorded) persistStore();
        return recorded;
    }

    function recordConfigMutation(args = {}) {
        if (args?.meta?.skipEditHistory || !args.before || !args.after) return false;
        const source = args.source || 'saveConfig';
        const meta = args.meta || {};
        let recorded = pushEntry(makeEntry('config', { layer: 'datapack', key: '__config__', label: 'Data Pack Config' }, { config: args.before }, { config: args.after }, source, meta), { persist: false });
        (args.delta?.workspaceIds || []).forEach((workspaceId) => {
            recorded = pushEntry(makeEntry('config', { layer: 'workspace', key: workspaceId, label: `Tab ${workspaceId}` }, captureWorkspaceConfig(args.before, workspaceId), captureWorkspaceConfig(args.after, workspaceId), source, meta), { persist: false }) || recorded;
        });
        const configHistory = ns._configHistory || {};
        (configHistory.collectChangedCardConfigScopes?.(args.before, args.after, args.delta) || []).forEach((scope) => {
            const key = scopedKey(scope.workspaceId, scope.categoryName);
            recorded = pushEntry(makeEntry('config', { layer: 'card', key, label: `Card Config ${key}` }, configHistory.captureCardConfig(args.before, scope.workspaceId, scope.categoryName), configHistory.captureCardConfig(args.after, scope.workspaceId, scope.categoryName), source, meta), { persist: false }) || recorded;
        });
        (configHistory.collectChangedFolderConfigScopes?.(args.before, args.after, args.delta) || []).forEach((scope) => {
            const key = configHistory.folderScopedKey(scope.workspaceId, scope.categoryName, scope.folderId);
            recorded = pushEntry(makeEntry('config', { layer: 'folder', key, label: `Folder Config ${key}` }, configHistory.captureFolderConfig(args.before, scope.workspaceId, scope.categoryName, scope.folderId), configHistory.captureFolderConfig(args.after, scope.workspaceId, scope.categoryName, scope.folderId), source, meta), { persist: false }) || recorded;
        });
        if (recorded) persistStore();
        return recorded;
    }

    function getEntries(filter = {}) {
        loadStore();
        return Object.values(store.buckets || {})
            .flat()
            .filter((entry) => !filter.layer || entry.scope?.layer === filter.layer)
            .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    }

    function findEntry(entryIdValue) {
        const id = text(entryIdValue, '');
        return getEntries().find((entry) => entry.id === id) || null;
    }

    function clearHistory() {
        store = { schema: SCHEMA, maxPerScope: MAX_PER_SCOPE, buckets: {} };
        persistStore({ immediate: true });
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', flushPersistStore);
    }

    Object.assign(ns, {
        STORAGE_KEY,
        MAX_PER_SCOPE,
        loadStore,
        flushPersistStore,
        getEntries,
        findEntry,
        clearHistory,
        recordDataMutation,
        recordConfigMutation,
        _helpers: { text, clone, signature, scopedKey, splitScopedKey, pinKey, parseFolderTargetId, maxTotal: MAX_TOTAL }
    });

    loadStore();
    ns.coreReady = true;
})();
