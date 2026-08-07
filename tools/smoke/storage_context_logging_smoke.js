/**
 * storage_context_logging_smoke.js
 *
 * A single search logged "StorageManager: Context set to [...]" several hundred times.
 *
 * Scoped cache reads and writes wrap every operation in a push/pop: set the context to the category
 * being read, do the work, then restore the previous one. Each half logged unconditionally. Worse,
 * the two halves differ only in case -- normalizeCategoryName lowercases, the restored value does
 * not -- so the log alternated [NewTest] / [newtest] forever without anything actually changing.
 *
 * Hundreds of console.log calls during one search is not free with devtools attached, and it buried
 * every other message in the log.
 *
 * The fix is deliberately narrow: only the LOGGING is suppressed. The assignment still happens
 * whenever the value differs at all, because getScopedStorageValue in api-manager-prefs.js compares
 * the context case-SENSITIVELY -- normalising what gets stored would quietly move it onto its
 * manual-prefix branch. Same keys either way, but not a change worth making silently.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'js', 'modules', 'features', 'scraper', 'storage', 'storage-manager.js');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

function loadManager() {
    const logs = [];
    const sandbox = {
        console: { log: (m) => logs.push(String(m)), warn() {}, error() {} },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        CustomEvent: function () {},
        setTimeout, clearTimeout
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8') + '\n;globalThis.__SM = StorageManager;', sandbox);
    // The module prints its own init line on load; only context lines are under test here.
    const contextLines = () => logs.filter((line) => line.includes('Context set to'));
    return {
        manager: sandbox.__SM,
        logs: { get length() { return contextLines().length; }, at: (i) => contextLines()[i] }
    };
}

function main() {
    const { manager, logs } = loadManager();

    // ---- a real change is still reported; you must be able to see the context move ----
    manager.setCategoryContext('Root');
    manager.setCategoryContext('NewTest');
    assert(logs.length === 2, `a genuine context change is logged (got ${logs.length})`);
    assert(logs.at(1).includes('NewTest'), 'the new context appears in the line');

    // ---- the push/pop dance around 200 cache operations must stay quiet ----
    const before = logs.length;
    for (let i = 0; i < 200; i += 1) {
        manager.setCategoryContext('newtest');          // push (normalizeCategoryName lowercases)
        manager.setCategoryContext('NewTest');          // pop  (restores the original casing)
    }
    assert(logs.length === before,
        `400 scoped push/pops that change no storage prefix log nothing (got ${logs.length - before})`);

    // ---- ...but the value is still tracked exactly, for the case-sensitive comparison ----
    assert(manager.categoryContext === 'NewTest',
        'the exact casing is preserved, so getScopedStorageValue keeps taking its loadData branch');
    manager.setCategoryContext('newtest');
    assert(manager.categoryContext === 'newtest',
        'a differing value is still assigned even when it is only a case change');

    // ---- and both casings resolve to one storage key, which is why suppressing is safe ----
    assert(manager._getPrefixedKey('wikiEntries') === 'newtest_wikiEntries',
        'the prefix is lowercased, so the alternating casings addressed the same key all along');

    // ---- a genuinely new category speaks up again ----
    const quiet = logs.length;
    manager.setCategoryContext('Another Card');
    assert(logs.length === quiet + 1, 'moving to a different category is reported');
    assert(manager._getPrefixedKey('wikiEntries') === 'another_card_wikiEntries',
        'whitespace still normalises to underscores in the key');

    // ---- null restore (no previous context) must not throw ----
    manager.setCategoryContext(null);
    assert(manager.categoryContext === null, 'clearing the context is allowed');
    assert(manager._getPrefixedKey('wikiEntries') === 'global_wikiEntries',
        'a cleared context falls back to the global prefix rather than crashing');

    console.log(`storage context logging OK — 400 push/pops logged 0 lines, real changes still logged`);
    console.log('STORAGE_CONTEXT_LOGGING_SMOKE_OK');
}

main();
