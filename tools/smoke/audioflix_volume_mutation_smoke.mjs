#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-volume-mutation.json');
const evidence = { ok: false, cases: [] };
let current = 'startup';
function fixture(size) {
    const timers = new Map(), storage = new Map(), handlers = new Map();
    let timerCalls = 0, idReads = 0;
    const window = { eveState: { config: { audioflix: { music: Array.from({ length: size }, (_, i) => ({
        id: String(i), title: `Track ${i}`, url: `https://example.invalid/${i}.mp3`, volume: .2
    })) } } }, setTimeout(fn) { timers.set(++timerCalls, fn); return timerCalls; },
    clearTimeout(id) { timers.delete(id); }, addEventListener(event, fn) { handlers.set(event, fn); },
    removeEventListener(event, fn) { if (handlers.get(event) === fn) handlers.delete(event); }, dispatchEvent() {}, saveConfig: async () => true };
    const ctx = vm.createContext({ window, console, localStorage: {
        getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value))
    }, CustomEvent: class {} });
    const files = ['audioflix.state.schema.js', 'audioflix.state.recovery.js', 'audioflix.state.groups.js',
        'audioflix.library.index.js', 'audioflix.state.mutations.js', 'audioflix.state.js'];
    for (const file of files) {
        const target = path.join(ROOT, 'js/modules/features/audioflix', file);
        vm.runInContext(fs.readFileSync(target, 'utf8'), ctx, { filename: file });
    }
    const S = window.EveAudioflixState, state = S.ensure();
    for (const item of state.music) {
        const id = item.id;
        Object.defineProperty(item, 'id', { enumerable: true, configurable: true, get() { idReads += 1; return id; } });
    }
    const capturePath = path.join(ROOT, 'js/modules/features/data-state/data-state.capture.clone.js');
    vm.runInContext(fs.readFileSync(capturePath, 'utf8'), ctx, { filename: capturePath });
    const capture = window.EveDataStore.CaptureModules.createCaptureCloneHelpers();
    return { S, state, window, timers, storage, handlers, capture, ctx, reads: () => idReads, calls: () => timerCalls, resetReads: () => { idReads = 0; } };
}
async function test(id, fn) { current = id; await fn(); evidence.cases.push(id); }

