// Validated single-item state mutations. Bulk restore/import still uses full schema normalization.
window.EveAudioflixStateMutations = window.EveAudioflixStateMutations || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixStateMutations;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const { ensure, boundedItems, syncRootOrFallback, scheduleSave, text, soundboardLimit, storageKey, recovery } = deps;
        // Ephemeral folder membership only: replaced registries automatically invalidate their cache.
        const folderSets = new WeakMap();
        function registerFolder(state, item) {
            const folder = text(item.folder || item.card, '');
            if (!folder) return;
            const folders = state.musicFolders || (state.musicFolders = []);
            let cache = folderSets.get(folders);
            if (!cache || cache.length !== folders.length) {
                cache = { length: folders.length, values: new Set(folders) };
                folderSets.set(folders, cache);
            }
            if (cache.values.has(folder)) return;
            folders.push(folder);
            cache.values.add(folder);
            cache.length = folders.length;
        }

        function addItem(type, item) {
            const isMusic = type === 'music', kind = isMusic ? 'music' : 'sound';
            // Normalize and reject first: a bad field/source must not touch live state or schedule a save.
            const added = boundedItems([item], kind, soundboardLimit)[0];
            if (!added) return null;
            const state = ensure(), key = isMusic ? 'music' : 'soundboard';
            const items = state[key] || (state[key] = []);
            items.push(added);
            if (!isMusic && items.length > soundboardLimit) items.splice(0, items.length - soundboardLimit);
            recovery()?.applyTrackStructure?.(storageKey, state, added, kind);
            // Recovery may restore the new item's folder; register that final identity, not its raw input.
            if (isMusic) registerFolder(state, added);
            syncRootOrFallback(state);
            scheduleSave(`audioflix-add-${type}`);
            return added;
        }
        return { addItem };
    };
    ns.ready = true;
})();
