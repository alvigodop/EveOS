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

    // Find all duplicate groups for a given item type ('music' or 'sound')
    function findDuplicates(type = 'sound') {
        const key = type === 'music' ? 'music' : 'soundboard';
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

        return duplicateClusters;
    }

    // Get duplicate matches specifically for a single item ID
    function duplicatesFor(type, itemId) {
        if (!itemId) return [];
        const clusters = findDuplicates(type);
        const match = clusters.find(c => c.items.some(it => it.id === itemId));
        if (!match) return [];
        return match.items.filter(it => it.id !== itemId);
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

        // Update target folder if provided
        if (targetFolder !== undefined && targetFolder !== null && targetFolder !== '') {
            const cleanFolder = text(targetFolder);
            window.EveAudioflixState?.updateItem?.(type, primaryId, {
                folder: cleanFolder,
                card: cleanFolder
            });
        }

        // Remove the duplicate items
        dupes.forEach(d => {
            window.EveAudioflixState?.removeItem?.(type, d.id);
        });

        return { ok: true, mergedCount: dupes.length, primaryId };
    }

    Object.assign(ns, {
        ready: true,
        findDuplicates,
        duplicatesFor,
        isDuplicate,
        mergeDuplicates
    });
})();
