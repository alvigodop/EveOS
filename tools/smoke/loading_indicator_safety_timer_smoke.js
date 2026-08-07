/**
 * loading_indicator_safety_timer_smoke.js
 *
 * "[LoadingIndicator] Safety timeout — auto-dismissing stuck searching state" was appearing after
 * perfectly normal searches.
 *
 * The watchdog starts whenever the indicator goes into its searching state, but the finishing path
 * -- updateEnhanced(false, ...) -- returned without clearing it. Only forceReset() ever did. So each
 * completed search left a live 45-second timer behind.
 *
 * The warning was the harmless half. The timer fires updateEnhanced(false, 'Idle') unconditionally,
 * without checking whether a NEW search has since begun. Run a second search within 45 seconds of
 * the first finishing -- which is simply what using the thing looks like -- and the first search's
 * orphaned timer tears the second one down while it is still running.
 *
 * Driven through the real module with a fake clock and a stub DOM.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'js', 'modules', 'features', 'scraper', 'ui', 'loading-indicator',
    'components', 'li-display.js');

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

/** Minimal element that satisfies the classList/querySelector calls the module makes. */
function makeIndicator() {
    const classes = new Set();
    return {
        style: {},
        classList: {
            add: (c) => classes.add(c),
            remove: (...c) => c.forEach((x) => classes.delete(x)),
            toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
            contains: (c) => classes.has(c)
        },
        querySelector: () => ({ textContent: '', style: {} }),
        _classes: classes
    };
}

function load() {
    const timers = new Map();
    let now = 0;
    let nextId = 1;
    const warnings = [];
    const indicator = makeIndicator();

    const sandbox = {
        console: { log() {}, warn: (m) => warnings.push(String(m)), error() {} },
        document: {
            getElementById: (id) => (id === 'loadingIndicator' ? indicator : null),
            querySelector: () => null
        },
        setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => { timers.delete(id); }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), sandbox);

    const helpers = sandbox.window.LoadingIndicatorModules.createDisplayHelpers({
        api: { _ensureTopLevel() {} }
    });

    return {
        helpers,
        indicator,
        warnings,
        pendingTimers: () => timers.size,
        advance(ms) {
            now += ms;
            [...timers.entries()]
                .filter(([, t]) => t.at <= now)
                .forEach(([id, t]) => { timers.delete(id); t.fn(); });
        }
    };
}

function main() {
    const SAFETY_MS = 45000;

    // ---- a finished search must not leave its watchdog running ----
    let env = load();
    env.helpers.updateEnhanced(true, 'Searching...');
    assert(env.pendingTimers() === 1, 'starting a search arms the watchdog');
    env.helpers.updateEnhanced(false, 'Idle');
    assert(env.pendingTimers() === 0,
        'finishing a search retires its watchdog, so it cannot fire against a later search');

    env.advance(SAFETY_MS * 2);
    assert(env.warnings.length === 0,
        `a normal search never produces the safety-timeout warning (got ${env.warnings.join(' | ')})`);

    // ---- the real damage: a stale timer must not dismiss the NEXT search ----
    env = load();
    env.helpers.updateEnhanced(true, 'Searching...');     // search 1
    env.helpers.updateEnhanced(false, 'Idle');            // search 1 completes
    env.advance(30000);                                   // 30s later, well inside the old window
    env.helpers.updateEnhanced(true, 'Searching...');     // search 2 begins
    assert(env.indicator.classList.contains('searching'), 'search 2 is running');

    env.advance(20000);   // now 50s past search 1 -- its orphaned timer would have fired by here
    assert(env.indicator.classList.contains('searching'),
        'search 2 survives; a previous search cannot tear down the one now running');
    assert(env.warnings.length === 0, 'and no spurious timeout warning is emitted');

    // ---- the watchdog still works when a search genuinely hangs ----
    env = load();
    env.helpers.updateEnhanced(true, 'Searching...');
    env.advance(SAFETY_MS + 1000);
    assert(env.warnings.some((w) => w.includes('Safety timeout')),
        'a search that really does hang is still auto-dismissed');
    assert(!env.indicator.classList.contains('searching'), 'and the stuck state is cleared');

    // ---- re-arming replaces rather than stacks ----
    env = load();
    for (let i = 0; i < 5; i += 1) env.helpers.updateEnhanced(true, 'Searching...');
    assert(env.pendingTimers() === 1, 'progress updates re-arm one watchdog rather than stacking five');

    console.log('loading indicator safety timer OK — cleared on finish, still fires on a real hang');
    console.log('LOADING_INDICATOR_SAFETY_TIMER_SMOKE_OK');
}

main();
