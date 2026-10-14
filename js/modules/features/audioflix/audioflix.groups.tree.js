// Recursive group topology shared by Audioflix music and soundboard. Existing flat group arrays
// stay authoritative; the optional parent maps only describe nesting, so old saved states migrate
// as root-only trees without changing membership identity.
window.EveAudioflixGroupTree = window.EveAudioflixGroupTree || {};

(function () {
    'use strict';
    const ns = window.EveAudioflixGroupTree;
    if (ns.ready) return;

    const text = (value) => String(value ?? '').trim();
    const EMPTY_GROUPS = Object.freeze([]);
    const EMPTY_PARENTS = Object.freeze({});
    const sourceMembership = new WeakMap();
    const topologyMemo = new WeakMap();
    const keys = (type) => type === 'music'
        ? { groups: 'musicGroups', parents: 'musicGroupParents', map: 'musicGroupMap', items: 'music' }
        : { groups: 'soundboardGroups', parents: 'soundGroupParents', map: 'soundGroupMap', items: 'soundboard' };
    const names = (state, type) => Array.isArray(state?.[keys(type).groups]) ? state[keys(type).groups] : EMPTY_GROUPS;
    const canonical = (groups, value) => {
        const wanted = text(value).toLowerCase();
        return groups.find((name) => text(name).toLowerCase() === wanted) || '';
    };

    function normalizeParents(groups, raw) {
        const list = [...new Set((groups || []).map(text).filter(Boolean))];
        const out = {};
        for (const [childValue, parentValue] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
            const child = canonical(list, childValue), parent = canonical(list, parentValue);
            if (child && parent && child !== parent) out[child] = parent;
        }
        // Break corrupt cycles deterministically at the earliest group in saved display order.
        let changed = true;
        while (changed) {
            changed = false;
            for (const start of list) {
                const seen = new Map(), chain = [];
                let current = start;
                while (current && out[current]) {
                    if (seen.has(current)) {
                        const cycle = chain.slice(seen.get(current));
                        const cut = cycle.sort((a, b) => list.indexOf(a) - list.indexOf(b))[0];
                        delete out[cut];
                        changed = true;
                        break;
                    }
                    seen.set(current, chain.length);
                    chain.push(current);
                    current = out[current];
                }
                if (changed) break;
            }
        }
        return out;
    }

    // Rendering one card used to rebuild/cycle-check the entire parent graph several times via
    // deepest() -> path(). The topology only changes when the group registry or parent-map owner
    // changes (official add/remove/rename/reparent mutations replace one of those identities, while
    // an in-place add changes registry length). Keep the validated graph and derived paths stable
    // across unrelated Audioflix revisions such as volume, view mode, persistence, and playback.
    function topology(state, type) {
        const list = names(state, type), config = keys(type);
        const rawParents = state?.[config.parents] && typeof state[config.parents] === 'object'
            ? state[config.parents] : EMPTY_PARENTS;
        if (!state || typeof state !== 'object') return buildTopology(list, rawParents);
        let cache = topologyMemo.get(state);
        if (!cache) { cache = {}; topologyMemo.set(state, cache); }
        const key = type === 'music' ? 'music' : 'sound';
        const prior = cache[key];
        if (prior && prior.groups === list && prior.groupCount === list.length && prior.rawParents === rawParents) return prior;
        return cache[key] = buildTopology(list, rawParents);
    }

    function buildTopology(list, rawParents) {
        const parentMap = normalizeParents(list, rawParents);
        const canonicalNames = new Map();
        for (const name of list) canonicalNames.set(text(name).toLowerCase(), name);
        const childMap = new Map([['', []]]);
        for (const name of list) {
            const parent = parentMap[name] || '';
            if (!childMap.has(parent)) childMap.set(parent, []);
            childMap.get(parent).push(name);
            if (!childMap.has(name)) childMap.set(name, []);
        }
        return { groups: list, groupCount: list.length, rawParents, parentMap, canonicalNames, childMap, paths: new Map() };
    }

    const topologyCanonical = (graph, value) => graph.canonicalNames.get(text(value).toLowerCase()) || '';
    function topologyPath(graph, group) {
        const clean = topologyCanonical(graph, group);
        if (!clean) return [];
        const cached = graph.paths.get(clean);
        if (cached) return cached;
        const chain = [clean], seen = new Set(chain);
        let current = clean;
        while (graph.parentMap[current] && !seen.has(graph.parentMap[current])) {
            current = graph.parentMap[current];
            seen.add(current);
            chain.push(current);
        }
        const result = chain.reverse();
        graph.paths.set(clean, result);
        return result;
    }

    function parents(state, type) {
        return { ...topology(state, type).parentMap };
    }

    function path(state, type, group) {
        return topologyPath(topology(state, type), group).slice();
    }

    function children(state, type, group = '') {
        const graph = topology(state, type), requested = text(group);
        const clean = requested ? topologyCanonical(graph, requested) : '';
        if (requested && !clean) return [];
        return [...(graph.childMap.get(clean) || [])];
    }

    function descendants(state, type, group) {
        const graph = topology(state, type), out = [];
        const root = topologyCanonical(graph, group);
        const visit = (parent) => (graph.childMap.get(parent) || []).forEach((child) => {
            out.push(child);
            visit(child);
        });
        if (root) visit(root);
        return out;
    }

    function membershipNames(state, type, group) {
        const graph = topology(state, type), clean = topologyCanonical(graph, group);
        if (!clean) return [];
        const out = [clean];
        const visit = (parent) => (graph.childMap.get(parent) || []).forEach((child) => {
            out.push(child);
            visit(child);
        });
        visit(clean);
        return out;
    }

    function itemsForGroup(state, type, group, sourceItems) {
        const config = keys(type), graph = topology(state, type), wanted = new Set(membershipNames(state, type, group));
        const items = Array.isArray(sourceItems) ? sourceItems : (state?.[config.items] || []);
        const map = state?.[config.map] || {};
        const view = window.EveAudioflixLibraryIndex?.get?.(state, type);
        if (view) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
            let subset = sourceMembership.get(items);
            if (!subset || subset.view !== view || subset.revision !== view.contentRevision || subset.length !== items.length) {
                subset = { view, revision: view.contentRevision, length: items.length,
                    positions: new Map(items.map((item, i) => [item, i])), extras: items.filter(item => !view.docFor(item)) };
                sourceMembership.set(items, subset);
            }
            const matched = new Set();
            for (const name of wanted) for (const item of view.scope('group', name)) {
                if (subset.positions.has(item)) matched.add(item);
            }
            for (const item of subset.extras) if ((map[item.id] || []).some(name => wanted.has(topologyCanonical(graph, name)))) matched.add(item);
            if (view.contentRevision !== subset.revision) { sourceMembership.delete(items); continue; }
            return [...matched].sort((a, b) => subset.positions.get(a) - subset.positions.get(b));
            }
        }
        return items.filter((item) => (map[item.id] || []).some((name) => wanted.has(topologyCanonical(graph, name))));
    }

    function ordered(state, type) {
        const graph = topology(state, type), out = [], visited = new Set();
        const visit = (name, depth) => {
            if (visited.has(name)) return;
            visited.add(name);
            out.push({ name, depth, path: topologyPath(graph, name).slice() });
            (graph.childMap.get(name) || []).forEach((child) => visit(child, depth + 1));
        };
        (graph.childMap.get('') || []).forEach((root) => visit(root, 0));
        graph.groups.forEach((name) => visit(name, 0));
        return out;
    }

    function deepest(state, type, groups) {
        const graph = topology(state, type);
        const direct = [...new Set((groups || []).map((name) => topologyCanonical(graph, name)).filter(Boolean))];
        return direct.filter((candidate) => !direct.some((other) => other !== candidate
            && topologyPath(graph, other).slice(0, -1).includes(candidate)));
    }

    function entries(state, type, sourceItems) {
        const graph = topology(state, type);
        return ordered(state, type).map(({ name, depth, path: groupPath }) => ({
            name,
            depth,
            path: groupPath,
            members: itemsForGroup(state, type, name, sourceItems),
            hasChildren: (graph.childMap.get(name) || []).length > 0
        }));
    }

    function canParent(state, type, child, parent) {
        const graph = topology(state, type), cleanChild = topologyCanonical(graph, child), cleanParent = topologyCanonical(graph, parent);
        if (!cleanChild) return false;
        if (!text(parent)) return true;
        if (!cleanParent || cleanChild === cleanParent) return false;
        const descendantsOfChild = [];
        const visit = (owner) => (graph.childMap.get(owner) || []).forEach((name) => {
            descendantsOfChild.push(name); visit(name);
        });
        visit(cleanChild);
        return !descendantsOfChild.includes(cleanParent);
    }

    Object.assign(ns, {
        ready: true, keys, names, normalizeParents, parents, path, children, descendants,
        membershipNames, itemsForGroup, ordered, deepest, entries, canParent
    });
})();