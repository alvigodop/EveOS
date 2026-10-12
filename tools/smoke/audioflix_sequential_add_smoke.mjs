#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const feature = name => fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name), 'utf8');
const diagnostics = path.join(ROOT, 'data/runtime/smoke-results/audioflix-sequential-add.json');
const record = { test: 'audioflix-sequential-add', size: 25000, additions: 100, ok: false };

function cacheContract(recovery, storage, blockSlot, parseCounts) {
    const key = 'isolated-cache', slot = `${key}.structure-v2`;
    const journal = () => ({ musicRefs: [
        { id: 'former', localPath: 'C:/Case.wav', folder: 'Path folder', groups: ['Path first'], classifiers: [] },
        { id: 'target', folder: 'Id folder', groups: ['ID later'], classifiers: [] }
    ], scopeBindings: [{ id: 'remap', audioId: 'former', audioType: 'music', scopeType: 'workspace' }] });
    const target = () => ({ music: [{ id: 'target', localPath: 'c:/CASE.wav', url: 'file:///Case.wav' }] });
    storage.set(slot, JSON.stringify(journal()));
    let state = target();
    assert.equal(recovery.applyTrackStructure(key, state, state.music[0], 'music'), true);
    assert.equal(state.music[0].folder, 'Path folder', 'indexed matching preserves earliest OR-match, not ID precedence');
    assert.deepEqual(Array.from(state.musicGroupMap.target), ['Path first']);
    assert.equal(state.scopeBindings[0].audioId, 'target', 'matched old ID still remaps scope binding');
    recovery.readStructure(key).musicRefs[0].groups[0] = 'Poison';
    state = target(); recovery.applyTrackStructure(key, state, state.music[0], 'music');
    assert.deepEqual(Array.from(state.musicGroupMap.target), ['Path first'], 'public mutable read cannot poison private cache');

    const edited = journal(); edited.musicRefs[0].groups = ['Externally edited'];
    storage.set(slot, JSON.stringify(edited));
    state = target(); recovery.applyTrackStructure(key, state, state.music[0], 'music');
    assert.deepEqual(Array.from(state.musicGroupMap.target), ['Externally edited'], 'external rewrite invalidates cache');
    blockSlot(slot); state = target();
    assert.equal(recovery.applyTrackStructure(key, state, state.music[0], 'music'), false, 'storage error must not reuse cached topology');
    blockSlot('');
    storage.delete(slot);
    assert.equal(recovery.applyTrackStructure(key, state, state.music[0], 'music'), false, 'deletion retires cached journal');
    storage.set(slot, '{broken');
    assert.equal(recovery.applyTrackStructure(key, state, state.music[0], 'music'), false, 'damaged rewrite cannot reuse old topology');
    edited.musicRefs[0].groups = ['Recovered valid'];
    storage.set(slot, JSON.stringify(edited));
    recovery.applyTrackStructure(key, state, state.music[0], 'music');
    assert.deepEqual(Array.from(state.musicGroupMap.target), ['Recovered valid'], 'valid rewrite after damage recovers normally');

    storage.set(slot, JSON.stringify({ musicRefs: [
        { id: 'old-source', playlistId: 'playlist', sourceId: 'row', groups: ['Source first'] },
        { id: 'target', groups: ['ID later'] }
    ] }));
    state = { music: [{ id: 'target', playlistId: 'playlist', sourceId: 'row' }] };
    recovery.applyTrackStructure(key, state, state.music[0], 'music');
    assert.deepEqual(Array.from(state.musicGroupMap.target), ['Source first'], 'playlist/source index preserves first matching row');
    storage.set(slot, JSON.stringify({ soundGroupMap: { sound: ['Sound recovery'] } }));
    state = {};
    assert.equal(recovery.applyTrackStructure(key, state, { id: 'sound' }, 'sound'), true);
    assert.deepEqual(Array.from(state.soundGroupMap.sound), ['Sound recovery']);
    let firstRaw;
    for (let i = 0; i < 9; i += 1) {
        const raw = JSON.stringify({ musicRefs: [{ id: `cached-${i}`, folder: `Folder ${i}` }] });
        if (!i) firstRaw = raw;
        storage.set(`cache-${i}.structure-v2`, raw);
        recovery.applyTrackStructure(`cache-${i}`, {}, { id: 'unmatched' }, 'music');
    }
    const priorParses = parseCounts.get(firstRaw);
    recovery.applyTrackStructure('cache-0', {}, { id: 'unmatched' }, 'music');
    assert.equal(parseCounts.get(firstRaw), priorParses + 1, 'alternate pack cache is bounded and evicts oldest journal');
    record.cacheContract = true;
}

