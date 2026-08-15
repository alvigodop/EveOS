/**
 * Guards the scaled Nexus Audio Link organizer:
 * - 1,500 tracks survive normalization.
 * - repeated ensure() calls retain the cached state object.
 * - group/classifier/folder changes use one store revision per bulk operation.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const run = (ctx, rel) => vm.runInNewContext(
    fs.readFileSync(path.join(root, rel), 'utf8'),
    ctx,
    { filename: rel }
);
const assert = (condition, message) => {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
};

function makeContext(seed) {
    const timers = new Map();
    let timerId = 0;
    const config = { audioflix: seed };
    const window = {
        eveState: { config },
        addEventListener() {},
        dispatchEvent() {},
        setTimeout(callback) {
            timerId += 1;
            timers.set(timerId, callback);
            return timerId;
        },
        clearTimeout(id) {
            timers.delete(id);
        }
    };
    window.window = window;
    return {
        console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map,
        config, window,
        localStorage: { getItem() { return null; }, setItem() {} },
        CustomEvent: function CustomEvent() {}
    };
}

(function main() {
    const tracks = Array.from({ length: 1500 }, (_, index) => ({
        id: 'track-' + index,
        title: 'Track ' + index,
        artist: index % 2 ? 'Night Artist' : 'Day Artist',
        url: 'https://audio.example/' + index
    }));
    const ctx = makeContext({ music: tracks });
    run(ctx, 'js/modules/features/audioflix/audioflix.state.schema.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.state.groups.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.state.recovery.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.state.js');
    run(ctx, 'js/modules/features/audioflix/audioflix.bulk.js');

    const store = ctx.window.EveAudioflixState;
    const bulk = ctx.window.EveAudioflixBulk;
    const first = store.ensure();
    assert(first.music.length === 1500, 'large library was truncated');
    assert(store.ensure() === first, 'ensure() did not reuse the normalized state');

    const allIds = tracks.map((track) => track.id);
    const revisionBefore = store.getRevision();
    const added = bulk.applyMusicChanges(allIds, {
        addGroups: ['Sleep'],
        addClassifiers: ['Night'],
        folderAction: 'set',
        folder: 'Bedtime'
    });
    const afterAdd = store.ensure();
    assert(added.ok && added.changed === 1500, 'bulk add did not update every selected track');
    assert(store.getRevision() === revisionBefore + 1, 'bulk add performed more than one state revision');
    assert(afterAdd.musicGroups.includes('Sleep'), 'bulk group was not registered');
    assert(afterAdd.musicClassifiers.includes('Night'), 'bulk classifier was not registered');
    const incomplete = afterAdd.music.find((track) => !(
        track.folder === 'Bedtime'
        && track.card === 'Bedtime'
        && track.classifiers.includes('Night')
        && afterAdd.musicGroupMap[track.id].includes('Sleep')
        && Number(track.updatedAt) > 0
    ));
    assert(!incomplete, 'bulk organization was incomplete: ' + JSON.stringify(incomplete));

    const subset = allIds.slice(0, 500);
    const removed = bulk.applyMusicChanges(subset, {
        removeGroups: ['sleep'],
        removeClassifiers: ['night'],
        folderAction: 'clear'
    });
    const afterRemove = store.ensure();
    assert(removed.ok && removed.changed === 500, 'bulk remove did not update the selected subset');
    assert(store.getRevision() === revisionBefore + 2, 'bulk remove performed more than one state revision');
    assert(afterRemove.music.slice(0, 500).every((track) => (
        !track.folder
        && !track.card
        && !track.classifiers.length
        && !afterRemove.musicGroupMap[track.id]
    )), 'bulk remove left organization residue');
    assert(afterRemove.music.slice(500).every((track) => (
        track.folder === 'Bedtime'
        && track.classifiers.includes('Night')
        && afterRemove.musicGroupMap[track.id].includes('Sleep')
    )), 'bulk remove changed unselected tracks');

    console.log('AUDIOFLIX_BULK_MANAGER_SMOKE_OK');
})();
