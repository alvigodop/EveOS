/**
 * audioflix_state_recovery_smoke.js
 *
 * The music library could be destroyed by a single failed read.
 *
 * The fallback store parsed with `JSON.parse(...) catch { return {} }`. Any damaged blob -- a write
 * truncated by a full quota, a tab killed mid-save -- therefore came back as an EMPTY library rather
 * than as an error. Nothing looked broken; there were simply no songs. The next ordinary save then
 * wrote that emptiness over the damaged-but-still-present original, and the only copy was gone.
 *
 * Two guarantees are enforced here, and both are about not destroying what cannot be rebuilt:
 * unreadable data is copied aside before anything may overwrite it, and an empty state is never
 * allowed to silently replace a populated one. Clearing the library on purpose still works.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'js', 'modules', 'features', 'audioflix', 'audioflix.state.recovery.js');
const KEY = 'eveAudioflixFallbackState';

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function load(initial = {}, { failWrites = false } = {}) {
    const store = { ...initial };
    const warnings = [];
    const sandbox = {
        console: { log() {}, warn: (m) => warnings.push(String(m)), error: (m) => warnings.push(String(m)) },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => {
                if (failWrites) throw new Error('QuotaExceededError');
                store[k] = String(v);
            },
            removeItem: (k) => { delete store[k]; }
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), sandbox);
    return { api: sandbox.window.EveAudioflixStateRecovery, store, warnings };
}

const LIBRARY = { music: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], audiobooks: [{ id: 'd' }] };

function main() {
    // ---- a healthy round trip is untouched ----
    let env = load({ [KEY]: JSON.stringify(LIBRARY) });
    let result = env.api.read(KEY);
    assert(result.damaged === false, 'valid data is not reported as damaged');
    assert(env.api.countEntries(result.state) === 4, 'every entry survives the read');

    // ---- damaged data must NOT masquerade as an empty library ----
    env = load({ [KEY]: '{"music":[{"id":"a"},{"id"' });   // truncated mid-write
    result = env.api.read(KEY);
    assert(result.damaged === true,
        'unreadable data reports as damaged rather than as an empty library');
    assert(result.quarantinedAt === `${KEY}.corrupt`, 'the raw text is copied aside');
    assert(typeof env.store[`${KEY}.corrupt`] === 'string',
        'a quarantine copy actually exists, rather than merely being reported');
    assert(env.store[`${KEY}.corrupt`].startsWith('{"music"'),
        'the quarantined copy holds the original bytes, so it can be recovered by hand');
    assert(env.store[KEY] === '{"music":[{"id":"a"},{"id"',
        'the damaged original is left in place; quarantining is a copy, never a move');

    // ---- and the write guard is what actually prevents the wipe ----
    let written = env.api.write(KEY, {});
    assert(written.written === false, 'an empty save over unreadable data is refused');
    assert(env.store[KEY] === '{"music":[{"id":"a"},{"id"', 'so the original is still there');

    // ---- empty must not replace a populated library by accident ----
    env = load({ [KEY]: JSON.stringify(LIBRARY) });
    written = env.api.write(KEY, { music: [], audiobooks: [] });
    assert(written.written === false, 'an accidental empty save is refused');
    assert(env.api.countEntries(env.api.read(KEY).state) === 4, 'all four entries remain');
    assert(env.warnings.some((w) => w.includes('Refused')), 'and the refusal is reported, not silent');

    // ---- but a deliberate clear still works ----
    written = env.api.write(KEY, { music: [], audiobooks: [] }, { allowEmpty: true });
    assert(written.written === true, 'an explicit clear is honoured');
    assert(env.api.countEntries(env.api.read(KEY).state) === 0, 'and empties the library');

    // ---- normal saves are never impeded ----
    env = load({ [KEY]: JSON.stringify(LIBRARY) });
    written = env.api.write(KEY, { music: [{ id: 'a' }, { id: 'b' }], audiobooks: [] });
    assert(written.written === true, 'a smaller but non-empty save goes through');
    assert(env.api.countEntries(env.api.read(KEY).state) === 2, 'removing tracks still works');

    // ---- a first run has nothing to protect ----
    env = load({});
    written = env.api.write(KEY, {});
    assert(written.written === true, 'an empty save against an empty store is fine');

    // ---- a full quota must not be mistaken for success ----
    env = load({ [KEY]: JSON.stringify(LIBRARY) }, { failWrites: true });
    written = env.api.write(KEY, { music: [{ id: 'a' }] });
    assert(written.written === false, 'a failed write reports failure rather than claiming success');

    console.log('audioflix state recovery OK — damaged data quarantined, empty never wipes populated');
    console.log('AUDIOFLIX_STATE_RECOVERY_SMOKE_OK');
}

main();
