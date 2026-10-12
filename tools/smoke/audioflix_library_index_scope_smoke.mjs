import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let titleReads = 0, revision = 1;
const music = Array.from({ length: 25000 }, (_, i) => ({ id: `index-${i}`,
    get title() { titleReads += 1; return `Track ${i}`; }, artist: `Artist ${i % 100}`,
    album: 'Indexed Album', folder: i % 2 ? 'Upper' : 'upper', playlistId: `playlist-${i % 20}`,
    sourceProvider: 'fixture', sourceMediaType: 'track', sourceMediaId: String(i), volume: .2 }));
const state = { music, musicGroups: ['Root', 'Child'], musicGroupParents: { Child: 'Root' },
    musicGroupMap: { 'index-0': ['rOoT'], 'index-1': ['child'], 'index-2': ['Root'] } };
const window = { EveAudioflixState: { ensure: () => state, getRevision: () => revision } };
const context = vm.createContext({ window, console });
for (const file of ['audioflix.state.schema.js', 'audioflix.library.index.js', 'audioflix.groups.tree.js', 'audioflix.nexus.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/features/audioflix', file), 'utf8'), context);
}
const library = window.EveAudioflixLibraryIndex, X = window.EveAudioflixNexus;
const view = library.get(state, 'music');
assert.equal(view.scope('folder', 'Upper').length, 12500);
assert.equal(view.scope('folder', 'upper').length, 12500);
assert.equal(view.scope('playlist', 'playlist-3').length, 1250);
assert.equal(view.scope('artist', 'Artist 7').length, 250);
assert.equal(view.getById('index-24999'), music.at(-1));
assert.equal(view.scope('group', 'ROOT')[0], music[0]);
assert.deepEqual(Array.from(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music), item => item.id), ['index-0', 'index-1', 'index-2']);
const extra = { id: 'foreign', title: 'Foreign', album: 'Only Foreign Album', sourceProvider: 'foreign-provider' };
state.musicGroupMap.foreign = ['CHILD'];
assert.deepEqual(Array.from(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', [extra, music[2], music[0]]), item => item.id), ['foreign', 'index-2', 'index-0']);
const docs = view.docs();
assert.ok(Object.isFrozen(docs) && Object.isFrozen(docs[0]));
titleReads = 0;
for (let i = 0; i < 20; i += 1) { music[0].volume = i / 20; revision += 1; X.search('indexed album', 'music'); }
assert.equal(titleReads, 0, 'Volume/global revisions must not rebuild normalized search text');
assert.equal(X.search('only foreign album', 'music', [extra]).length, 1);
assert.equal(X.search('foreign-provider', 'music', [extra]).length, 1);
const before = view.contentRevision;
const changed = { ...music[0], title: 'Edited', folder: 'Moved' };
music[0] = changed; library.upsert(state, 'music', changed, docs[0].item);
assert.ok(view.contentRevision > before);
assert.equal(view.scope('folder', 'Moved')[0], changed);
assert.equal(view.scope('folder', 'upper').length, 12499);
assert.equal(X.search('edited', 'music', [changed])[0], changed);
// Source replacement without a notification is repaired on the FIRST group query, not the second.
window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music);
const replaced = { ...music[1], title: 'Replacement' }; music[1] = replaced;
assert.equal(window.EveAudioflixGroupTree.itemsForGroup(state, 'music', 'Root', music)[1], replaced);
const id = '4cOdK2wGLETKBW3PvgPWqT';
for (const type of ['track', 'episode']) {
    const item = { id: `typed-${type}`, title: type, sourceProvider: 'spotify',
        sourceMediaType: type, sourceMediaId: id, sourceUri: `spotify:${type}:${id}` };
    music.push(item); library.upsert(state, 'music', item);
}
assert.equal(view.scope('identity', `spotify:track:${id}`)[0].id, 'typed-track');
assert.equal(view.scope('identity', `spotify:episode:${id}`)[0].id, 'typed-episode');
assert.equal(view.scope('identity', `spotify:track:${id.toLowerCase()}`).length, 0);
console.log('AUDIOFLIX_LIBRARY_INDEX_SCOPE_SMOKE_OK size=25000 scopes=true incremental=true searchCached=true typed=true firstQueryRepair=true');
