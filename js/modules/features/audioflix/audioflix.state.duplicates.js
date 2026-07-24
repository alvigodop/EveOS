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

    // Find all duplicate groups for a given item type ('music' or 'sound')
    function findDuplicates(type = 'sound') {
        const key = type === 'music' ? 'music' : 'soundboard';
        const memoKey = type === 'music' ? 'music' : 'sound';
        if (memo[memoKey]) return memo[memoKey];
        const items = state()[key] || [];
        const titleMap = new Map();
        const urlMap = new Map();

        items.forEach((item) => {
            const titleKey = normalize(item.title);
            const urlKey = normalize(item.url);

            if (titleKey) {
                if (!titleMap.has(titleKey)) titleMap.set(titleKey, []);
                titleMap.get(titleKey).push(item);
            }
            if (urlKey && urlKey !== titleKey) {
                if (!urlMap.has(urlKey)) urlMap.set(urlKey, []);
                urlMap.get(urlKey).push(item);
            }
        });

        const duplicateClusters = [];
        const seenItemIds = new Set();

        const addCluster = (clusterItems, reason) => {
            if (clusterItems.length < 2) return;
            const unvisited = clusterItems.filter(it => !seenItemIds.has(it.id));
            if (unvisited.length < 1) return;
            clusterItems.forEach(it => seenItemIds.add(it.id));
            duplicateClusters.push({
                reason,
                items: clusterItems
            });
        };

        titleMap.forEach((cluster) => addCluster(cluster, 'matching title'));
        urlMap.forEach((cluster) => addCluster(cluster, 'matching URL / path'));

        memo[memoKey] = duplicateClusters;
        scheduleMemoClear();
        return duplicateClusters;
    }

    // Get duplicate matches specifically for a single item ID. Pairs the user chose to "keep both"
    // are filtered out so an acknowledged pair stops flagging as a duplicate.
    function duplicatesFor(type, itemId) {
        if (!itemId) return [];
        const clusters = findDuplicates(type);
        const match = clusters.find(c => c.items.some(it => it.id === itemId));
        if (!match) return [];
        const dismissed = dismissedSet();
        return match.items.filter(it => it.id !== itemId && !dismissed.has(pairKey(itemId, it.id)));
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
        isDuplicate,
        mergeDuplicates,
        dismissDuplicate
    });
})();