try {
    await test('legacy-durable-supersedes-bound-gesture', () => {
        const f = fixture(1), gesture = {}, portGesture = {};
        f.S.previewItemVolume('music', '0', .8, gesture);
        f.S.setItemVolume('music', '0', .6);
        const calls = f.calls();
        assert.equal(f.S.commitItemVolume('music', '0', .8, gesture), false, 'old UI release cannot replace newer durable intent');
        assert.equal(f.state.music[0].volume, .6); assert.equal(f.calls(), calls);
        f.S.previewPortVolume('external', .8, .2, portGesture);
        f.S.setItemVolume('sound', 'external', .6);
        assert.equal(f.S.commitPortVolume('external', .8, portGesture), false);
        assert.equal(f.state.portVolumes.external, .6);
    });
    await test('shared-gesture-latest-wins-either-release-order', () => {
        for (const newerFirst of [false, true]) {
            const f = fixture(1), older = {}, newer = {}, before = f.calls();
            f.S.previewItemVolume('music', '0', .3, older);
            f.S.previewItemVolume('music', '0', .6, newer);
            assert.equal(f.S.commitItemVolume('music', '0', newerFirst ? .6 : .3, newerFirst ? newer : older), true);
            assert.equal(f.state.music[0].volume, .6, 'pending latest is authoritative even when older control releases first');
            assert.equal(f.S.commitItemVolume('music', '0', newerFirst ? .3 : .6, newerFirst ? older : newer), !newerFirst);
            assert.equal(f.state.music[0].volume, .6); assert.equal(f.calls(), before + 1);
            assert.equal(f.S.previewItemVolume('music', '0', .9, older), false, 'retired token cannot start another gesture');
            const fresh = {};
            assert.equal(f.S.previewItemVolume('music', '0', .7, fresh), true);
            assert.equal(f.S.commitItemVolume('music', '0', .3, older), false, 'old token cannot retire a newer active generation');
            assert.equal(f.S.commitItemVolume('music', '0', .7, fresh), true);
            assert.equal(f.state.music[0].volume, .7);
        }
    });
    await test('real-helper-forwards-canonical-and-ported-gesture-tokens', () => {
        const f = fixture(1);
        function eventRoot() {
            const listeners = new Map();
            return { addEventListener(name, fn) { listeners.set(name, fn); },
                removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
                emit(name, target) { listeners.get(name)?.({ target }); } };
        }
        const document = eventRoot();
        Object.assign(f.ctx, { document, AbortController, setTimeout: fn => f.window.setTimeout(fn), clearTimeout: id => f.window.clearTimeout(id) });
        const source = path.join(ROOT, 'js/modules/features/audioflix/audioflix.ui.volume-gesture.js');
        vm.runInContext(fs.readFileSync(source, 'utf8'), f.ctx, { filename: source });
        const helper = f.window.EveAudioflixVolumeGesture;
        for (const ported of [false, true]) {
            const id = ported ? 'external' : '0', olderRoot = eventRoot(), newerRoot = eventRoot();
            const item = () => ({ id, type: ported ? 'sound' : 'music', ported, volume: .2 });
            const older = helper.create(olderRoot, 'input', item, () => {});
            const newer = helper.create(newerRoot, 'input', item, () => {});
            const a = { value: '.3', matches: () => true }, b = { value: '.6', matches: () => true };
            const before = f.calls();
            olderRoot.emit('pointerdown', a); assert.equal(older.input(a), true);
            newerRoot.emit('pointerdown', b); assert.equal(newer.input(b), true);
            newerRoot.emit('change', b); document.emit('pointerup');
            assert.equal(ported ? f.state.portVolumes.external : f.state.music[0].volume, .6);
            assert.equal(f.calls(), before + 1, 'real helper token forwarding fences older sibling release');
            older.destroy(); newer.destroy();
        }
        assert.equal(helper.diagnostics().bindings, 0);
    });
    await test('tokenized-pagehide-finalization-is-idempotent', () => {
        const f = fixture(1), canonical = {}, port = {}, unchangedPort = {};
        f.S.previewItemVolume('music', '0', .8, canonical);
        f.S.previewPortVolume('external', .7, .2, port);
        f.S.previewPortVolume('unchanged', .2, .2, unchangedPort);
        f.handlers.get('pagehide')();
        const before = f.calls();
        assert.equal(f.S.commitItemVolume('music', '0', .8, canonical), true);
        assert.equal(f.S.commitPortVolume('external', .7, port), true);
        assert.equal(f.S.commitPortVolume('unchanged', .2, unchangedPort), true);
        assert.equal(Object.hasOwn(f.state.portVolumes, 'unchanged'), false);
        assert.equal(f.calls(), before); assert.equal(f.timers.size, 0);
    });
    await test('held-preview-is-not-durable', async () => {
        const f = fixture(3), row = f.state.music[1];
        f.S.previewItemVolume('music', '1', .8);
        f.S.updateItem('music', '1', { title: 'Durable metadata' });
        await f.S.flush('unrelated-metadata');
        const mirror = JSON.parse(f.storage.get('eveAudioflixFallbackState'));
        assert.equal(mirror.music[1].volume, .2, 'unrelated autosave must not commit the held transient gain');
        assert.equal(mirror.music[1].title, 'Durable metadata');
        assert.equal(row.volume, .8, 'serialization must not swap live preview gain');
        assert.equal(f.S.durableSnapshot().music[1].volume, .2);
        assert.equal(f.capture.cloneAudioflix().music[1].volume, .2, 'unified backup capture must use durable state');
        const before = f.calls();
        assert.equal(f.S.commitItemVolume('music', '1', .8), true);
        assert.equal(f.calls(), before + 1);
        await f.S.flush('final-gain');
        assert.equal(JSON.parse(f.storage.get('eveAudioflixFallbackState')).music[1].volume, .8);
    });
    await test('snapshot-does-not-swap-or-expose-live-state', async () => {
        const f = fixture(3), row = f.state.music[1], root = f.window.eveState.config;
        f.S.previewItemVolume('music', '1', .8);
        const baseline = f.S.durableSnapshot();
        baseline.music[1].title = 'foreign edit'; baseline.portVolumes.other = .1;
        assert.notEqual(row.title, 'foreign edit'); assert.equal(f.state.portVolumes.other, undefined);
        let release, captured;
        f.window.saveConfig = () => {
            captured = f.capture.cloneAudioflix();
            assert.equal(root.audioflix, f.state); assert.equal(row.volume, .8);
            return new Promise(resolve => { release = resolve; });
        };
        const flushing = f.S.flush('async-held-drag');
        assert.equal(captured.music[1].volume, .2);
        f.S.previewItemVolume('music', '1', .9);
        assert.equal(captured.music[1].volume, .2, 'in-flight captured snapshot is immutable from later ticks');
        assert.equal(root.audioflix, f.state); assert.equal(row.volume, .9);
        release(true); await flushing;
        const foreign = { music: [{ ...row, volume: .4 }] };
        assert.equal(f.S.durableSnapshot(foreign).music[0].volume, .4, 'foreign capture is not masked by same-ID gesture');
    });
    await test('ported-durable-originals-and-noop', async () => {
        const f = fixture(1);
        f.S.setItemVolume('sound', 'present', .4); await f.S.flush('ported-baseline');
        f.S.previewPortVolume('absent', .8, .2); f.S.previewPortVolume('present', .9, .1);
        f.S.updateItem('music', '0', { title: 'Unrelated' }); await f.S.flush('held-ports');
        const mirror = JSON.parse(f.storage.get('eveAudioflixFallbackState'));
        assert.equal(Object.hasOwn(mirror.portVolumes, 'absent'), false);
        assert.equal(mirror.portVolumes.present, .4);
        assert.equal(f.state.portVolumes.absent, .8); assert.equal(f.state.portVolumes.present, .9);
        const before = f.calls();
        f.S.previewPortVolume('absent', .2, .2); f.S.commitPortVolume('absent', .2);
        f.S.previewPortVolume('present', .4, .1); f.S.commitPortVolume('present', .4);
        assert.equal(f.calls(), before, 'returned-to-original ports are not durable changes');
        assert.equal(Object.hasOwn(f.state.portVolumes, 'absent'), false); assert.equal(f.state.portVolumes.present, .4);
        f.S.previewItemVolume('music', '0', .8); f.S.previewItemVolume('music', '0', .2);
        assert.equal(f.S.durableSnapshot().music[0].volume, .2);
        assert.equal(f.S.commitItemVolume('music', '0', .2), true); assert.equal(f.calls(), before);
        f.S.previewPortVolume('present', .8, .4);
        f.S.setItemVolume('sound', 'present', .6);
        assert.equal(f.S.durableSnapshot().portVolumes.present, .6, 'legacy durable intent retires explicit port preview');
    });
    await test('snapshot-replacement-deletion-isolation', () => {
        const f = fixture(3);
        f.S.previewItemVolume('music', '1', .8);
        f.state.music[1] = { ...f.state.music[1], volume: .3 };
        assert.equal(f.S.durableSnapshot().music[1].volume, .3, 'projection must not restore baseline onto same-ID replacement');
        assert.equal(f.S.commitItemVolume('music', '1', undefined), false);
        f.S.previewItemVolume('music', '1', .7); f.S.removeItem('music', '1');
        assert.equal(f.S.durableSnapshot().music.some(row => row.id === '1'), false);
        assert.equal(f.S.commitItemVolume('music', '1', undefined), false);
        f.S.previewPortVolume('port', .9, .2);
        f.S.update({ portVolumes: { port: .5 } }, 'replace-port-map');
        assert.equal(f.S.durableSnapshot().portVolumes.port, .5);
        assert.equal(f.S.commitPortVolume('port', undefined), false);
        f.S.previewItemVolume('music', '0', .9);
        f.S.updateItem('music', '0', { volume: .4 });
        assert.equal(f.S.durableSnapshot().music[0].volume, .4, 'explicit metadata gain edit supersedes preview baseline');
        assert.equal(f.S.commitItemVolume('music', '0', undefined), false);
        f.S.previewItemVolume('music', '2', .8);
        const next = f.S.replaceState({ music: [{ id: '2', url: 'https://example.invalid/new', volume: .6 }] }, 'replacement');
        assert.equal(f.S.durableSnapshot().music[0].volume, .6); assert.equal(next.music[0].volume, .6);
    });
    await test('pagehide-finalizes-before-mirror-and-late-ui-commit', async () => {
        const f = fixture(3), revision = f.S.getRevision();
        f.S.previewItemVolume('music', '1', .8);
        f.S.previewPortVolume('port', .7, .2);
        let captured;
        f.window.saveConfig = async () => { captured = f.capture.cloneAudioflix(); return true; };
        f.handlers.get('pagehide')();
        const mirror = JSON.parse(f.storage.get('eveAudioflixFallbackState'));
        assert.equal(mirror.music[1].volume, .8); assert.equal(mirror.portVolumes.port, .7);
        assert.equal(captured.music[1].volume, .8); assert.equal(captured.portVolumes.port, .7);
        const before = f.calls();
        assert.equal(f.S.commitItemVolume('music', '1', .8), true); assert.equal(f.S.commitPortVolume('port', .7), true);
        assert.equal(f.calls(), before, 'later UI teardown commit is idempotent'); assert.equal(f.timers.size, 0);
        assert.equal(f.S.getRevision(), revision + 2);
        await Promise.resolve();
        f.S.previewItemVolume('music', '1', .9);
        f.state.music[1] = { ...f.state.music[1], volume: .6 };
        f.S.previewPortVolume('port', .8, .7);
        f.state.portVolumes.port = .5;
        f.S.update({ outputVolume: .5 }, 'unrelated-before-pagehide');
        f.handlers.get('pagehide')();
        assert.equal(JSON.parse(f.storage.get('eveAudioflixFallbackState')).music[1].volume, .6,
            'pagehide must not commit a superseded row gesture');
        assert.equal(f.state.music[1].volume, .6); await Promise.resolve();
        const staleCalls = f.calls();
        assert.equal(f.S.commitItemVolume('music', '1', .9), false, 'late frontend pagehide commit must retain replacement rejection');
        assert.equal(f.S.commitPortVolume('port', .8), false, 'late frontend pagehide commit must retain external override rejection');
        assert.equal(f.state.music[1].volume, .6); assert.equal(f.state.portVolumes.port, .5);
        assert.equal(f.calls(), staleCalls);
    });
    await test('fallback-only-preview-retains-canonical-live-row', async () => {
        const f = fixture(3);
        f.storage.set('eveAudioflixFallbackState', JSON.stringify(f.state));
        delete f.window.eveState.config;
        const live = f.S.ensure(), row = live.music[1];
        f.S.previewItemVolume('music', '1', .8);
        f.S.updateItem('music', '0', { title: 'Fallback metadata' });
        assert.equal(f.S.ensure(), live, 'immediate fallback mirror must not install the baseline projection as live state');
        assert.equal(JSON.parse(f.storage.get('eveAudioflixFallbackState')).music[1].volume, .2);
        await f.S.flush('fallback-held');
        assert.equal(f.S.ensure(), live); assert.equal(row.volume, .8);
        assert.equal(f.S.previewItemVolume('music', '1', .9), true);
        assert.equal(f.S.commitItemVolume('music', '1', .9), true);
        await f.S.flush('fallback-final');
        assert.equal(JSON.parse(f.storage.get('eveAudioflixFallbackState')).music[1].volume, .9);
    });
    await test('durable-setter-indexed', () => {
        const f = fixture(200);
        for (let i = 0; i < 10; i += 1) f.S.setItemVolume('music', '100', i / 10);
        evidence.legacyIdReads = f.reads();
        assert.ok(f.reads() <= 400, 'durable setter must not scan the entire library for every volume write');
    });
    await test('25000-transient-final-once', async () => {
        const f = fixture(25000), row = f.state.music[12345], revision = f.S.getRevision(), before = f.calls();
        for (let i = 0; i < 1000; i += 1) assert.equal(f.S.previewItemVolume('music', '12345', i / 1000), true);
        evidence.previewIdReads = f.reads();
        assert.ok(f.reads() <= 30000, 'one cold ID index, not 25k scans for each transient input');
        assert.equal(f.S.getRevision(), revision); assert.equal(f.calls(), before); assert.equal(f.timers.size, 0);
        assert.equal(f.state.music[12345], row); assert.equal(row.volume, .999);
        assert.equal(f.S.commitItemVolume('music', 12345, .999), true);
        assert.equal(f.S.getRevision(), revision + 1); assert.equal(f.calls(), before + 1);
        assert.equal(f.state.portVolumes['12345'], .999);
        assert.equal((await f.S.flush('volume-proof')).written, true);
        assert.equal(JSON.parse(f.storage.get('eveAudioflixFallbackState')).music[12345].volume, .999);
        const steady = f.calls();
        assert.equal(f.S.previewItemVolume('music', '12345', .999), true);
        assert.equal(f.S.commitItemVolume('music', '12345', .999), true);
        assert.equal(f.calls(), steady, 'unchanged gesture must not manufacture another save');
    });
    await test('replacement-deletion-collision', () => {
        const f = fixture(3), old = f.state.music[1];
        assert.equal(f.S.previewItemVolume('music', '1', .7), true);
        const replacement = { ...old, volume: .3 };
        f.S.update({ music: [f.state.music[0], replacement, f.state.music[2]] }, 'fixture-replace');
        const before = f.calls();
        assert.equal(f.S.previewItemVolume('music', '1', .8), false, 'late input cannot adopt same-ID replacement');
        assert.equal(f.S.commitItemVolume('music', '1', undefined), false, 'captured old row cannot mutate same-ID replacement');
        assert.equal(replacement.volume, .3); assert.equal(f.calls(), before);
        assert.equal(f.S.previewItemVolume('music', 1, .5), true);
        assert.equal(f.S.commitItemVolume('music', '1', .5), true);
        f.S.previewItemVolume('music', '1', .8); f.S.removeItem('music', '1');
        const removed = f.calls();
        assert.equal(f.S.commitItemVolume('music', '1', .8), false); assert.equal(f.calls(), removed);
        f.S.addItem('music', { id: 'new', url: 'https://example.invalid/new', volume: .4 });
        assert.equal(f.S.previewItemVolume('music', 'new', .6), true); assert.equal(f.S.commitItemVolume('music', 'new', .6), true);
        const array = f.state.music, direct = array[0];
        f.S.previewItemVolume('music', direct.id, .9);
        array[0] = { ...direct, volume: .3 };
        assert.equal(f.S.previewItemVolume('music', direct.id, .8), false, 'same-array/same-length row replacement retires gesture');
        assert.equal(f.S.commitItemVolume('music', direct.id, undefined), false);
        assert.equal(array[0].volume, .3);
        const oldId = array[0].id;
        array[0] = { ...array[0], id: 'direct-new' };
        assert.equal(f.S.previewItemVolume('music', oldId, .8), false, 'removed stale ID cannot update detached object');
        assert.equal(f.S.previewItemVolume('music', 'direct-new', .6), true);
        assert.equal(f.S.commitItemVolume('music', 'direct-new', .6), true);
        f.S.update({ music: [{ ...replacement, id: '1' }, { ...replacement, id: 1 }] }, 'fixture-collision');
        const collided = f.calls();
        assert.equal(f.S.previewItemVolume('music', 1, .9), false); assert.equal(f.S.commitItemVolume('music', '1', .9), false);
        assert.equal(f.calls(), collided);
        f.S.update({ music: [{ ...replacement, id: 'new', volume: .1 }] }, 'fixture-fresh');
        assert.equal(f.S.previewItemVolume('music', 'new', .2), true);
        f.S.replaceState({ music: [{ ...replacement, id: 'new', volume: .3 }] }, 'fixture-state');
        assert.equal(f.S.commitItemVolume('music', 'new', .2), false);
    });
    await test('explicit-ported-and-legacy-compatible', () => {
        const f = fixture(1), before = f.calls();
        assert.equal(f.S.previewItemVolume('sound', 'external', .7), false, 'canonical API rejects unknown IDs');
        assert.equal(f.S.commitItemVolume('sound', 'external', .7), false);
        for (let i = 0; i < 100; i += 1) assert.equal(f.S.previewPortVolume('external', i / 100, .2), true);
        assert.equal(f.calls(), before); assert.equal(f.S.commitPortVolume('external', .99), true);
        assert.equal(f.calls(), before + 1); assert.equal(f.state.portVolumes.external, .99);
        assert.equal(f.S.setItemVolume('sound', 'legacy-external', .4), f.state);
        assert.equal(f.state.portVolumes['legacy-external'], .4);
    });
    await test('incremental-scope-search-and-content-revision', () => {
        const f = fixture(25000), index = f.window.EveAudioflixLibraryIndex;
        const view = index.get(f.state, 'music'), docs = view.docs(), content = view.contentRevision;
        f.resetReads();
        f.S.previewItemVolume('music', '12', .8); f.S.commitItemVolume('music', '12', .8);
        f.S.recordPlay(f.state.music[12]);
        assert.equal(index.get(f.state, 'music'), view); assert.equal(view.contentRevision, content);
        assert.equal(view.docs(), docs, 'volume/play must not rebuild normalized search documents');
        f.S.updateItem('music', '12', { title: 'Needle title', album: 'Needle album', folder: ' Exact folder ',
            artist: 'Needle artist', classifiers: ['Needle class'], playlistId: 'Needle playlist', sourceProvider: 'synthetic' });
        f.S.toggleMusicGroup('12', 'Needle group', true);
        assert.ok(view.contentRevision > content);
        for (const [dimension, key] of [['folder', 'Exact folder'], ['artist', 'Needle artist'],
            ['classifier', 'Needle class'], ['playlist', 'Needle playlist'], ['provider', 'SYNTHETIC'], ['group', 'Needle group']]) {
            assert.equal(view.scope(dimension, key)[0], f.state.music[12]);
        }
        assert.equal(view.scope('folder', 'exact folder').length, 0, 'folder scope is exact-case compatible');
        assert.equal(view.scope('group', 'NEEDLE GROUP')[0], f.state.music[12], 'group aliases retain case-insensitive membership');
        assert.equal(view.docFor(f.state.music[12]).item, f.state.music[12]);
        assert.equal(view.docFor({ ...f.state.music[12] }), null, 'foreign/copied rows cannot poison canonical normalized docs');
        assert.ok(view.docs().find(doc => doc.item.id === '12').haystack.includes('needle album'));
        assert.ok(view.docs().find(doc => doc.item.id === '12').haystack.includes('needle group'));
        f.S.addItem('music', { id: 'added', url: 'https://example.invalid/added', title: 'New needle', folder: 'Exact folder' });
        assert.equal(index.get(f.state, 'music'), view, 'notified add adopts source/length without cold rebuilding');
        assert.equal(view.getById('added').title, 'New needle');
        assert.ok(f.reads() <= 100, 'ordinary metadata edit/add must not rescan 25k item IDs');
        f.S.removeItem('music', 'added');
        assert.equal(index.get(f.state, 'music'), view, 'notified deletion preserves unaffected projections');
        assert.equal(view.getById('added'), null); assert.equal(view.scope('folder', 'Exact folder').length, 1);
        assert.ok(f.reads() <= 25200, 'removal may compact the array once, never rebuild normalized ID/search projections');
        const before = view.contentRevision;
        f.S.update({ music: [...f.state.music] }, 'fixture-replacement');
        const replaced = index.get(f.state, 'music');
        assert.equal(replaced, view, 'same-row bulk replacement reconciles the existing API');
        assert.ok(replaced.contentRevision > before, 'bulk replacement still invalidates content revision');
        assert.throws(() => { replaced.docs()[0].haystack = 'poison'; }, TypeError);
        assert.throws(() => { replaced.docs().push({}); }, { name: 'TypeError' });
        const oldRow = replaced.getById('12'), oldDoc = replaced.docFor(oldRow), clonedRevision = replaced.contentRevision;
        f.S.update({ music: f.state.music.map(row => row === oldRow ? { ...row, title: 'Clone lookup needle',
            url: 'https://example.invalid/cloned-12.mp3', folder: 'Clone folder' } : row) }, 'fixture-cloned-row');
        const cloned = index.get(f.state, 'music'), clonedRow = f.state.music.find(row => row.id === '12');
        assert.equal(cloned, replaced, 'one cloned row reconciles unaffected canonical rows');
        assert.ok(cloned.contentRevision > clonedRevision);
        assert.notEqual(clonedRow, oldRow); assert.equal(cloned.getById('12'), clonedRow);
        assert.equal(cloned.getById('12').url, 'https://example.invalid/cloned-12.mp3');
        assert.equal(cloned.search('clone lookup needle').items[0], clonedRow);
        assert.equal(cloned.search('needle title').total, 0, 'old title cannot survive a cloned-row replacement');
        assert.equal(cloned.docFor(oldRow), null); assert.equal(cloned.docFor(clonedRow).item, clonedRow);
        assert.ok(oldDoc.haystack.includes('needle title'), 'previous immutable document keeps its captured metadata');
        assert.equal(cloned.scope('folder', 'Exact folder').length, 0);
        assert.equal(cloned.scope('folder', 'Clone folder')[0], clonedRow);
        assert.equal(cloned.scope('group', 'NEEDLE GROUP')[0], clonedRow);
        const freshRevision = cloned.contentRevision;
        f.S.update({ music: f.state.music.map(row => ({ ...row, ...(row.id === '12' ? {
            title: 'Fresh lookup needle', url: 'https://example.invalid/fresh-12.mp3' } : {}) })) }, 'fixture-fresh-rows');
        const fresh = index.get(f.state, 'music'), freshRow = f.state.music.find(row => row.id === '12');
        assert.ok(fresh.contentRevision > freshRevision, 'fully fresh canonical rows invalidate content too');
        assert.notEqual(freshRow, clonedRow); assert.equal(fresh.getById('12'), freshRow);
        assert.equal(fresh.getById('12').url, 'https://example.invalid/fresh-12.mp3');
        assert.equal(fresh.search('fresh lookup needle').items[0], freshRow);
        assert.equal(fresh.search('clone lookup needle').total, 0);
        assert.equal(fresh.docFor(clonedRow), null); assert.equal(fresh.docFor(freshRow).item, freshRow);
        assert.equal(fresh.scope('group', 'Needle group')[0], freshRow);
        assert.throws(() => { fresh.docs()[0].haystack = 'poison'; }, TypeError);
        assert.throws(() => { fresh.docs().push({}); }, { name: 'TypeError' });
        const removedRevision = fresh.contentRevision;
        f.S.removeItem('music', '12');
        assert.equal(index.get(f.state, 'music'), fresh);
        assert.ok(fresh.contentRevision > removedRevision);
        assert.equal(fresh.getById('12'), null); assert.equal(fresh.search('fresh lookup needle').total, 0);
        assert.equal(fresh.scope('folder', 'Clone folder').length, 0);
        assert.equal(fresh.scope('group', 'Needle group').length, 0);
        assert.equal(fresh.getById('0'), f.state.music[0], 'removal preserves unrelated canonical lookups');
    });
    await test('telemetry-failure-does-not-change-write-outcome', async () => {
        const f = fixture(1);
        f.window.EveAudioflixDiagnostics = { increment() { throw new Error('optional diagnostic'); },
            gauge() { throw new Error('optional diagnostic'); }, span() { throw new Error('optional diagnostic'); } };
        assert.equal(f.S.previewItemVolume('music', '0', .7), true);
        assert.equal(f.S.commitItemVolume('music', '0', .7), true);
        assert.equal((await f.S.flush('diagnostic-failure')).written, true);
        f.window.saveConfig = async () => { throw new Error('actual durable failure'); };
        await assert.rejects(f.S.flush('real-failure'), /actual durable failure/, 'operation failures must still propagate');
    });
    await test('numeric-removal-retires-topology', () => {
        const f = fixture(2);
        f.S.update({ musicGroupMap: { '1': ['Group'] }, scopeBindings: [{ audioId: '1', audioType: 'music' }],
            dupDismissedPairs: ['0|1'] }, 'fixture-topology');
        f.S.removeItem('music', 1);
        assert.equal(f.state.music.length, 1); assert.equal(f.state.musicGroupMap['1'], undefined);
        assert.equal(f.state.scopeBindings.length, 0); assert.equal(f.state.dupDismissedPairs.length, 0);
    });
    evidence.ok = true;
    console.log(`AUDIOFLIX_VOLUME_MUTATION_SMOKE_OK ${evidence.cases.length}/${evidence.cases.length} indexed25000=true transient1000=true finalOneSave=true`);
} catch (error) {
    evidence.error = { id: current, message: error.message, stack: error.stack };
    console.error(`AUDIOFLIX_VOLUME_MUTATION_SMOKE_FAIL ${current}: ${error.message}\nArtifact: ${path.relative(ROOT, artifact)}`);
    process.exitCode = 1;
} finally {
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
}
