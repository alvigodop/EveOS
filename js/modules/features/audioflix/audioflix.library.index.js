// Derived runtime projections only. Canonical arrays/items remain the sole library and persistence source.
window.EveAudioflixLibraryIndex = window.EveAudioflixLibraryIndex || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixLibraryIndex;
    if (ns.ready) return;
    const states = new WeakMap();
    const EMPTY = Object.freeze([]);
    const NO_GROUP = Object.freeze(['']);
    let contentRevision = 0;
    const dimensions = ['folder', 'group', 'playlist', 'provider', 'identity', 'artist', 'classifier'];
    const text = value => String(value ?? '').trim();
    function idKey(value) {
        if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return '';
        return text(value);
    }
    const kindKey = type => type === 'music' ? 'music' : 'soundboard';
    const scopeKey = (dimension, value) => ['provider', 'group'].includes(dimension) ? text(value).toLowerCase() : text(value);

    // Most IDs and identity-like dimension values are unique. Storing every singleton in its own
    // Set caused tens of thousands of tiny allocations whenever a 25k library index was rebuilt.
    // Keep the common case as the row itself and promote to a Set only when a real collision exists.
    function collectionAdd(map, key, row) {
        const current = map.get(key);
        if (!current) { map.set(key, row); return; }
        if (current instanceof Set) { current.add(row); return; }
        if (current !== row) map.set(key, new Set([current, row]));
    }
    function collectionDelete(map, key, row) {
        const current = map.get(key);
        if (!current) return;
        if (current instanceof Set) {
            current.delete(row);
            if (!current.size) map.delete(key);
            else if (current.size === 1) map.set(key, current.values().next().value);
            return;
        }
        if (current === row) map.delete(key);
    }
    const collectionSize = value => value instanceof Set ? value.size : (value ? 1 : 0);
    const collectionSingle = value => value instanceof Set
        ? (value.size === 1 ? value.values().next().value : null)
        : (value || null);
    const collectionRows = value => value instanceof Set ? [...value] : (value ? [value] : []);
    function groupKeys(snapshot, type, id) {
        const groups = snapshot[type === 'music' ? 'musicGroupMap' : 'soundGroupMap']?.[id] || [];
        return groups.length ? [...new Set(groups.map(value => scopeKey('group', value)))] : NO_GROUP;
    }
    function sameValues(left, right) {
        if (left === right) return true;
        if (!left || !right || left.length !== right.length) return false;
        for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
        return true;
    }

    function describe(snapshot, type, item, rank, position = rank) {
        const id = idKey(item.id), groups = snapshot[type === 'music' ? 'musicGroupMap' : 'soundGroupMap']?.[id] || [];
        const keys = {
            folder: [text(item.folder || item.card)], group: groupKeys(snapshot, type, id),
            playlist: [text(item.playlistId)], provider: [text(item.sourceProvider).toLowerCase()],
            identity: [window.EveAudioflixStateSchema?.identityKey?.(item) || ''],
            artist: [text(item.artist)], classifier: [...new Set((item.classifiers || []).map(text))]
        };
        const haystack = [item.title, item.audioTitle, item.audioArtist, item.creatorDisplayName, item.creator,
            item.caption, item.artist, item.album, item.folder, item.card, item.category, item.sourceProvider,
            ...(item.classifiers || []), ...groups].map(value => text(value).toLowerCase()).join('\u0001');
        return { id, item, rank, position, keys, doc: Object.freeze({ item, haystack }) };
    }
    function drop(index, row) {
        index.rows.delete(row.item);
        if (row.id) collectionDelete(index.ids, row.id, row);
        for (const dimension of dimensions) for (const key of row.keys[dimension]) {
            collectionDelete(index.buckets[dimension], key, row);
        }
    }
    function put(index, row) {
        index.rows.set(row.item, row);
        if (row.id) collectionAdd(index.ids, row.id, row);
        for (const dimension of dimensions) for (const key of row.keys[dimension]) {
            collectionAdd(index.buckets[dimension], key, row);
        }
    }
    function build(snapshot, type) {
        const started = window.performance?.now?.() ?? Date.now();
        const source = snapshot[kindKey(type)] || EMPTY;
        const index = { source, length: source.length, rows: new Map(), ids: new Map(), revision: ++contentRevision,
            buckets: Object.fromEntries(dimensions.map(key => [key, new Map()])), nextRank: source.length, docs: null, scopes: new Map(), updates: 0 };
        source.forEach((item, rank) => put(index, describe(snapshot, type, item, rank)));
        index.api = Object.freeze({
            getById(value) {
                ensureSource(index, snapshot, type);
                let rows = index.ids.get(idKey(value));
                if (collectionSize(rows) !== 1) return null;
                let row = collectionSingle(rows);
                if (index.source[row.position] !== row.item || idKey(row.item.id) !== row.id) {
                    repair(index, snapshot, type);
                    rows = index.ids.get(idKey(value));
                    if (collectionSize(rows) !== 1) return null;
                    row = collectionSingle(rows);
                }
                return idKey(row.item.id) === row.id ? row.item : null;
            },
            isAmbiguous(value) { ensureSource(index, snapshot, type); return collectionSize(index.ids.get(idKey(value))) > 1; },
            docFor(item) {
                ensureSource(index, snapshot, type);
                let row = index.rows.get(item);
                if (row && index.source[row.position] !== item) {
                    repair(index, snapshot, type); row = index.rows.get(item);
                }
                return row?.doc || null;
            },
            scope(dimension, value) {
                ensureSource(index, snapshot, type);
                const cacheKey = `${dimension}\u0000${scopeKey(dimension, value)}`;
                const cachedScope = index.scopes.get(cacheKey);
                if (cachedScope?.revision === index.revision) {
                    if (cachedScope.rows.every(row => index.source[row.position] === row.item)) return cachedScope.items;
                    repair(index, snapshot, type);
                }
                let rows = collectionRows(index.buckets[dimension]?.get(scopeKey(dimension, value)));
                if (rows.some(row => index.source[row.position] !== row.item)) {
                    repair(index, snapshot, type);
                    rows = collectionRows(index.buckets[dimension]?.get(scopeKey(dimension, value)));
                }
                const ordered = rows.sort((a, b) => a.rank - b.rank);
                const scoped = Object.freeze(ordered.map(row => row.item));
                index.scopes.set(cacheKey, { revision: index.revision, rows: ordered, items: scoped });
                return scoped;
            },
            // Search validates row identity while scanning, so live 25k queries do one O(N) pass
            // instead of a separate whole-library integrity pass followed by another docs pass.
            // A silent same-length replacement still repairs on the first indexed query.
            search(query, limit = Infinity) {
                ensureSource(index, snapshot, type);
                const wanted = text(query).toLowerCase();
                const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity;
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    const found = [];
                    let total = 0, stale = false;
                    for (let position = 0; position < index.source.length; position += 1) {
                        const item = index.source[position], row = index.rows.get(item);
                        if (!row || row.position !== position) { stale = true; break; }
                        if (wanted && !row.doc.haystack.includes(wanted)) continue;
                        total += 1;
                        if (found.length < max) found.push(item);
                    }
                    if (!stale) return { items: found, total };
                    repair(index, snapshot, type);
                }
                return { items: [], total: 0 };
            },
            docs() {
                ensureSource(index, snapshot, type);
                if (index.source.some((item, position) => index.rows.get(item)?.position !== position)) repair(index, snapshot, type);
                if (!index.docs) index.docs = Object.freeze([...index.rows.values()].sort((a, b) => a.rank - b.rank).map(row => row.doc));
                return index.docs;
            },
            get contentRevision() { ensureSource(index, snapshot, type); return index.revision; },
            diagnostics() { return { items: index.rows.size, contentRevision: index.revision, incrementalUpdates: index.updates, cachedScopes: index.scopes.size, compactCollections: true }; }
        });
        try {
            window.EveAudioflixDiagnostics?.increment?.('index:builds');
            window.EveAudioflixDiagnostics?.record?.('index:build', (window.performance?.now?.() ?? Date.now()) - started);
        } catch { /* Optional telemetry cannot affect the canonical library. */ }
        return index;
    }
    function repair(index, snapshot, type) {
        index.source = snapshot[kindKey(type)] || EMPTY; index.length = index.source.length;
        index.rows.clear(); index.ids.clear(); index.scopes.clear();
        for (const dimension of dimensions) index.buckets[dimension].clear();
        index.source.forEach((item, position) => put(index, describe(snapshot, type, item, position)));
        index.nextRank = index.length; index.docs = null; index.revision = ++contentRevision;
    }
    // Bulk state restore/sync commonly swaps the array object while retaining almost every canonical
    // item object. Reconcile that shape in O(N) identity checks and only describe true additions,
    // instead of rebuilding 25k normalized rows and buckets on the next user gesture.
    function reconcile(index, snapshot, type) {
        const started = window.performance?.now?.() ?? Date.now();
        const source = snapshot[kindKey(type)] || EMPTY;
        if (index.source === source && index.length === source.length) return true;
        const overlapTarget = Math.min(source.length, index.rows.size);
        let reused = 0;
        for (const item of source) {
            const row = index.rows.get(item);
            if (!row) continue;
            if (!sameValues(row.keys.group, groupKeys(snapshot, type, row.id))) return false;
            reused += 1;
        }
        if (overlapTarget && reused < overlapTarget * 0.75) return false;
        if (reused !== index.rows.size || reused !== source.length) {
            const wanted = new Set(source);
            for (const row of index.rows.values()) if (!wanted.has(row.item)) drop(index, row);
        }
        source.forEach((item, position) => {
            const row = index.rows.get(item);
            if (!row) put(index, describe(snapshot, type, item, position));
            else { row.rank = position; row.position = position; }
        });
        index.source = source; index.length = source.length; index.nextRank = source.length;
        index.docs = null; index.scopes.clear(); index.revision = ++contentRevision; index.updates += 1;
        try {
            window.EveAudioflixDiagnostics?.increment?.('index:reconciles');
            window.EveAudioflixDiagnostics?.record?.('index:reconcile', (window.performance?.now?.() ?? Date.now()) - started);
        } catch { /* Optional telemetry only. */ }
        return true;
    }
    function ensureSource(index, snapshot, type) {
        const source = snapshot[kindKey(type)] || EMPTY;
        if (index.source !== source || index.length !== source.length) {
            if (!reconcile(index, snapshot, type)) repair(index, snapshot, type);
        }
    }
    function cached(snapshot, type) { return states.get(snapshot)?.[kindKey(type)] || null; }
    function get(snapshot, type = 'music') {
        const key = kindKey(type), source = snapshot[key] || EMPTY;
        let cache = states.get(snapshot);
        if (!cache) { cache = {}; states.set(snapshot, cache); }
        let index = cache[key];
        if (!index) index = cache[key] = build(snapshot, type);
        else if (index.source !== source || index.length !== source.length) {
            if (!reconcile(index, snapshot, type)) repair(index, snapshot, type);
        }
        return index.api;
    }
    function changed(index, snapshot, type) {
        index.source = snapshot[kindKey(type)] || EMPTY;
        index.length = index.source.length;
        index.revision = ++contentRevision; index.updates += 1; index.docs = null; index.scopes.clear();
        try { window.EveAudioflixDiagnostics?.increment?.('index:updates'); } catch { /* Optional telemetry only. */ }
    }
    function upsert(snapshot, type, item, previous = item) {
        const index = cached(snapshot, type);
        if (!index) return;
        const old = index.rows.get(previous), rank = old?.rank ?? index.nextRank++;
        const position = old?.position ?? (snapshot[kindKey(type)]?.length || 1) - 1;
        if (old) drop(index, old);
        put(index, describe(snapshot, type, item, rank, position));
        changed(index, snapshot, type);
    }
    function remove(snapshot, type, itemId) {
        const index = cached(snapshot, type);
        if (!index) return;
        for (const row of collectionRows(index.ids.get(idKey(itemId)))) drop(index, row);
        changed(index, snapshot, type);
        index.source.forEach((item, position) => { const row = index.rows.get(item); if (row) row.position = position; });
    }
    // Typed invalidation remains conservative for explicit item/folder/group mutation owners. The
    // untyped bulk-state path may preserve a cache only when the source array actually changed and
    // the retained rows still agree with current group membership.
    function invalidate(snapshot, type) {
        const cache = states.get(snapshot);
        if (!cache) return;
        if (type) { delete cache[kindKey(type)]; return; }
        for (const requestedType of ['music', 'sound']) {
            const key = kindKey(requestedType), index = cache[key], source = snapshot[key] || EMPTY;
            if (!index) continue;
            if (index.source !== source || index.length !== source.length) {
                if (!reconcile(index, snapshot, requestedType)) delete cache[key];
                continue;
            }
            // A bulk patch can carry a freshly copied group map without changing its semantics.
            // Keep that cache only while every indexed row still has exactly the same normalized groups.
            let groupsStable = true;
            for (const row of index.rows.values()) {
                if (!sameValues(row.keys.group, groupKeys(snapshot, requestedType, row.id))) { groupsStable = false; break; }
            }
            if (!groupsStable) delete cache[key];
        }
    }
    Object.assign(ns, { ready: true, get, upsert, remove, invalidate, idKey });
})();