async function main() {
    const storage = new Map(), timers = new Map();
    const parseCounts = new Map();
    let timerId = 0, journalRaw = '', journalParses = 0, journalRefReads = 0, blockedSlot = '';
    const config = { audioflix: {
        music: Array.from({ length: record.size }, (_, i) => ({
            id: `base-${i}`, title: `Base ${i}`, url: `https://example.invalid/${i}.mp3`,
            folder: `Folder ${i % 20}`, playlistId: `playlist-${i % 7}`, sourceId: `source-${i}`
        })),
        musicGroups: ['Saved group'], musicGroupMap: { 'base-0': ['Saved group'] },
        musicFolders: ['Empty folder'],
        musicPlaylists: [{ id: 'playlist', url: 'https://example.invalid/playlist', folder: 'Playlist folder' }],
        musicPortConnections: [{ id: 'port', path: 'C:/synthetic', folder: 'Port folder' }],
        scopeBindings: [{ id: 'binding', audioId: 'base-0', audioType: 'music', scopeType: 'workspace' }]
    } };
    const window = {
        eveState: { config }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
        clearTimeout(id) { timers.delete(id); }, addEventListener() {}, dispatchEvent() {},
        saveConfig: async () => true
    };
    const ctx = vm.createContext({ window, console, JSON: {
        stringify: JSON.stringify,
        parse(raw) {
            const parsed = JSON.parse(raw);
            parseCounts.set(raw, (parseCounts.get(raw) || 0) + 1);
            if (journalRaw && raw === journalRaw) {
                journalParses += 1;
                for (const ref of parsed.musicRefs || []) {
                    const id = ref.id;
                    Object.defineProperty(ref, 'id', { enumerable: true, get() { journalRefReads += 1; return id; } });
                }
            }
            return parsed;
        }
    }, localStorage: {
        getItem(key) { if (key === blockedSlot) throw new Error('Storage temporarily unavailable'); return storage.get(key) ?? null; },
        setItem: (key, value) => storage.set(key, String(value))
    }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    for (const name of ['audioflix.state.schema.js', 'audioflix.state.recovery.js', 'audioflix.state.groups.js', 'audioflix.library.index.js', 'audioflix.state.mutations.js']) {
        vm.runInContext(feature(name), ctx, { filename: name });
    }
    const schema = window.EveAudioflixStateSchema, create = schema.create;
    const counts = { calls: 0, items: 0, maxBatch: 0, folders: 0 };
    schema.create = deps => {
        const cleaners = create(deps), bounded = cleaners.boundedItems;
        cleaners.boundedItems = (list, ...args) => {
            const length = Array.isArray(list) ? list.length : 0;
            counts.calls += 1; counts.items += length; counts.maxBatch = Math.max(counts.maxBatch, length);
            return bounded(list, ...args);
        };
        return cleaners;
    };
    const recovery = window.EveAudioflixStateRecovery, folderRegistry = recovery.folderRegistry;
    recovery.folderRegistry = state => { counts.folders += 1; return folderRegistry(state); };
    vm.runInContext(feature('audioflix.state.js'), ctx, { filename: 'audioflix.state.js' });
    const store = window.EveAudioflixState, state = store.ensure(), base = [...state.music], originalMusicArray = state.music;
    recovery.writeStructure('eveAudioflixFallbackState', state);
    journalRaw = storage.get('eveAudioflixFallbackState.structure-v2');
    const membership = state.musicGroupMap, bindings = state.scopeBindings, initialRevision = store.getRevision();
    Object.assign(counts, { calls: 0, items: 0, maxBatch: 0, folders: 0 });
    const started = performance.now();
    for (let i = 0; i < record.additions; i += 1) {
        const added = store.addItem('music', {
            id: `added-${i}`, title: ` Added ${i} `, url: `https://open.spotify.com/track/track${i}`,
            sourceProvider: 'spotify', folder: i % 2 ? ' New folder ' : '', card: 'Fallback card',
            volume: 8, playlistId: ' Connection ', sourceId: `row-${i}`, createdAt: 1700000000000
        });
        assert.equal(added.id, `added-${i}`);
        assert.equal(added.title, `Added ${i}`);
        assert.equal(added.volume, 1);
        assert.equal(added.sourceMediaType, 'track');
        assert.equal(added.sourceMediaId, `track${i}`);
        assert.equal(added.sourcePlayable, true);
        assert.equal(added.spotifyUri, `spotify:track:track${i}`);
        assert.equal(added.playlistId, 'Connection');
    }
    record.counts = { ...counts, journalParses, journalRefReads }; record.additionsMs = performance.now() - started;
    assert.equal(counts.items, record.additions, 'single additions must clean only their new item, not the existing 25k library');
    assert.equal(counts.maxBatch, 1, 'a single add must not invoke full-array schema normalization');
    assert.equal(counts.folders, 0, 'single add must register its own folder without rescanning 25k tracks');
    assert.equal(journalParses, 1, 'unchanged populated structural journal must parse once, not once per addition');
    assert.ok(journalRefReads <= record.size * 3, 'structural refs must be indexed once, not rescanned per addition');
    const warmReads = journalRefReads, warmParses = journalParses, warmStart = performance.now();
    for (let i = 0; i < 100; i += 1) {
        assert.equal(recovery.applyTrackStructure('eveAudioflixFallbackState', state, { id: `unmatched-${i}` }, 'music'), false);
    }
    record.warmJournalLookupsMs = performance.now() - warmStart;
    assert.equal(journalParses, warmParses); assert.equal(journalRefReads, warmReads, 'warm lookups must not walk refs');
    assert.equal(state.music.length, record.size + record.additions, 'no 10k truncation');
    assert.equal(state.music, originalMusicArray, 'single additions must not copy the existing 25k array');
    base.forEach((item, i) => assert.equal(state.music[i], item, `untouched object identity ${i} changed`));
    assert.equal(state.musicGroupMap, membership); assert.equal(state.scopeBindings, bindings);
    assert.deepEqual(Array.from(state.musicGroupMap['base-0']), ['Saved group']);
    for (const folder of ['Empty folder', 'Playlist folder', 'Port folder', 'New folder', 'Fallback card']) {
        assert.ok(state.musicFolders.includes(folder), `folder ${folder} must survive`);
    }
    assert.equal(store.getRevision(), initialRevision + record.additions);
    assert.equal(timers.size, 1, 'all additions coalesce into one pending durable save');

    const beforeInvalid = JSON.stringify(state), revision = store.getRevision(), music = state.music;
    assert.equal(store.addItem('music', { id: 'invalid', title: 'No source' }), null);
    assert.equal(JSON.stringify(state), beforeInvalid, 'invalid add must not change state or durability revision');
    assert.equal(store.getRevision(), revision); assert.equal(state.music, music); assert.equal(timers.size, 1);
    assert.throws(() => store.addItem('music', { get title() { throw new Error('invalid field'); } }), /invalid field/);
    assert.equal(JSON.stringify(state), beforeInvalid, 'normalization error must abort before mutation');

    const episode = store.addItem('music', {
        id: 'episode', sourceProvider: 'spotify', sourceMediaType: 'episode', sourceMediaId: 'episode1',
        sourceUri: 'spotify:episode:episode1', sourcePlayable: true, spotifyTrackId: 'wrong'
    });
    assert.equal(episode.sourceMediaType, 'episode'); assert.equal(episode.sourceMediaId, 'episode1');
    assert.equal(episode.spotifyTrackId, '', 'metadata-only media must not acquire a track-only alias');
    assert.equal(schema.isRetained(episode), true);

    for (let i = 0; i < 241; i += 1) store.addItem('sound', { id: `sound-${i}`, url: `file:///synthetic/${i}.wav` });
    assert.equal(state.soundboard.length, 240, 'intentional soundboard cap remains intact');
    assert.equal(state.soundboard[0].id, 'sound-1'); assert.equal(state.soundboard.at(-1).id, 'sound-240');
    const beforeFlush = counts.items;
    assert.equal((await store.flush('sequential-add')).written, true);
    assert.equal(counts.items, beforeFlush, 'flush must not re-clean the entire library');
    const saved = JSON.parse(storage.get('eveAudioflixFallbackState'));
    assert.equal(saved.music.length, record.size + record.additions + 1);
    assert.equal(saved.music[0].id, 'base-0'); assert.equal(saved.music.at(-1).id, 'episode');
    assert.deepEqual(saved.musicGroupMap['base-0'], ['Saved group']);
    assert.equal(timers.size, 0);
    store.removeItem('music', 'base-0');
    const restored = store.addItem('music', { id: 'base-0', url: 'https://example.invalid/0.mp3' });
    assert.equal(restored.folder, 'Folder 0', 'single add must retain structural-journal folder recovery');
    assert.deepEqual(Array.from(state.musicGroupMap['base-0']), ['Saved group'], 'journal membership still recovers');
    assert.ok(state.scopeBindings.some(binding => binding.audioId === 'base-0'), 'journal scope links still recover');
    assert.equal(state.music.length, record.size + record.additions + 1);
    assert.equal(state.music.at(-1), restored);
    cacheContract(recovery, storage, slot => { blockedSlot = slot; }, parseCounts);
    record.ok = true;
}

try {
    await main();
    fs.mkdirSync(path.dirname(diagnostics), { recursive: true });
    fs.writeFileSync(diagnostics, JSON.stringify(record, null, 2));
    console.log('AUDIOFLIX_SEQUENTIAL_ADD_SMOKE_OK base=25000 additions=100 singletonNormalization=true atomicInvalid=true');
} catch (error) {
    record.error = { message: error.message, stack: error.stack };
    fs.mkdirSync(path.dirname(diagnostics), { recursive: true });
    fs.writeFileSync(diagnostics, JSON.stringify(record, null, 2));
    console.error(`AUDIOFLIX_SEQUENTIAL_ADD_SMOKE_FAIL ${error.message}\nDiagnostics: ${path.relative(ROOT, diagnostics)}`);
    process.exitCode = 1;
}
