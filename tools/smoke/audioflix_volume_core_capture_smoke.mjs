import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'js/modules/core/storage.js'), 'utf8');
const deltaSource = fs.readFileSync(path.join(root, 'js/modules/core/storage.delta.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const artifact = path.join(root, `data/runtime/smoke-results/audioflix-volume-core-capture-${Date.now()}.json`);
const queuedEvidence = [];
let cases = 0;
for (const indexed of [true, false]) {
    const writes = [], history = [], config = { theme: 'dark', audioflix: { music: [{ id: 'a', volume: .8 }] } };
    let original = .2, preview = true, fail = false;
    const window = { eveState: { config }, EveEditHistory: { recordConfigMutation: item => history.push(item) },
        EveAudioflixState: { durableSnapshot(input) {
            if (fail) throw Error('projection failure');
            const snapshot = copy(input);
            if (preview) snapshot.music[0].volume = original;
            return snapshot;
        } } };
    const storage = indexed ? { syncThemeBootConfig() {}, getThemeBootConfig: value => ({ theme: value.theme }),
        saveJson: async (_key, value) => { writes.push(copy(value)); return true; } } : null;
    const context = vm.createContext({ window, config, console, setTimeout, clearTimeout,
        localStorage: { setItem(_key, value) { writes.push(JSON.parse(value)); } },
        normalizeMutationSource: value => value, buildStateSignature: value => JSON.stringify(value),
        buildConfigDelta: (before, after) => ({ before, after }), cloneConfigForDelta: copy,
        getCoreStorage: () => storage, dispatchStateMutation() {}, buildStateMutationMeta: () => ({}) });
    vm.runInContext(source, context);
    await context.saveConfig({ immediate: true, source: 'unrelated-save' });
    assert.equal(writes.length, 1); assert.equal(writes[0].audioflix.music[0].volume, .2);
    assert.equal(history[0].after.audioflix.music[0].volume, .2);
    assert.equal(context.config, config); assert.equal(window.eveState.config, config);
    assert.equal(config.audioflix.music[0].volume, .8, 'Live preview is never swapped or reverted');
    config.audioflix.music[0].volume = .9;
    await context.saveConfig({ immediate: true });
    assert.equal(writes.length, 1, 'Transient gain cannot dirty the durable config signature');
    context.markConfigClean();
    await context.saveConfig({ immediate: true });
    assert.equal(writes.length, 1, 'Clean-marking also signs the committed projection');
    config.theme = 'light';
    await context.saveConfig({ immediate: true });
    assert.equal(writes.length, 2); assert.equal(writes[1].theme, 'light');
    assert.equal(writes[1].audioflix.music[0].volume, .2);
    preview = false;
    await context.saveConfig({ immediate: true });
    assert.equal(writes.length, 3); assert.equal(writes[2].audioflix.music[0].volume, .9);
    assert.equal(history.at(-1).before.audioflix.music[0].volume, .2);
    fail = true; config.theme = 'blocked';
    assert.throws(() => context.saveConfig({ immediate: true }), /projection failure/);
    assert.equal(writes.length, 3, 'Broken projection must not overwrite good persisted state');
    assert.equal(context.config, config);
    cases += 1;
}

async function queuedCapture(mode) {
    const config = { theme: 'dark', reader: { nested: { choice: 'captured' }, list: ['original'] },
        audioflix: { music: [{ id: 'a', title: 'Captured title', volume: .8 }] } };
    if (mode === 'unstable') config.reader.self = config.reader;
    const queue = [], writes = [], history = [], events = [], warnings = [];
    let storageClones = 0;
    const storage = { syncThemeBootConfig() {}, getThemeBootConfig: value => ({ theme: value.theme }),
        saveJson: (_key, value, options) => new Promise(resolve => queue.push({ options, release() {
            let selected = value;
            if (!options.skipClone) { storageClones += 1; try { selected = copy(value); } catch { /* Existing ordinary-clone fallback. */ } }
            writes.push(structuredClone(selected)); resolve(true);
        } })) };
    const window = { eveState: { config }, EveCoreStorage: storage,
        EveEditHistory: { recordConfigMutation: item => history.push(item) },
        dispatchEvent: event => events.push(event.detail),
        EveAudioflixState: { durableSnapshot(input) { const snapshot = copy(input); snapshot.music[0].volume = .2; return snapshot; } } };
    const context = vm.createContext({ window, config, setTimeout, clearTimeout,
        console: { ...console, warn: (...args) => warnings.push(args.map(String).join(' ')) },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
    vm.runInContext(deltaSource, context, { filename: 'storage.delta.js' });
    vm.runInContext(source, context, { filename: 'storage.js' });
    if (mode === 'null') context.cloneConfigForDelta = () => null;
    try {
        const pending = context.saveConfig({ immediate: true, source: 'queued-capture' });
        assert.equal(queue.length, 1);
        const options = queue[0].options;
        if (mode === 'stable') {
            config.reader.nested.choice = 'later'; config.reader.list.push('later');
            config.audioflix.music[0].title = 'Later title'; config.audioflix.music[0].volume = .9;
        }
        queue.shift().release(); await pending;
        const captured = writes[0];
        queuedEvidence.push({ mode, skipClone: options.skipClone === true, storageClones,
            gain: captured.audioflix.music[0].volume, choice: captured.reader.nested.choice, warnings });
        assert.equal(captured.audioflix.music[0].volume, .2, 'Queued storage retains committed gain rather than live preview');
        assert.equal(config.audioflix.music[0].volume, mode === 'stable' ? .9 : .8, 'Capture cannot replace live gain');
        assert.equal(history.length, 1, 'Capture cannot skip ordinary edit history');
        assert.equal(events.length, 1, 'Capture cannot suppress config mutation delivery');
        assert.equal(events[0].meta.configDelta.kind, 'core-config-delta', 'Real delta remains published');
        if (mode === 'stable') {
            assert.equal(captured.reader.nested.choice, 'captured', 'Queued write freezes non-audio nested config at capture');
            assert.deepEqual(captured.reader.list, ['original']);
            assert.equal(captured.audioflix.music[0].title, 'Captured title');
            assert.equal(options.skipClone, true, 'Detached full-config snapshot avoids a second storage JSON clone');
            assert.equal(storageClones, 0);
            const next = context.saveConfig({ immediate: true, meta: { skipEditHistory: true } });
            queue.shift().release(); await next;
            assert.equal(writes[1].reader.nested.choice, 'later', 'In-place same-array/object mutations must invalidate the durable signature');
            assert.equal(writes[1].audioflix.music[0].title, 'Later title');
            assert.equal(history.length, 1, 'Explicit skipEditHistory still works');
            assert.equal(events.length, 2); assert.equal(storageClones, 0);
            assert.ok(events[1].meta.configDelta.changedKeys.includes('reader'));
            assert.ok(events[1].meta.configDelta.changedKeys.includes('audioflix'));
        } else {
            assert.notEqual(options.skipClone, true, 'Null/unstable capture must retain ordinary backend cloning');
            assert.equal(storageClones, 1);
            if (mode === 'unstable') { assert.equal(captured.reader.self, captured.reader); assert.equal(warnings.length, 1); }
        }
        cases += 1;
    } finally {
        fs.mkdirSync(path.dirname(artifact), { recursive: true });
        fs.writeFileSync(artifact, JSON.stringify({ queuedEvidence }, null, 2));
    }
}
for (const mode of ['stable', 'null', 'unstable']) await queuedCapture(mode);
console.log(`AUDIOFLIX_VOLUME_CORE_CAPTURE_SMOKE_OK ${cases}/${cases} indexed=true fallback=true queued=true cloneReuse=true history=true liveUnchanged=true`);
