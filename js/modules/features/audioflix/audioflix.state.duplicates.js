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
    // Strip stacked media extensions ("Song.wmv.mp3" -> "Song") so an extension glued onto a title
    // never hides a duplicate. Bounded loop: real names don't stack more than a couple.
    const MEDIA_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|wmv|mp4|mkv|avi|mov|flv)$/i;
    function stripMediaExt(value) {
        let out = text(value);
        for (let i = 0; i < 3 && MEDIA_EXT.test(out); i += 1) out = out.replace(MEDIA_EXT, '');
        return out;
    }
    // Just the file name from a path/url, separator-agnostic. Empty for streaming links.
    function fileBaseName(value) {
        const clean = normalize(value).split('?')[0];
        if (!clean || /^https?:\/\//.test(clean)) return '';
        const base = clean.split('\\').join('/').split('/').pop();
        return base && base.includes('.') ? base : '';
    }

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    // Stable key for a pair of item ids, order-independent, for "keep both" dismissals.
    function pairKey(a, b) {
        return [text(a), text(b)].sort().join('|');
    }

    // Share a descriptor/bucket index for one synchronous render pass. A card badge never asks for
    // the quadratic full pair report. Revision/list checks and a microtask boundary retire stale data.
    const memo = { music: null, sound: null };
    let memoClearScheduled = false;
    function scheduleMemoClear() {
        if (memoClearScheduled) return;
        memoClearScheduled = true;
        const clear = () => { memo.music = null; memo.sound = null; memoClearScheduled = false; };
        (typeof queueMicrotask === 'function') ? queueMicrotask(clear) : setTimeout(clear, 0);
    }

    function normalizedPath(value) {
        const clean = normalize(value).replace(/^file:\/\/+/, '').replace(/\\/g, '/');
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
        // Spotify-local/unknown metadata is not proof that two playable recordings are identical.
        if (item?.sourceIsLocal === true || !['track', 'episode'].includes(type)) return '';
        const id = text(item?.sourceMediaId) || refs.find(ref => ref.type === type)?.id
            || text(item?.spotifyTrackId) || text(item?.sourceId);
        if (!/^[A-Za-z0-9]{22}$/.test(id) || refs.some(ref => ref.type !== type || ref.id !== id)
            || (item?.spotifyTrackId && (type !== 'track' || text(item.spotifyTrackId) !== id))) return '';
        return `spotify:${type}:${id}`; // Base62 IDs are case-sensitive; namespace is mandatory.
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
            ids: new Map(), buckets: Object.fromEntries(dimensions.map(key => [key, new Map()])),
            dismissed: new Set(snapshot.dupDismissedPairs || []), pairs: null };
        for (const doc of index.docs) {
            if (!index.ids.has(doc.id)) index.ids.set(doc.id, []);
            index.ids.get(doc.id).push(doc.position);
            for (const key of dimensions) {
                if (!doc[key]) continue;
                const bucket = index.buckets[key];
                if (!bucket.has(doc[key])) bucket.set(doc[key], []);
                bucket.get(doc[key]).push(doc.position);
            }
        }
        memo[key] = index;
        scheduleMemoClear();
        return index;
    }

    function candidates(index, position) {
        const found = new Set(), doc = index.docs[position];
        for (const key of dimensions) {
            for (const other of index.buckets[key].get(doc[key]) || []) if (other !== position) found.add(other);
        }
        return [...found].sort((a, b) => a - b);
    }
    function pair(index, left, right) {
        const classification = pairClassification(index.docs[left], index.docs[right]);
        return classification ? { ...classification, reason: classification.reasons.join(' + '),
            items: [index.items[left], index.items[right]] } : null;
    }

    // Find all duplicate pairs for a given item type ('music' or 'sound'). A hard match has shared
    // source identity; title/file-name similarity alone is intentionally soft so edits, remixes and
    // clipped versions are never presented as certain destructive duplicates.
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

    // Get duplicate matches specifically for a single item ID. Pairs the user chose to "keep both"
    // are filtered out so an acknowledged pair stops flagging as a duplicate.
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
        const index = indexFor(type), positions = index.ids.get(itemId) || [];
        for (const keys of [dimensions.slice(0, 3), dimensions.slice(3)]) {
            for (const position of positions) {
                const doc = index.docs[position];
                for (const key of keys) {
                    for (const other of index.buckets[key].get(doc[key]) || []) {
                        const item = index.items[other];
                        if (item.id !== itemId && !index.dismissed.has(pairKey(itemId, item.id))) return keys[0] === 'url' ? 'hard' : 'soft';
                    }
                }
            }
        }
        return '';
    }

    // "Keep both": record that this pair is intentionally separate, then drop the memo so the badge
    // recomputes immediately. Returns the updated dismissed-pair count.
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

    // Check if a specific item is part of any duplicate cluster
    function isDuplicate(type, itemId) {
        return !!duplicateLevelFor(type, itemId);
    }

    // Merge duplicate items into one primary item:
    // 1. Keeps primaryId
    // 2. Moves all group tags from duplicateIds into primaryId
    // 3. Updates primaryId's folder if targetFolder is specified
    // 4. Removes duplicateIds items
    function mergeDuplicates(type, primaryId, duplicateIds = [], targetFolder = '') {
        const isM = type === 'music';
        const stateKey = isM ? 'music' : 'soundboard';
        const items = state()[stateKey] || [];
        const primary = items.find(it => it.id === primaryId);
        if (!primary) return { ok: false, reason: 'Primary item not found' };

        const dupes = items.filter(it => duplicateIds.includes(it.id) && it.id !== primaryId);
        if (!dupes.length) return { ok: false, reason: 'No valid duplicate items selected for merge' };

        // Collect all groups across primary and duplicates
        const getGroups = (id) => (isM ? (state().musicGroupMap?.[id] || []) : (state().soundGroupMap?.[id] || []));
        const allGroups = new Set(getGroups(primaryId));
        dupes.forEach(d => {
            getGroups(d.id).forEach(g => allGroups.add(g));
        });

        // Apply all group tags to primary item
        allGroups.forEach(g => {
            if (isM) window.EveAudioflixState?.toggleMusicGroup?.(primaryId, g, true);
            else window.EveAudioflixState?.toggleSoundGroup?.(primaryId, g, true);
        });

        // Build ONE patch (folder + combined sources) so the item array is rebuilt just once.
        const patch = {};

        // Target folder (optional).
        if (targetFolder !== undefined && targetFolder !== null && targetFolder !== '') {
            const cleanFolder = text(targetFolder);
            patch.folder = cleanFolder;
            patch.card = cleanFolder;
        }

        // Combine playback sources: a file-path track and an online-url track for the same song
        // survive as ONE item carrying BOTH. `url` holds the streamable/online source; `localPath`
        // holds the local file. Whichever side the user kept as primary, the survivor ends up with
        // both whenever the merged pair supplied both.
        const isLocalSource = (value) => {
            const s = normalize(value);
            return !!s && !/^(?:https?:\/\/|spotify:|blob:|data:)/.test(s); // drive letter, file://, ported/relative path
        };
        let onlineUrl = '';
        let localPath = '';
        [primary, ...dupes].forEach((it) => {
            [it.url, it.localPath].forEach((candidate) => {
                const clean = text(candidate);
                if (!clean) return;
                if (isLocalSource(clean)) { if (!localPath) localPath = clean; }
                else if (!onlineUrl) { onlineUrl = clean; }
            });
        });
        const newUrl = onlineUrl || localPath || primary.url;
        if (newUrl && newUrl !== primary.url) patch.url = newUrl;
        if (localPath && localPath !== text(primary.localPath)) patch.localPath = localPath;

        // Manual classifiers survive the merge: a label the user attached to the copy being removed
        // would otherwise be silently lost. Automatic classifiers are derived, so they need nothing.
        const mergedClassifiers = new Set((primary.classifiers || []).map(text).filter(Boolean));
        dupes.forEach((d) => (d.classifiers || []).forEach((c) => { const v = text(c); if (v) mergedClassifiers.add(v); }));
        if (mergedClassifiers.size !== (primary.classifiers || []).length) patch.classifiers = [...mergedClassifiers];

        // Localization entries survive too, keyed by scope so the survivor keeps every place the song
        // physically lives (folder file, group copy, shortcut). The primary wins on a scope clash.
        const byScope = new Map();
        dupes.forEach((d) => (d.localizations || []).forEach((l) => { if (l?.source && l?.path) byScope.set(l.source, l); }));
        (primary.localizations || []).forEach((l) => { if (l?.source && l?.path) byScope.set(l.source, l); });
        if (byScope.size !== (primary.localizations || []).length) patch.localizations = [...byScope.values()];

        if (Object.keys(patch).length) {
            window.EveAudioflixState?.updateItem?.(type, primaryId, patch);
        }

        // Remove the duplicate items
        dupes.forEach(d => {
            window.EveAudioflixState?.removeItem?.(type, d.id);
        });

        memo.music = memo.sound = null;
        return { ok: true, mergedCount: dupes.length, primaryId, dualSource: !!(onlineUrl && localPath) };
    }

    Object.assign(ns, {
        ready: true,
        findDuplicates,
        duplicatesFor,
        duplicateInfoFor,
        duplicateLevelFor,
        isDuplicate,
        mergeDuplicates,
        dismissDuplicate
    });
})();
