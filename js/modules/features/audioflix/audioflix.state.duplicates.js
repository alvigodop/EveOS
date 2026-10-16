// Duplicate detection and merge engine for Audioflix (Music Library and Soundboard).
//
// Identifies duplicate items across title, URL, or local file path, and provides clean merge
// operations that consolidate group tags, update target folder, and remove secondary duplicates.
window.EveAudioflixDuplicates = window.EveAudioflixDuplicates || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixDuplicates;
    if (ns.ready) return;

    const text = (value) => String(value ?? '').trim();
    const normalize = (value) => text(value).toLowerCase();
    const MEDIA_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|wmv|mp4|mkv|avi|mov|flv)$/i;
    function stripMediaExt(value) {
        let out = text(value);
        for (let i = 0; i < 3 && MEDIA_EXT.test(out); i += 1) out = out.replace(MEDIA_EXT, '');
        return out;
    }
    function fileBaseName(value) {
        const clean = normalize(value);
        if (!clean || /^https?:\/\//.test(clean)) return '';
        const base = clean.split('?')[0].split('\\').join('/').split('/').pop();
        return base && base.includes('.') ? base : '';
    }

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function pairKey(a, b) {
        return [text(a), text(b)].sort().join('|');
    }

    // Full duplicate reports keep their existing short-lived index. Card badges use a separate compact
    // content-revision cache below so ordinary renders never rebuild or retain the heavyweight graph.
    const memo = { music: null, sound: null };
    let memoClearScheduled = false;
    function scheduleMemoClear() {
        if (memoClearScheduled) return;
        memoClearScheduled = true;
        const clear = () => {
            memo.music = null; memo.sound = null; memoClearScheduled = false;
            for (const key of ['music', 'sound']) if (badgeMemo[key]?.unindexed) badgeMemo[key] = null;
        };
        (typeof queueMicrotask === 'function') ? queueMicrotask(clear) : setTimeout(clear, 0);
    }

    function normalizedPath(value) {
        const raw = normalize(value);
        // Most library rows are HTTP URLs or have no local path. Avoid allocating
        // path-rewrite strings for values that cannot supply local identity.
        if (!raw || /^(?:https?:\/\/|spotify:)/.test(raw)) return '';
        const clean = raw.replace(/^file:\/\/+/, '').replace(/\\/g, '/');
        return clean && !/^(?:https?:\/\/|spotify:)/.test(clean) ? clean.replace(/\/+$/, '') : '';
    }

    function spotifyRef(value) {
        const raw = text(value);
        const match = raw.match(/^spotify:(track|episode):([A-Za-z0-9]{22})$/i)
            || raw.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|episode)\/([A-Za-z0-9]{22})\/?(?:[?#].*)?$/i);
        return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
    }

    function sourceIdentity(item) {
        const refs = [item?.sourceUri, item?.spotifyUri, item?.url].map(spotifyRef).filter(Boolean);
        const provider = normalize(item?.sourceProvider) || (refs.length ? 'spotify' : '');
        if (provider !== 'spotify') {
            const sourceId = normalize(item?.sourceId);
            return provider && sourceId ? `${provider}:${sourceId}` : '';
        }
        const type = normalize(item?.sourceMediaType) || refs[0]?.type || 'track';
        if (item?.sourceIsLocal === true || !['track', 'episode'].includes(type)) return '';
        const id = text(item?.sourceMediaId) || refs.find(ref => ref.type === type)?.id
            || text(item?.spotifyTrackId) || text(item?.sourceId);
        if (!/^[A-Za-z0-9]{22}$/.test(id) || refs.some(ref => ref.type !== type || ref.id !== id)
            || (item?.spotifyTrackId && (type !== 'track' || text(item.spotifyTrackId) !== id))) return '';
        return `spotify:${type}:${id}`;
    }

    function urlKey(item) {
        const raw = text(item?.url);
        if (!/^https?:\/\//i.test(raw)) return '';
        if (/^https?:\/\/open\.spotify\.com(?:\/|$)/i.test(raw)) {
            if (item?.sourceIsLocal === true || normalize(item?.sourceMediaType) === 'local') return '';
            const ref = spotifyRef(raw);
            return ref ? `spotify:${ref.type}:${ref.id}` : raw.replace(/\/$/, '');
        }
        return normalize(raw).replace(/\/$/, '');
    }

    function descriptor(item, position) {
        return { item, position, id: item.id, url: urlKey(item),
            path: normalizedPath(item.localPath) || normalizedPath(item.url), source: sourceIdentity(item),
            title: normalize(stripMediaExt(item.title)), base: fileBaseName(item.url) || fileBaseName(item.localPath),
            duration: Number(item.duration || 0) };
    }

    function pairClassification(a, b) {
        const reasons = [];
        if (a.url && a.url === b.url) reasons.push('matching URL');
        if (a.path && a.path === b.path) reasons.push('matching local path');
        if (a.source && a.source === b.source) reasons.push('matching provider identity');
        if (reasons.length) return { level: 'hard', reasons };
        if (a.title && a.title === b.title) {
            reasons.push(a.duration > 0 && b.duration > 0 && Math.abs(a.duration - b.duration) > 1
                ? 'matching title, different duration'
                : 'matching title');
        }
        if (a.base && a.base === b.base) reasons.push('same file name');
        return reasons.length ? { level: 'soft', reasons } : null;
    }

    const dimensions = ['url', 'path', 'source', 'title', 'base'];
    function indexFor(type) {
        const key = type === 'music' ? 'music' : 'sound', snapshot = state();
        const items = snapshot[type === 'music' ? 'music' : 'soundboard'] || [];
        const revision = window.EveAudioflixState?.getRevision?.();
        if (memo[key]?.items === items && memo[key].length === items.length && memo[key].revision === revision) return memo[key];
        const index = { items, length: items.length, revision, docs: items.map(descriptor),
            ids: new Map(), buckets: Object.fromEntries(dimensions.map(name => [name, new Map()])),
            dismissed: new Set(snapshot.dupDismissedPairs || []), pairs: null };
        for (const doc of index.docs) {
            if (!index.ids.has(doc.id)) index.ids.set(doc.id, []);
            index.ids.get(doc.id).push(doc.position);
            for (const name of dimensions) {
                if (!doc[name]) continue;
                const bucket = index.buckets[name];
                if (!bucket.has(doc[name])) bucket.set(doc[name], []);
                bucket.get(doc[name]).push(doc.position);
            }
        }
        memo[key] = index;
        scheduleMemoClear();
        return index;
    }

    // Badge lookups retain one canonical membership baseline. Temporary playlist/import work can add
    // or remove a tiny number of objects and then restore the original array; keep the baseline alive
    // across that excursion so the next user gesture does not normalize all 25k tracks again.
    const badgeMemo = { music: null, sound: null };
    function contentRevision(snapshot, type) {
        const view = window.EveAudioflixLibraryIndex?.get?.(snapshot, type);
        return view?.contentRevision ?? window.EveAudioflixState?.getRevision?.() ?? -1;
    }
    function refreshDismissed(index, dismissedSource) {
        if (index.dismissedSource === dismissedSource) return index;
        index.dismissedSource = dismissedSource;
        index.dismissed = new Set(dismissedSource);
        return index;
    }
    function buildBadgeIndex(snapshot, items, revision, dismissedSource, retainMembership) {
        const first = Object.fromEntries(dimensions.map(name => [name, new Map()]));
        const buckets = Object.fromEntries(dimensions.map(name => [name, new Map()]));
        for (const item of items) {
            const id = text(item?.id);
            if (!id) continue;
            const doc = descriptor(item, 0);
            for (const name of dimensions) {
                const value = doc[name];
                if (!value) continue;
                const prior = first[name].get(value);
                if (prior === undefined) { first[name].set(value, id); continue; }
                if (prior === id) continue;
                let ids = buckets[name].get(value);
                if (!ids) { ids = new Set([prior]); buckets[name].set(value, ids); }
                ids.add(id);
            }
        }
        return { snapshot, items, length: items.length, revision, buckets,
            unindexed: typeof window.EveAudioflixLibraryIndex?.get !== 'function',
            members: retainMembership ? new Set(items) : null,
            dismissedSource, dismissed: new Set(dismissedSource) };
    }
    function membershipOverlap(index, items) {
        if (!index?.members?.size || !items.length) return 0;
        let reused = 0;
        for (const item of items) if (index.members.has(item)) reused += 1;
        return reused;
    }
    function sameMembership(index, items) {
        if (!index?.members || index.members.size !== items.length) return false;
        for (const item of items) if (!index.members.has(item)) return false;
        return true;
    }
    function badgeIndexFor(type) {
        // Without the canonical content-revision owner, retain only the original same-turn cache.
        if (typeof window.EveAudioflixLibraryIndex?.get !== 'function') scheduleMemoClear();
        const key = type === 'music' ? 'music' : 'sound', snapshot = state();
        const items = snapshot[type === 'music' ? 'music' : 'soundboard'] || [];
        const revision = contentRevision(snapshot, type), dismissedSource = snapshot.dupDismissedPairs || [];
        const cached = badgeMemo[key];
        if (cached?.snapshot === snapshot) {
            if (cached.items === items && cached.length === items.length) {
                if (cached.revision === revision) return refreshDismissed(cached, dismissedSource);
                // Same live array + same membership with a new content revision can be a real
                // title/URL/source edit. Replace the baseline so future card reads stay O(1).
                return badgeMemo[key] = buildBadgeIndex(snapshot, items, revision, dismissedSource, true);
            }
            // A different array containing the exact same canonical item objects is the common bulk
            // restore case. The duplicate-sensitive fields live on those objects, so rebind the stable
            // projection instead of repeating the expensive descriptor pass.
            if (sameMembership(cached, items)) {
                cached.items = items;
                cached.length = items.length;
                cached.revision = revision;
                return refreshDismissed(cached, dismissedSource);
            }
            // If membership only wandered temporarily (playlist import/sync qualification, transient
            // provider rows), build a disposable projection for that state but do not evict the stable
            // baseline. Once the original objects return, the branch above reuses it immediately.
            if (cached.members?.size) {
                const overlapTarget = Math.min(cached.members.size, items.length);
                const reused = membershipOverlap(cached, items);
                if (overlapTarget && reused >= overlapTarget * 0.75) {
                    return buildBadgeIndex(snapshot, items, revision, dismissedSource, false);
                }
            }
        }
        return badgeMemo[key] = buildBadgeIndex(snapshot, items, revision, dismissedSource, true);
    }
    function badgeItem(snapshot, type, itemId) {
        const indexed = window.EveAudioflixLibraryIndex?.get?.(snapshot, type)?.getById?.(itemId);
        if (indexed) return indexed;
        const items = snapshot[type === 'music' ? 'music' : 'soundboard'] || [];
        return items.find(item => text(item?.id) === text(itemId)) || null;
    }
    function bucketHasOther(index, name, value, itemId) {
        if (!value) return false;
        for (const otherId of index.buckets[name].get(value) || []) {
            if (otherId !== itemId && !index.dismissed.has(pairKey(itemId, otherId))) return true;
        }
        return false;
    }
    function hasCollision(index, names) {
        for (const name of names) {
            for (const [value, ids] of index.buckets[name]) {
                for (const id of ids) if (bucketHasOther(index, name, value, id)) return true;
            }
        }
        return false;
    }
    // Nexus only needs a cheap "is there anything to review?" signal for its default panel. Exact
    // duplicate pairs remain lazy behind the explicit duplicates facet/settings flow.
    function duplicateBadgeSummary(type = 'sound') {
        const index = badgeIndexFor(type);
        const hard = hasCollision(index, ['url', 'path', 'source']);
        const soft = hasCollision(index, ['title', 'base']);
        return { hard, soft, any: hard || soft };
    }

    function candidates(index, position) {
        const found = new Set(), doc = index.docs[position];
        for (const name of dimensions) {
            for (const other of index.buckets[name].get(doc[name]) || []) if (other !== position) found.add(other);
        }
        return [...found].sort((a, b) => a - b);
    }
    function pair(index, left, right) {
        const classification = pairClassification(index.docs[left], index.docs[right]);
        return classification ? { ...classification, reason: classification.reasons.join(' + '),
            items: [index.items[left], index.items[right]] } : null;
    }

    function findDuplicates(type = 'sound') {
        const index = indexFor(type);
        if (index.pairs) return index.pairs;
        const pairs = [];
        for (let left = 0; left < index.docs.length; left += 1) {
            for (const right of candidates(index, left)) {
                if (right <= left) continue;
                const found = pair(index, left, right);
                if (found) pairs.push(found);
            }
        }
        return index.pairs = pairs.sort((a, b) => (a.level === b.level ? 0 : (a.level === 'hard' ? -1 : 1)));
    }

    function duplicatesFor(type, itemId) {
        if (!itemId) return [];
        const seen = new Set();
        return duplicateInfoFor(type, itemId).map(entry => entry.item)
            .filter(it => {
                if (seen.has(it.id)) return false;
                seen.add(it.id);
                return true;
            });
    }

    function duplicateInfoFor(type, itemId) {
        if (!itemId) return [];
        const snapshot = state(), items = snapshot[type === 'music' ? 'music' : 'soundboard'] || [], id = text(itemId);
        const library = window.EveAudioflixLibraryIndex?.get?.(snapshot, type);
        if (!library?.getById) return window.EveAudioflixDuplicateDetails.scan({
            items, itemId, dismissed: snapshot.dupDismissedPairs || [], descriptor, pairClassification,
            indexedFallback: () => indexedDuplicateInfoFor(type, itemId)
        });
        if (library.isAmbiguous?.(id)) return indexedDuplicateInfoFor(type, id);
        const item = library.getById(id);
        if (!item) return [];
        const index = badgeIndexFor(type), selected = descriptor(item, 0), candidateIds = new Set();
        for (const name of dimensions) for (const otherId of index.buckets[name].get(selected[name]) || []) {
            if (otherId !== id && !index.dismissed.has(pairKey(id, otherId))) candidateIds.add(otherId);
        }
        const matches = [];
        for (const otherId of candidateIds) {
            if (library.isAmbiguous?.(otherId)) return indexedDuplicateInfoFor(type, id);
            const other = library.getById(otherId);
            if (!other) continue;
            const found = pairClassification(selected, descriptor(other, 0));
            if (found) matches.push({ item: other, ...found, reason: found.reasons.join(' + '), position: items.indexOf(other) });
        }
        matches.sort((a, b) => (a.level === b.level ? a.position - b.position : a.level === 'hard' ? -1 : 1));
        return matches.map(({ position, ...match }) => match);
    }

    function indexedDuplicateInfoFor(type, itemId) {
        if (!itemId) return [];
        const index = indexFor(type), seen = new Set(), matches = [];
        for (const position of index.ids.get(itemId) || []) {
            for (const other of candidates(index, position)) {
                const left = Math.min(position, other), right = Math.max(position, other), key = `${left}:${right}`;
                const item = index.items[other];
                if (item.id === itemId || seen.has(key) || index.dismissed.has(pairKey(itemId, item.id))) continue;
                seen.add(key);
                const found = pair(index, left, right);
                if (found) matches.push({ item, level: found.level, reason: found.reason, reasons: found.reasons, left, right });
            }
        }
        matches.sort((a, b) => (a.level === b.level ? a.left - b.left || a.right - b.right : a.level === 'hard' ? -1 : 1));
        return matches.map(({ left, right, ...match }) => match);
    }

    function duplicateLevelFor(type, itemId) {
        if (!itemId) return '';
        const snapshot = state(), id = text(itemId), item = badgeItem(snapshot, type, id);
        if (!item) return '';
        const index = badgeIndexFor(type), doc = descriptor(item, 0);
        for (const name of ['url', 'path', 'source']) if (bucketHasOther(index, name, doc[name], id)) return 'hard';
        for (const name of ['title', 'base']) if (bucketHasOther(index, name, doc[name], id)) return 'soft';
        return '';
    }

    function dismissDuplicate(aId, bId) {
        if (!aId || !bId || aId === bId) return { ok: false };
        const current = state().dupDismissedPairs || [];
        const key = pairKey(aId, bId);
        if (!current.includes(key)) {
            window.EveAudioflixState?.update?.({ dupDismissedPairs: [...current, key] }, 'audioflix-dup-keep-both');
        }
        memo.music = memo.sound = null;
        return { ok: true, dismissed: key };
    }

    function isDuplicate(type, itemId) {
        return !!duplicateLevelFor(type, itemId);
    }

    function mergeDuplicates(type, primaryId, duplicateIds = [], targetFolder = '') {
        const isM = type === 'music';
        const stateKey = isM ? 'music' : 'soundboard';
        const items = state()[stateKey] || [];
        const primary = items.find(it => it.id === primaryId);
        if (!primary) return { ok: false, reason: 'Primary item not found' };

        const dupes = items.filter(it => duplicateIds.includes(it.id) && it.id !== primaryId);
        if (!dupes.length) return { ok: false, reason: 'No valid duplicate items selected for merge' };

        const getGroups = (id) => (isM ? (state().musicGroupMap?.[id] || []) : (state().soundGroupMap?.[id] || []));
        const allGroups = new Set(getGroups(primaryId));
        dupes.forEach(d => getGroups(d.id).forEach(g => allGroups.add(g)));
        allGroups.forEach(g => {
            if (isM) window.EveAudioflixState?.toggleMusicGroup?.(primaryId, g, true);
            else window.EveAudioflixState?.toggleSoundGroup?.(primaryId, g, true);
        });

        const patch = {};
        if (targetFolder !== undefined && targetFolder !== null && targetFolder !== '') {
            const cleanFolder = text(targetFolder);
            patch.folder = cleanFolder;
            patch.card = cleanFolder;
        }

        const isLocalSource = (value) => {
            const s = normalize(value);
            return !!s && !/^(?:https?:\/\/|spotify:|blob:|data:)/.test(s);
        };
        let onlineUrl = '';
        let localPath = '';
        [primary, ...dupes].forEach((it) => {
            [it.url, it.localPath].forEach((candidate) => {
                const clean = text(candidate);
                if (!clean) return;
                if (isLocalSource(clean)) { if (!localPath) localPath = clean; }
                else if (!onlineUrl) onlineUrl = clean;
            });
        });
        const newUrl = onlineUrl || localPath || primary.url;
        if (newUrl && newUrl !== primary.url) patch.url = newUrl;
        if (localPath && localPath !== text(primary.localPath)) patch.localPath = localPath;

        const mergedClassifiers = new Set((primary.classifiers || []).map(text).filter(Boolean));
        dupes.forEach((d) => (d.classifiers || []).forEach((c) => { const v = text(c); if (v) mergedClassifiers.add(v); }));
        if (mergedClassifiers.size !== (primary.classifiers || []).length) patch.classifiers = [...mergedClassifiers];

        const byScope = new Map();
        dupes.forEach((d) => (d.localizations || []).forEach((l) => { if (l?.source && l?.path) byScope.set(l.source, l); }));
        (primary.localizations || []).forEach((l) => { if (l?.source && l?.path) byScope.set(l.source, l); });
        if (byScope.size !== (primary.localizations || []).length) patch.localizations = [...byScope.values()];

        if (Object.keys(patch).length) window.EveAudioflixState?.updateItem?.(type, primaryId, patch);
        dupes.forEach(d => window.EveAudioflixState?.removeItem?.(type, d.id));

        memo.music = memo.sound = null;
        badgeMemo.music = badgeMemo.sound = null;
        return { ok: true, mergedCount: dupes.length, primaryId, dualSource: !!(onlineUrl && localPath) };
    }

    Object.assign(ns, {
        ready: true,
        findDuplicates,
        duplicatesFor,
        duplicateInfoFor,
        duplicateLevelFor,
        duplicateBadgeSummary,
        isDuplicate,
        mergeDuplicates,
        dismissDuplicate
    });
})();
