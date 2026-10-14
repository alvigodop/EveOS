#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(root, `data/runtime/smoke-results/audioflix-capture-snapshot-${Date.now()}.json`);
const copy = value => JSON.parse(JSON.stringify(value));
const evidence = { ok: false, cases: [], failures: [] };

function fixture() {
    const values = new Map([['wikiEntries', JSON.stringify([{ id: 'knowledge-1' }])]]);
    const timers = new Map();
    const config = { theme: 'dark', reader: { mode: 'fixture' }, audioflix: {
        durabilityRevision: 7, durabilityUpdatedAt: 101,
        music: [{ id: 'track-1', title: 'Captured track', url: 'https://example.invalid/track.mp3',
            volume: .2, folder: 'Album', card: 'Album', localPath: 'C:/fixture/Album/track.mp3',
            localizations: [{ path: 'C:/fixture/Album/track.mp3', source: 'folder:Album' }],
            playlistId: 'playlist-1', sourceId: 'source-1', classifiers: ['Night'], musicPortGroup: 'Disc' }],
        soundboard: [{ id: 'sound-1', title: 'Fixture sound', url: 'https://example.invalid/sound.wav', volume: .3 }],
        ports: [{ id: 'port-1', nickname: 'Sounds', path: 'C:/fixture/sounds' }],
        browserFolders: [{ id: 'grant-1', nickname: 'Music', purpose: 'music' }],
        musicPortConnections: [{ id: 'connection-1', folder: 'Album', path: 'C:/fixture/Album',
            browserFolderId: 'grant-1', browserRootName: 'Music', trackCount: 1 }],
        musicPlaylists: [{ id: 'playlist-1', playlistId: 'upstream-1', provider: 'spotify',
            url: 'https://open.spotify.com/playlist/upstream-1', folder: 'Playlists', title: 'Playlist' }],
        musicFolders: ['Empty folder', 'Album'], musicGroups: ['Mood', 'Disc'],
        musicGroupParents: { Disc: 'Mood' }, musicGroupMap: { 'track-1': ['Disc'] },
        musicClassifiers: ['Night'], soundboardGroups: ['Alerts'], soundGroupMap: { 'sound-1': ['Alerts'] },
        soundGroupParents: {}, localizeScopeDirs: { 'folder:Album': 'C:/fixture/Album' },
        portVolumes: { 'sound-1': .3 }, portHotkeys: { 'sound-1': 'ctrl+1' },
        exposedPortedSounds: { 'sound-1': true },
        scopeBindings: [{ audioType: 'music', audioId: 'track-1', scopeType: 'folder',
            workspaceId: 'fixture', categoryName: 'Card', folderId: 'folder-1' }]
    } };
    const localStorage = { get length() { return values.size; }, key: rank => [...values.keys()][rank],
        getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
    const window = { eveState: { config, links: [{ id: 'link-1', url: 'https://example.invalid/' }],
        bookmarkFolders: { 'folder-1': { title: 'Folder' } }, quickPins: [{ id: 'pin-1' }] },
        setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id), addEventListener() {}, dispatchEvent() {},
        saveConfig: async () => true, EveLibrary: { State: { getAllLibraries: () => ({ fixture: ['entry'] }) },
            ConnectionsAPI: { getAll: () => [{ id: 'library-connection' }] } } };
    const context = vm.createContext({ window, console, localStorage, CustomEvent: class {} });
    for (const name of ['audioflix.state.schema.js', 'audioflix.state.recovery.js',
        'audioflix.state.groups.js', 'audioflix.library.index.js', 'audioflix.state.mutations.js', 'audioflix.state.js']) {
        const file = path.join(root, 'js/modules/features/audioflix', name);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    }
    const state = window.EveAudioflixState.ensure();
    const file = path.join(root, 'js/modules/features/data-state/data-state.capture.clone.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    const capture = window.EveDataStore.CaptureModules.createCaptureCloneHelpers();
    const realSnapshot = window.EveAudioflixState.durableSnapshot;
    const snapshots = [];
    window.EveAudioflixState.durableSnapshot = input => {
        const snapshot = realSnapshot(input); snapshots.push(snapshot); return snapshot;
    };
    return { window, state, config, capture, snapshots, realSnapshot };
}

function references(value, found = new Set()) {
    if (!value || typeof value !== 'object' || found.has(value)) return found;
    found.add(value);
    for (const child of Object.values(value)) references(child, found);
    return found;
}
function detached(left, right, label) {
    const rightRefs = references(right);
    for (const value of references(left)) assert.equal(rightRefs.has(value), false, label);
}
function test(id, fn) {
    try { fn(); evidence.cases.push(id); }
    catch (error) { evidence.failures.push({ id, message: error.message, stack: error.stack }); }
}

test('one-full-provider-call-per-unified-capture', () => {
    const f = fixture(), result = f.capture.captureState();
    assert.equal(f.snapshots.length, 1, 'captureState must make exactly one detached AudioFlix snapshot');
    assert.equal(result.audioflix, f.snapshots[0], 'Full backup keeps the captured detached object without another clone');
});

test('structure-derived-from-same-capture-not-next-live-state', () => {
    const f = fixture();
    let calls = 0;
    f.window.EveAudioflixState.durableSnapshot = input => {
        const snapshot = f.realSnapshot(input); calls += 1;
        input.durabilityRevision += 1; input.music[0].title = `Later provider call ${calls}`;
        return snapshot;
    };
    const result = f.capture.captureState();
    assert.equal(result.audioflixStructure.durabilityRevision, result.audioflix.durabilityRevision,
        'Structural and full backup revisions must describe the same detached capture');
    assert.equal(result.audioflixStructure.musicRefs[0].title, result.audioflix.music[0].title);
    assert.equal(calls, 1);
});

test('real-held-gain-projection-and-release-remain-canonical', () => {
    const f = fixture(), S = f.window.EveAudioflixState;
    const musicGesture = {}, portGesture = {};
    assert.equal(S.previewItemVolume('music', 'track-1', .8, musicGesture), true);
    assert.equal(S.previewPortVolume('sound-1', .9, .3, portGesture), true);
    const held = f.capture.captureState();
    assert.equal(held.audioflix.music[0].volume, .2);
    assert.equal(held.audioflix.portVolumes['sound-1'], .3);
    assert.equal(held.audioflixStructure.portVolumes['sound-1'], .3);
    assert.equal(f.state.music[0].volume, .8); assert.equal(f.state.portVolumes['sound-1'], .9);
    assert.equal(S.commitItemVolume('music', 'track-1', .8, musicGesture), true);
    assert.equal(S.commitPortVolume('sound-1', .9, portGesture), true);
    const released = f.capture.captureState();
    assert.equal(released.audioflix.music[0].volume, .8);
    assert.equal(released.audioflixStructure.portVolumes['sound-1'], .9);
    assert.equal(held.audioflix.music[0].volume, .2, 'Later commits cannot rewrite an earlier capture');
});

test('detached-full-and-journal-preserve-all-content-and-topology', () => {
    const f = fixture(), before = copy(f.state), result = f.capture.captureState();
    assert.deepEqual(copy(result.audioflix), before, 'No full-state fields may be reduced');
    detached(result.audioflix, f.state, 'Full capture cannot alias live records');
    detached(result.audioflixStructure, f.state, 'Structural journal cannot alias live records');
    detached(result.audioflixStructure, result.audioflix, 'The journal owns its nested structural records');
    const structure = result.audioflixStructure, ref = structure.musicRefs[0];
    assert.equal(structure.schemaVersion, 3);
    assert.equal(ref.localPath, before.music[0].localPath);
    assert.equal(ref.playlistId, 'playlist-1'); assert.equal(ref.sourceId, 'source-1');
    assert.equal(ref.portConnectionId, 'connection-1'); assert.equal(ref.musicPortGroup, 'Disc');
    assert.deepEqual(copy(ref.groups), ['Disc']); assert.deepEqual(copy(ref.classifiers), ['Night']);
    for (const field of ['url', 'data', 'audio', 'audioBytes', 'blob', 'localizations']) assert.equal(field in ref, false);
    assert.equal('music' in structure, false); assert.equal('soundboard' in structure, false);
    for (const field of ['ports', 'browserFolders', 'musicPortConnections', 'musicPlaylists',
        'musicGroupParents', 'soundGroupParents', 'scopeBindings', 'localizeScopeDirs',
        'portVolumes', 'portHotkeys', 'exposedPortedSounds', 'soundGroupMap']) {
        assert.deepEqual(copy(structure[field]), before[field], `Structural field ${field} survives unchanged`);
    }
    assert.ok(structure.musicFolders.includes('Empty folder'));
    result.audioflix.music[0].localizations[0].path = 'changed-full';
    structure.musicPortConnections[0].folder = 'changed-structure'; ref.groups.push('changed-group');
    assert.deepEqual(copy(f.state), before);
});

test('same-array-in-place-edits-are-fresh-without-caches', () => {
    const f = fixture(), rows = f.state.music, first = f.capture.captureState();
    rows[0].title = 'Edited in place'; rows[0].url = 'https://example.invalid/edited.mp3';
    rows[0].classifiers.push('Fresh'); f.state.musicGroupMap['track-1'].push('Mood');
    f.state.musicPortConnections[0].browserRootName = 'Changed source'; f.state.durabilityRevision += 1;
    const next = f.capture.captureState();
    assert.equal(f.state.music, rows);
    assert.equal(next.audioflix.music[0].title, 'Edited in place');
    assert.equal(next.audioflix.music[0].url, 'https://example.invalid/edited.mp3');
    assert.equal(next.audioflixStructure.musicRefs[0].title, 'Edited in place');
    assert.ok(next.audioflixStructure.musicRefs[0].classifiers.includes('Fresh'));
    assert.ok(next.audioflixStructure.musicRefs[0].groups.includes('Mood'));
    assert.equal(next.audioflixStructure.musicPortConnections[0].browserRootName, 'Changed source');
    assert.equal(next.audioflixStructure.durabilityRevision, next.audioflix.durabilityRevision);
    assert.equal(first.audioflix.music[0].title, 'Captured track');
    assert.equal(first.audioflixStructure.musicRefs[0].title, 'Captured track');
});

test('standalone-structure-helper-and-missing-module-defaults', () => {
    const f = fixture(), structure = f.capture.cloneAudioflixStructure();
    assert.equal(f.snapshots.length, 1, 'Standalone helper still takes its own full capture');
    assert.equal(structure.musicRefs[0].id, 'track-1'); detached(structure, f.state, 'Standalone stays detached');
    f.window.EveAudioflixStateRecovery = undefined;
    assert.equal(f.capture.cloneAudioflixStructure(), null);
    assert.equal(f.capture.captureState().audioflixStructure, null);
    assert.ok(f.capture.captureState().audioflix.music.length);
    delete f.config.audioflix;
    assert.equal(f.capture.cloneAudioflix(), null); assert.equal(f.capture.cloneAudioflixStructure(), null);
    assert.equal(f.capture.captureState().audioflix, null);
});

test('existing-projection-failure-null-and-structural-error-policy', () => {
    const f = fixture(), projectionError = Error('projection fixture failure');
    f.window.EveAudioflixState.durableSnapshot = () => { throw projectionError; };
    assert.equal(f.capture.cloneAudioflix(), null); assert.equal(f.capture.cloneAudioflixStructure(), null);
    const result = f.capture.captureState();
    assert.equal(result.audioflix, null); assert.equal(result.audioflixStructure, null);
    f.window.EveAudioflixState.durableSnapshot = f.realSnapshot;
    const structureError = Error('structural fixture failure');
    f.window.EveAudioflixStateRecovery.captureStructure = () => { throw structureError; };
    assert.throws(() => f.capture.captureState(), error => error === structureError);
    assert.throws(() => f.capture.cloneAudioflixStructure(), error => error === structureError);
});

test('json-fallback-stays-detached-and-failure-remains-null', () => {
    const f = fixture(); f.window.EveAudioflixState = undefined;
    const result = f.capture.captureState();
    assert.deepEqual(copy(result.audioflix), copy(f.state)); detached(result.audioflix, f.state, 'Fallback stays detached');
    assert.equal(result.audioflixStructure.musicRefs[0].title, result.audioflix.music[0].title);
    f.state.cycle = f.state;
    assert.equal(f.capture.cloneAudioflix(), null); assert.equal(f.capture.captureState().audioflixStructure, null);
});

test('json-backup-shape-and-structural-consumer-compatibility', () => {
    const f = fixture(), result = copy(f.capture.captureState());
    assert.deepEqual(Object.keys(result), ['metadata', 'bookmarks', 'library', 'knowledge', 'audioflix', 'audioflixStructure']);
    assert.equal(result.metadata.version, 1); assert.equal(result.metadata.generator, 'EveOS Unified Backup');
    assert.equal(Number.isFinite(Date.parse(result.metadata.date)), true);
    assert.equal('audioflix' in result.bookmarks.config, false);
    assert.equal(result.bookmarks.config.theme, 'dark'); assert.equal(result.bookmarks.links[0].id, 'link-1');
    assert.equal(result.bookmarks.folders['folder-1'].title, 'Folder'); assert.equal(result.bookmarks.pins[0].id, 'pin-1');
    assert.deepEqual(result.library.categories, { fixture: ['entry'] });
    assert.equal(result.library.connections[0].id, 'library-connection');
    assert.equal(result.knowledge.scopedStorage.__global__.wikiEntries[0].id, 'knowledge-1');
    const restored = { music: [{ id: 'track-1', localPath: result.audioflix.music[0].localPath }], musicGroupMap: {} };
    f.window.EveAudioflixStateRecovery.applyStructureSnapshot(restored, result.audioflixStructure);
    assert.equal(restored.music.length, 1, 'Structure cannot manufacture copies of songs');
    assert.ok(restored.musicGroupMap['track-1'].includes('Disc'));
    assert.ok(restored.music[0].classifiers.includes('Night'));
    assert.equal(restored.musicPortConnections[0].browserFolderId, 'grant-1');
    assert.equal(restored.musicPlaylists[0].playlistId, 'upstream-1');
});

evidence.ok = evidence.failures.length === 0;
fs.mkdirSync(path.dirname(artifact), { recursive: true });
fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
const total = evidence.cases.length + evidence.failures.length;
if (evidence.ok) console.log(`AUDIOFLIX_CAPTURE_SNAPSHOT_SMOKE_OK ${total}/${total} captureOnce=true committedGain=true detached=true topology=true`);
else {
    console.error(`AUDIOFLIX_CAPTURE_SNAPSHOT_SMOKE_FAIL ${evidence.cases.length}/${total}`);
    for (const failure of evidence.failures) console.error(`${failure.id}: ${failure.message.split('\n')[0]}`);
    console.error(`diagnostics=${path.relative(root, artifact)}`); process.exitCode = 1;
}
