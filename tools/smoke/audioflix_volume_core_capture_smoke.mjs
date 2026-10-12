import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'js/modules/core/storage.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
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
console.log(`AUDIOFLIX_VOLUME_CORE_CAPTURE_SMOKE_OK ${cases}/${cases} indexed=true fallback=true signatures=true history=true liveUnchanged=true`);
