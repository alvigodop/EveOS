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

    function dismissedSet() {
        return new Set(state().dupDismissedPairs || []);
    }

    // findDuplicates is called once per rendered card (via isDuplicate), and each call re-derives
    // the whole item list. ensure() re-normalizes state on every read, so it hands back a FRESH
    // array each time — an identity cache would never hit. Instead cache per type for the current
    // synchronous render pass and drop it on the next microtask: every card in one pass shares a
    // single computation, while the next render recomputes against fresh state. Mutations
    // (merge/dismiss) also clear it explicitly so a change is never shown stale.
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
        return clean && !/^https?:\/\//.test(clean) ? clean.replace(/\/+$/, '') : '';
    }

    function sourceIdentity(item) {
        const provider = normalize(item?.sourceProvider);
        const sourceId = normalize(item?.sourceId);
        return provider && sourceId ? `${provider}:${sourceId}` : '';
    }

    function pairClassification(a, b) {
        const reasons = [];
        const urlA = /^https?:\/\//i.test(text(a?.url)) ? normalize(a.url).replace(/\/$/, '') : '';
        const urlB = /^https?:\/\//i.test(text(b?.url)) ? normalize(b.url).replace(/\/$/, '') : '';
        const pathA = normalizedPath(a?.localPath) || normalizedPath(a?.url);
        const pathB = normalizedPath(b?.localPath) || normalizedPath(b?.url);
        const sourceA = sourceIdentity(a);
        const sourceB = sourceIdentity(b);

        if (urlA && urlA === urlB) reasons.push('matching URL');
        if (pathA && pathA === pathB) reasons.push('matching local path');
        if (sourceA && sourceA === sourceB) reasons.push('matching provider identity');
        if (reasons.length) return { level: 'hard', reasons };

        const titleA = normalize(stripMediaExt(a?.title));
        const titleB = normalize(stripMediaExt(b?.title));
        const baseA = fileBaseName(a?.url) || fileBaseName(a?.localPath);
        const baseB = fileBaseName(b?.url) || fileBaseName(b?.localPath);
        if (titleA && titleA === titleB) {
            const durationA = Number(a?.duration || 0);
            const durationB = Number(b?.duration || 0);
            reasons.push(durationA > 0 && durationB > 0 && Math.abs(durationA - durationB) > 1
                ? 'matching title, different duration'
                : 'matching title');
        }
        if (baseA && baseA === baseB) reasons.push('same file name');
        return reasons.length ? { level: 'soft', reasons } : null;
    }

    // Find all duplicate pairs for a given item type ('music' or 'sound'). A hard match has shared
    // source identity; title/file-name similarity alone is intentionally soft so edits, remixes and
    // clipped versions are never presented as certain destructive duplicates.
    function findDuplicates(type = 'sound') {
        const key = type === 'music' ? 'music' : 'soundboard';
        const memoKey = type === 'music' ? 'music' : 'sound';
        if (memo[memoKey]) return memo[memoKey];
        const items = state()[key] || [];
        const pairs = [];
        for (let left = 0; left < items.length; left += 1) {
            for (let right = left + 1; right < items.length; right += 1) {
                const classification = pairClassification(items[left], items[right]);
                if (!classification) continue;
                pairs.push({
                    level: classification.level,
                    reason: classification.reasons.join(' + '),
                    reasons: classification.reasons,
                    items: [items[left], items[right]]
                });
            }
        }

        memo[memoKey] = pairs.sort((a, b) => (a.level === b.level ? 0 : (a.level === 'hard' ? -1 : 1)));
        scheduleMemoClear();
        return memo[memoKey];
    }

    // Get duplicate matches specifically for a single item ID. Pairs the user chose to "keep both"
    // are filtered out so an acknowledged pair stops flagging as a duplicate.
    function duplicatesFor(type, itemId) {
        if (!itemId) return [];
        const clusters = findDuplicates(type);
        const dismissed = dismissedSet();
        const seen = new Set();
        return clusters.flatMap((cluster) => {
            if (!cluster.items.some((entry) => entry.id === itemId)) return [];
            return cluster.items.filter((entry) => entry.id !== itemId);
        })
            .filter((it) => {
                if (it.id === itemId || seen.has(it.id) || dismissed.has(pairKey(itemId, it.id))) return false;
                seen.add(it.id);
                return true;
            });
    }

    function duplicateInfoFor(type, itemId) {
        if (!itemId) return [];
        const dismissed = dismissedSet();
        return findDuplicates(type).flatMap((pair) => {
            if (!pair.items.some((item) => item.id === itemId)) return [];
            const match = pair.items.find((item) => item.id !== itemId);
            if (!match || dismissed.has(pairKey(itemId, match.id))) return [];
            return [{ item: match, level: pair.level, reason: pair.reason, reasons: pair.reasons }];
        });
    }

    function duplicateLevelFor(type, itemId) {
        const info = duplicateInfoFor(type, itemId);
        return info.some((entry) => entry.level === 'hard') ? 'hard' : (info.length ? 'soft' : '');
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
        return duplicatesFor(type, itemId).length > 0;
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
            return !!s && !/^https?:\/\//.test(s); // drive letter, file://, ported/relative path
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
