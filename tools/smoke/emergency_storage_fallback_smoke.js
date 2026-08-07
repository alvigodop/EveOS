/**
 * emergency_storage_fallback_smoke.js
 *
 * The emergency StorageManager fallback could never fire.
 *
 * Its guard was `if (!window.StorageManager)`. But Chromium always defines a native StorageManager
 * — the constructor behind navigator.storage — so that check was satisfied on every browser, always.
 * The single situation the fallback exists to cover, the real scraper module failing to load, is the
 * one it slept through. Worse than dead code: dead code that looks like a safety net.
 *
 * The real module is an object carrying get/set/loadData. The native global is a *function*. Probing
 * for the shape we depend on separates them, and `get` specifically is present on the emergency stub
 * too, so installing the stub satisfies the probe rather than re-triggering it forever.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const EF_CORE = path.join(ROOT, 'js', 'modules', 'features', 'scraper', 'core',
    'emergency-fallbacks', 'components', 'ef-core.js');
const REAL = path.join(ROOT, 'js', 'modules', 'features', 'scraper', 'storage', 'storage-manager.js');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

/** Stands in for Chromium's built-in StorageManager interface. */
function NativeStorageManager() {}

function loadCore(preexisting) {
    const warnings = [];
    const sandbox = {
        console: { log() {}, warn: (m) => warnings.push(String(m)), error() {} },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    };
    sandbox.window = sandbox;
    if (preexisting !== undefined) sandbox.window.StorageManager = preexisting;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(EF_CORE, 'utf8'), sandbox);
    return { sandbox, warnings, core: sandbox.window.EmergencyFallbacksCore };
}

function main() {
    // ---- the real module has the shape the probe looks for ----
    const realSource = fs.readFileSync(REAL, 'utf8');
    assert(/StorageManager\.get\s*=/.test(realSource),
        'the real StorageManager exposes get(), which is what the probe keys on');

    // ---- native-only: the fallback MUST engage ----
    let env = loadCore(NativeStorageManager);
    assert(typeof env.sandbox.window.StorageManager === 'function',
        'precondition: the native interface is a function, and truthy');
    env.core._ensureStorageManager();
    assert(typeof env.sandbox.window.StorageManager === 'object',
        'with only the native interface present the emergency implementation is installed');
    assert(env.sandbox.window.StorageManager._isEmergencyImplementation === true,
        'and it is the emergency one');
    assert(env.warnings.some((w) => w.includes('emergency')), 'the substitution is announced');

    // ---- the real module present: the fallback must NOT clobber it ----
    const real = { get() {}, set() {}, loadData() {}, version: '1.1.0-facade' };
    env = loadCore(real);
    env.core._ensureStorageManager();
    assert(env.sandbox.window.StorageManager === real,
        'a properly loaded StorageManager is left completely alone');
    assert(env.warnings.length === 0, 'and nothing is warned about');

    // ---- running twice must not reinstall: the stub satisfies its own probe ----
    env = loadCore(NativeStorageManager);
    env.core._ensureStorageManager();
    const installed = env.sandbox.window.StorageManager;
    env.core._ensureStorageManager();
    assert(env.sandbox.window.StorageManager === installed,
        'the stub satisfies the probe, so a second pass does not rebuild it');
    assert(env.warnings.length === 1, 'and does not warn a second time');

    // ---- nothing defined at all: still engages ----
    env = loadCore(undefined);
    env.core._ensureStorageManager();
    assert(env.sandbox.window.StorageManager?._isEmergencyImplementation === true,
        'an entirely absent StorageManager is still covered');

    console.log('emergency storage fallback OK — fires against the native global, spares the real one');
    console.log('EMERGENCY_STORAGE_FALLBACK_SMOKE_OK');
}

main();
